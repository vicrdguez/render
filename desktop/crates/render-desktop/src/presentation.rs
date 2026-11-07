//! Visual list layout only. The core host remains current and authoritative.
//! The caller supplies the typing/idle boundary; this projection owns no clock
//! and cannot freeze host updates or authorize actions.

use render_core::{AgentRow, AttentionRow, HostSnapshot, ProposalSummary, SliceRow, Text};
use std::collections::BTreeSet;

#[derive(Default, Clone, Debug, PartialEq, Eq)]
pub struct PresentedLists {
    pub initialized: bool,
    pub pending: bool,
    pub attention: Vec<AttentionRow>,
    pub proposals: Vec<ProposalSummary>,
    pub slices: Vec<SliceRow>,
    pub agents: Vec<AgentRow>,
    /// Selected-object identities, not row indices. Consumers must refuse
    /// interaction with these rows, including opening and NEXT navigation.
    pub tombstones: BTreeSet<String>,
}

impl PresentedLists {
    /// Refresh facts immediately, deferring membership, order and displayed
    /// group changes while `freeze` is true. Return whether presentation changed.
    /// Counts and authority must always be read from `host`, not these lists.
    pub fn update(&mut self, host: &HostSnapshot, freeze: bool) -> bool {
        let before = self.clone();
        if !self.initialized || !freeze {
            *self = Self {
                initialized: true,
                attention: host.attention.rows.clone(),
                proposals: host.attention.proposals.clone(),
                slices: host.slices.rows.clone(),
                agents: host.agents.rows.clone(),
                ..Self::default()
            };
        } else {
            self.pending = refresh(
                &mut self.attention,
                &host.attention.rows,
                &mut self.tombstones,
                |row| &row.object,
                |old, new| old.group == new.group,
                |row| {
                    row.reason = Some(resolved());
                    row.next = None;
                    row.decidables.clear();
                    row.mark = None;
                },
            );
            self.pending |= refresh(
                &mut self.proposals,
                &host.attention.proposals,
                &mut self.tombstones,
                |row| &row.id,
                |_, _| true,
                |row| {
                    row.status = Some(resolved());
                    row.needs_you = false;
                },
            );
            self.pending |= refresh(
                &mut self.slices,
                &host.slices.rows,
                &mut self.tombstones,
                |row| &row.id,
                |old, new| old.lifecycle == new.lifecycle,
                |row| {
                    row.reason = Some(resolved());
                    row.next = None;
                },
            );
            self.pending |= refresh(
                &mut self.agents,
                &host.agents.rows,
                &mut self.tombstones,
                |row| &row.assignment,
                |old, new| old.group == new.group,
                |row| {
                    row.remedy = Some(resolved());
                    row.waits_on_you = false;
                    row.decidables.clear();
                },
            );
        }
        *self != before
    }
}

// Client presentation copy only: never written into the authoritative snapshot.
fn resolved() -> Text {
    Text::Host("resolved elsewhere".into())
}

fn refresh<T: Clone>(
    shown: &mut [T],
    current: &[T],
    tombstones: &mut BTreeSet<String>,
    key: impl Fn(&T) -> &str,
    same_group: impl Fn(&T, &T) -> bool,
    make_inert: impl Fn(&mut T),
) -> bool {
    let mut pending = !shown.iter().map(&key).eq(current.iter().map(&key));
    for row in shown {
        let latest = current.iter().find(|candidate| key(candidate) == key(row));
        // Once resolved, keep the row inert until idle, even if a subsequent
        // snapshot restores its identity. Never revive a target under typing.
        if !tombstones.contains(key(row))
            && let Some(latest) = latest
            && same_group(row, latest)
        {
            *row = latest.clone();
        } else {
            pending = true;
            tombstones.insert(key(row).to_owned());
            make_inert(row);
        }
    }
    pending
}
