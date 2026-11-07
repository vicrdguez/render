//! The pure host reducer. It writes only the host mirror; it cannot name device state.

use crate::model::*;

/// What one inbound message did to the mirror.
#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct HostOutcome {
    pub applied: bool,
    /// Scopes to resnapshot, each once.
    pub resnapshot: Vec<Scope>,
    /// The epoch changed (or appeared or vanished) under existing state.
    pub discontinuity: bool,
}

impl HostOutcome {
    fn applied() -> Self {
        HostOutcome {
            applied: true,
            ..Default::default()
        }
    }
    fn resnapshot(scope: Scope) -> Self {
        HostOutcome {
            resnapshot: vec![scope],
            ..Default::default()
        }
    }
}

/// Applies one host message. Receipts and `Lost` belong to the outbox and are ignored here.
pub fn reduce_host(host: &mut HostSnapshot, msg: Inbound, now: Moment) -> HostOutcome {
    match msg {
        Inbound::Connection(event) => {
            connection(host, event, now);
            HostOutcome::applied()
        }
        Inbound::Admission(admission) => {
            host.admission = admission;
            HostOutcome::applied()
        }
        Inbound::Snapshot {
            scope,
            at,
            resources,
        } => snapshot(host, scope, at, resources, now),
        Inbound::Update {
            scope,
            at,
            prev_scope_seq,
            changes,
            facts,
        } => update(host, scope, at, prev_scope_seq, changes, facts, now),
        Inbound::Delta {
            conversation,
            message,
            offset,
            text,
        } => delta(host, &conversation, &message, offset, &text),
        Inbound::Undecodable { scope, .. } => {
            host.undecodable += 1;
            match scope {
                Some(scope) => {
                    host.needs_snapshot.insert(scope.clone());
                    HostOutcome::resnapshot(scope)
                }
                None => HostOutcome::default(),
            }
        }
        Inbound::Receipt { .. } | Inbound::Lost { .. } => HostOutcome::default(),
    }
}

fn connection(host: &mut HostSnapshot, event: ConnectionEvent, now: Moment) {
    host.connection = match event {
        ConnectionEvent::Connecting => Connection::Connecting,
        ConnectionEvent::Live {
            host_name,
            server_version,
        } => {
            host.host_name = host_name.or(host.host_name.take());
            host.server_version = server_version.or(host.server_version.take());
            Connection::Live
        }
        ConnectionEvent::Offline { reason } => Connection::Offline {
            since: host.host_now(now),
            reason,
        },
        ConnectionEvent::Revoked { at } => Connection::Revoked { at },
        ConnectionEvent::CredentialRefused { reason } => Connection::CredentialRefused { reason },
        ConnectionEvent::TooOld { requires } => Connection::TooOld { requires },
    };
}

fn epoch_changed(host: &HostSnapshot, epoch: &Option<Epoch>) -> bool {
    (host.epoch.is_some() || !host.cursors.is_empty()) && host.epoch != *epoch
}

fn snapshot(
    host: &mut HostSnapshot,
    scope: Scope,
    at: Cursor,
    resources: Vec<Resource>,
    now: Moment,
) -> HostOutcome {
    let mut outcome = HostOutcome::applied();
    if epoch_changed(host, &at.epoch) {
        outcome.discontinuity = true;
        let others: Vec<Scope> = host
            .cursors
            .keys()
            .chain(host.needs_snapshot.iter())
            .filter(|s| **s != scope)
            .cloned()
            .collect();
        host.cursors.clear();
        host.needs_snapshot.clear();
        host.seq = None;
        for other in others {
            if host.needs_snapshot.insert(other.clone()) {
                outcome.resnapshot.push(other);
            }
        }
    } else if host
        .cursors
        .get(&scope)
        .is_some_and(|c| at.scope_seq < c.scope_seq)
    {
        return HostOutcome::default();
    }
    host.epoch = at.epoch.clone();
    clear_scope(host, &scope);
    for resource in resources {
        upsert(host, &scope, resource);
    }
    host.needs_snapshot.remove(&scope);
    advance(host, scope, at, now);
    outcome
}

fn update(
    host: &mut HostSnapshot,
    scope: Scope,
    at: Cursor,
    prev: Seq,
    changes: Vec<Change>,
    facts: Vec<Fact>,
    now: Moment,
) -> HostOutcome {
    if host.needs_snapshot.contains(&scope) {
        return HostOutcome::default();
    }
    if epoch_changed(host, &at.epoch) {
        host.needs_snapshot.insert(scope.clone());
        return HostOutcome::resnapshot(scope);
    }
    let Some(cursor) = host.cursors.get(&scope) else {
        host.needs_snapshot.insert(scope.clone());
        return HostOutcome::resnapshot(scope);
    };
    if at.scope_seq <= cursor.scope_seq {
        return HostOutcome::default();
    }
    if prev != cursor.scope_seq {
        host.needs_snapshot.insert(scope.clone());
        return HostOutcome::resnapshot(scope);
    }
    for change in changes {
        match change {
            Change::Upsert(resource) => upsert(host, &scope, resource),
            Change::Remove(key) => remove(host, key),
        }
    }
    host.facts = facts;
    advance(host, scope, at, now);
    HostOutcome::applied()
}

fn advance(host: &mut HostSnapshot, scope: Scope, at: Cursor, now: Moment) {
    if let Some(seq) = at.ledger_seq {
        host.seq = Some(host.seq.map_or(seq, |s| s.max(seq)));
    }
    if let Some(time) = at.host_time
        && host.host_time.is_none_or(|c| time >= c.host)
    {
        host.host_time = Some(HostClock {
            host: time,
            received: now,
        });
    }
    host.cursors.insert(scope, at);
}

fn clear_scope(host: &mut HostSnapshot, scope: &Scope) {
    match scope {
        Scope::Attention => {
            host.attention = Attention::default();
            host.slots = None;
        }
        Scope::Slices => {
            host.slices = Slices::default();
            host.lifecycle_states.clear();
        }
        Scope::Agents => host.agents = Agents::default(),
        Scope::Object(_) => {}
    }
    let owned: Vec<ObjectId> = host
        .object_scope
        .iter()
        .filter(|(_, s)| *s == scope)
        .map(|(id, _)| id.clone())
        .collect();
    for id in owned {
        host.objects.remove(&id);
        host.object_scope.remove(&id);
    }
    host.references.remove(scope);
    host.unsupported.retain(|n| n.scope != *scope);
}

fn replace<T>(rows: &mut Vec<T>, row: T, same: impl Fn(&T) -> bool) {
    match rows.iter_mut().find(|r| same(r)) {
        Some(slot) => *slot = row,
        None => rows.push(row),
    }
}

fn upsert(host: &mut HostSnapshot, scope: &Scope, resource: Resource) {
    match resource {
        Resource::Object(object) => {
            host.object_scope.insert(object.id.clone(), scope.clone());
            host.objects.insert(object.id.clone(), object);
        }
        Resource::AttentionRow(row) => {
            let id = row.id.clone();
            replace(&mut host.attention.rows, row, |r| r.id == id);
        }
        Resource::Slots(slots) => host.slots = Some(slots),
        Resource::Proposal(p) => {
            let id = p.id.clone();
            replace(&mut host.attention.proposals, p, |r| r.id == id);
        }
        Resource::SliceRow(row) => {
            let id = row.id.clone();
            replace(&mut host.slices.rows, row, |r| r.id == id);
        }
        Resource::LifecycleStates(states) => host.lifecycle_states = states,
        Resource::AgentRow(row) => {
            let id = row.assignment.clone();
            replace(&mut host.agents.rows, row, |r| r.assignment == id);
        }
        Resource::AgentTotals(totals) => host.agents.totals = Some(totals),
        Resource::References(refs) => {
            host.references.insert(scope.clone(), refs);
        }
        Resource::Unsupported { kind, id, reason } => {
            let note = UnsupportedNote {
                scope: scope.clone(),
                kind,
                id: id.clone(),
                reason,
            };
            replace(&mut host.unsupported, note, |n| n.id == id);
        }
    }
}

fn remove(host: &mut HostSnapshot, key: ResourceKey) {
    match key {
        ResourceKey::Object(id) => {
            host.objects.remove(&id);
            host.object_scope.remove(&id);
        }
        ResourceKey::AttentionRow(id) => host.attention.rows.retain(|r| r.id != id),
        ResourceKey::Proposal(id) => host.attention.proposals.retain(|r| r.id != id),
        ResourceKey::SliceRow(id) => host.slices.rows.retain(|r| r.id != id),
        ResourceKey::AgentRow(id) => host.agents.rows.retain(|r| r.assignment != id),
        ResourceKey::Unsupported(id) => host.unsupported.retain(|n| n.id != id),
    }
}

fn delta(
    host: &mut HostSnapshot,
    conversation: &str,
    message: &str,
    offset: u64,
    text: &str,
) -> HostOutcome {
    let scope = host
        .object_scope
        .get(conversation)
        .cloned()
        .unwrap_or_else(|| Scope::Object(conversation.into()));
    let target = host
        .objects
        .get_mut(conversation)
        .and_then(|o| match &mut o.body {
            ObjectBody::Chat(chat) => chat.messages.iter_mut().find(|m| m.id == message),
            _ => None,
        });
    let Some(Message {
        body: MessageBody::Text { text: current, .. },
        ..
    }) = target
    else {
        host.needs_snapshot.insert(scope.clone());
        return HostOutcome::resnapshot(scope);
    };
    let have = current.len() as u64;
    let end = offset + text.len() as u64;
    if end <= have {
        return HostOutcome::default();
    }
    let skip = have.saturating_sub(offset) as usize;
    if offset > have || !text.is_char_boundary(skip) {
        host.needs_snapshot.insert(scope.clone());
        return HostOutcome::resnapshot(scope);
    }
    current.push_str(&text[skip..]);
    HostOutcome::applied()
}
