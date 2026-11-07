#![allow(dead_code)]

use render_core::*;
use std::time::Duration;

pub const CLOCK: ClockId = ClockId(1);

pub fn at(ms: u64) -> Moment {
    Moment {
        clock: CLOCK,
        at: Duration::from_millis(ms),
    }
}

pub fn host_time(ms: i64) -> HostTime {
    HostTime {
        utc_ms: ms,
        offset_min: 60,
    }
}

pub fn field(name: &str, revision: &str) -> BasisField {
    BasisField {
        revision: Some(revision.into()),
        ..BasisField::named(name)
    }
}

pub fn basis(fields: &[(&str, &str)]) -> Basis {
    let digest = fields
        .iter()
        .map(|(n, r)| format!("{n}={r}"))
        .collect::<Vec<_>>()
        .join(";");
    Basis {
        digest,
        fields: fields.iter().map(|(n, r)| field(n, r)).collect(),
    }
}

pub fn action(command: CommandType) -> HostAction {
    HostAction {
        command,
        option: None,
        option_kind: None,
        recommended: false,
        availability: Availability::Available,
        effect: Some(Text::Host("the emission is approved".into())),
        not: vec![Text::Host("edited draft not approved".into())],
        carries: None,
    }
}

pub fn decidable(target: &str, b: Basis, actions: Vec<HostAction>) -> Decidable {
    Decidable {
        target: target.into(),
        subject: None,
        basis: b,
        actions,
    }
}

pub fn object(id: &str, body: ObjectBody, decidables: Vec<Decidable>) -> Object {
    Object {
        id: id.into(),
        revision: Some("r2".into()),
        title: Some("Modules r2".into()),
        project: Some(ProjectRef {
            id: "render".into(),
            name: "render".into(),
        }),
        workflow: Some("wf".into()),
        handover: Handover::default(),
        next: None,
        track: None,
        decidables,
        body,
    }
}

pub fn review_body() -> ObjectBody {
    ObjectBody::Review(Review {
        emission: "em".into(),
        digest: Some("9f3ca1e2".into()),
        emitted_at: None,
        previous: None,
        text: "# Modules\n".into(),
        nodes: vec![],
        change_ranges: vec![],
        annotation_set: Some("v3".into()),
        annotations: vec![],
        dispositions: vec![],
        round: None,
        reviews: None,
        delegated: None,
        attributes_changed: false,
        fidelity: None,
    })
}

pub fn chat_body(phase: TurnPhase) -> ObjectBody {
    ObjectBody::Chat(Chat {
        roster: vec![],
        messages: vec![Message {
            id: "m1".into(),
            role: Role {
                class: RoleClass::Coordinator,
                label: "coordinator".into(),
            },
            at: None,
            model: None,
            assignment: None,
            turn: Some("t42".into()),
            receipt: None,
            body: MessageBody::Text {
                text: "héllo".into(),
                streaming: true,
                truncated: false,
            },
        }],
        turn: Some(TurnState {
            turn: Some("t42".into()),
            phase,
            since: None,
            tools: None,
        }),
        steers: vec![],
        artifacts: vec![],
        complete: true,
    })
}

/// A review object `em` whose decidable binds annotations at `annotations`.
pub fn review(annotations: &str) -> Object {
    let b = basis(&[
        ("emission", "r2"),
        ("annotations", annotations),
        ("policy", "pol3"),
    ]);
    object(
        "em",
        review_body(),
        vec![decidable(
            "em",
            b,
            vec![
                action(CommandType::ApproveCheckpoint),
                action(CommandType::RequestRework),
            ],
        )],
    )
}

pub fn cursor(epoch: Option<&str>, scope_seq: Seq, ledger: Seq) -> Cursor {
    Cursor {
        epoch: epoch.map(Into::into),
        scope_seq,
        ledger_seq: Some(ledger),
        host_time: Some(host_time(1_000 + ledger as i64)),
    }
}

pub fn wf() -> Scope {
    Scope::Object("wf".into())
}

pub fn snapshot(scope: Scope, seq: Seq, ledger: Seq, resources: Vec<Resource>) -> Inbound {
    Inbound::Snapshot {
        scope,
        at: cursor(Some("e1"), seq, ledger),
        resources,
    }
}

pub fn update(scope: Scope, seq: Seq, prev: Seq, ledger: Seq, changes: Vec<Change>) -> Inbound {
    Inbound::Update {
        scope,
        at: cursor(Some("e1"), seq, ledger),
        prev_scope_seq: prev,
        changes,
        facts: vec![],
    }
}

pub fn live() -> Inbound {
    Inbound::Connection(ConnectionEvent::Live {
        host_name: Some("homeserver".into()),
        server_version: None,
    })
}

/// A live client with device id `dev` showing review `em` in scope `wf` at seq 10.
pub fn client_with(objects: Vec<Object>) -> Client {
    let mut c = Client::new(DeviceState {
        device_id: "dev".into(),
        ..DeviceState::default()
    });
    c.apply_inbound(live(), at(0));
    c.apply_inbound(
        snapshot(
            wf(),
            1,
            10,
            objects.into_iter().map(Resource::Object).collect(),
        ),
        at(0),
    );
    c
}

pub fn client() -> Client {
    client_with(vec![review("v3")])
}

pub fn key(ms: u64) -> KeyPress {
    KeyPress {
        repeat: false,
        composing: false,
        input_time: Some(at(ms)),
    }
}

pub fn approve() -> AuthorityRequest {
    AuthorityRequest {
        verb: AuthorityVerb::Approve,
        option: None,
        subject: None,
        count: None,
        draft: None,
    }
}

/// Opens the view, opens an approve readback from the drawn target and acknowledges its draw.
pub fn drawn_readback(c: &mut Client, drawn_ms: u64) {
    c.view_opened("em");
    let pin = c.drawn_target("em", Surface::WorkView).unwrap();
    c.open_readback(&pin, approve()).unwrap();
    c.readback_drawn(at(drawn_ms));
}

pub fn prepare(c: &mut Client, intent: &CommandIntent) -> PreparedCommand {
    let p = PreparedCommand {
        id: intent.id.clone(),
        format: "demo/1".into(),
        bytes: format!("bytes:{}", intent.id).into_bytes(),
        summary: "s".into(),
    };
    c.prepared(p.clone()).unwrap();
    c.transmitted(&intent.id).unwrap();
    p
}

pub fn receipt(id: &str, outcome: ReceiptOutcome) -> Inbound {
    Inbound::Receipt {
        command: id.into(),
        outcome,
    }
}
