use render_core::*;
use render_desktop::{AppState, ServiceRequest};
use render_host::*;
use std::{cell::Cell, rc::Rc, time::Duration};

struct Spy {
    demo: DemoAdapter,
    sends: Rc<Cell<usize>>,
}
impl HostAdapter for Spy {
    fn format(&self) -> &str {
        self.demo.format()
    }
    fn connect(&mut self) -> Result<(), AdapterError> {
        Ok(())
    }
    fn poll(&mut self) -> Option<Inbound> {
        None
    }
    fn prepare(&self, i: &CommandIntent) -> Result<PreparedCommand, AdapterError> {
        self.demo.prepare(i)
    }
    fn transmit(&mut self, _: &PreparedCommand) -> Result<(), AdapterError> {
        self.sends.set(self.sends.get() + 1);
        Ok(())
    }
    fn query_receipt(&mut self, _: &str) -> Result<(), AdapterError> {
        Ok(())
    }
    fn subscribe(&mut self, _: &[Scope]) -> Result<(), AdapterError> {
        Ok(())
    }
    fn fetch(&mut self, _: &Scope) -> Result<(), AdapterError> {
        Ok(())
    }
}
fn now() -> Moment {
    Moment {
        clock: ClockId(7),
        at: Duration::ZERO,
    }
}
fn queued(
    name: &str,
) -> (
    AppState,
    Rc<Cell<usize>>,
    DraftKey,
    CommandIntent,
    std::path::PathBuf,
) {
    let dir = std::env::temp_dir().join(format!("render-transmit-{}-{name}", std::process::id()));
    let _ = std::fs::remove_dir_all(&dir);
    let mut s = AppState::default();
    s.install_demo();
    s.attach_store(&dir);
    let sends = Rc::new(Cell::new(0));
    s.set_adapter(Box::new(Spy {
        demo: DemoAdapter::new(vec![]),
        sends: sends.clone(),
    }));
    s.requests.clear();
    let key = DraftKey {
        object: "chat".into(),
        kind: DraftKind::Prompt,
        base: None,
    };
    s.core
        .edit_draft(key.clone(), DraftBody::Text("keep these bytes".into()));
    let pin = s.core.drawn_target("chat", Surface::WorkView).unwrap();
    let intent = s
        .core
        .submit(
            &pin,
            WriteRequest::SendMessage {
                draft: key.clone(),
                follow_up: false,
            },
        )
        .unwrap();
    (s, sends, key, intent, dir)
}
#[test]
fn failed_local_flush_blocks_normal_quit_and_preserves_the_in_memory_draft() {
    let (mut s, _, key, _, dir) = queued("quit-failure");
    std::fs::create_dir(dir.join("device.json.next")).unwrap();
    s.dirty = true;
    let spec = render_desktop::app_spec();
    let mut rt = rune::Runtime::with_text(
        s,
        render_desktop::view,
        (800.0, 982.0),
        rune::Env::default(),
        rune::text::TextSystem::new(spec.fonts, spec.families),
    );
    rt.update(|s, tx| s.command("app.quit", tx));
    assert!(!matches!(rt.shell_request, Some(rune::Shell::Quit)));
    assert!(rt.state.persistence_error.is_some());
    assert_eq!(
        rt.state.core.local.drafts[&key].body,
        DraftBody::Text("keep these bytes".into())
    );
    drop(rt);
    std::fs::remove_dir_all(dir).unwrap();
}
#[test]
fn prepare_refusal_durably_removes_the_known_unsent_command() {
    let (mut s, _, key, intent, dir) = queued("prepare-refused");
    s.outgoing.push(intent.clone());
    assert!(s.persist());
    s.set_adapter(Box::new(render_host::DisconnectedAdapter::default()));
    s.flush_service();
    assert!(s.core.entry(&intent.id).is_none());
    drop(s);
    let mut reopened = AppState::default();
    reopened.attach_store(&dir);
    assert!(
        reopened.core.entry(&intent.id).is_none(),
        "known unsent command must not resurrect as unknown"
    );
    assert!(reopened.core.local.drafts.contains_key(&key));
    drop(reopened);
    std::fs::remove_dir_all(dir).unwrap();
}

#[test]
fn first_send_rechecks_revocation_at_the_actual_dispatch_boundary() {
    let (mut s, sends, key, intent, dir) = queued("revoked");
    s.outgoing.push(intent.clone());
    s.core.apply_inbound(
        Inbound::Connection(ConnectionEvent::Revoked { at: None }),
        now(),
    );
    s.flush_service();
    assert_eq!(
        sends.get(),
        0,
        "revoked queued send must never reach transport"
    );
    assert_eq!(
        s.core.local.drafts[&key].body,
        DraftBody::Text("keep these bytes".into())
    );
    assert!(
        s.core.entry(&intent.id).is_none(),
        "known unsent intent is abandoned, not uncertain"
    );
    drop(s);
    std::fs::remove_dir_all(dir).unwrap();
}
#[test]
fn queued_retry_rechecks_connection_and_retains_original_unknown_bytes() {
    let (mut s, sends, key, intent, dir) = queued("retry-offline");
    let bytes = DemoAdapter::new(vec![]).prepare(&intent).unwrap();
    s.core.prepared(bytes.clone()).unwrap();
    s.core.transmitted(&intent.id).unwrap();
    s.core.apply_inbound(
        Inbound::Lost {
            command: intent.id.clone(),
        },
        now(),
    );
    let retry = s.core.retry(&intent.id, DEMO_FORMAT).unwrap();
    s.requests.push(ServiceRequest::Retry(retry));
    s.core.apply_inbound(
        Inbound::Connection(ConnectionEvent::Offline { reason: None }),
        now(),
    );
    s.flush_service();
    assert_eq!(
        sends.get(),
        0,
        "offline queued retry must not reach transport"
    );
    let entry = s.core.entry(&intent.id).unwrap();
    assert!(matches!(entry.state, OutboxState::Unknown { .. }));
    assert_eq!(entry.prepared.as_ref(), Some(&bytes));
    assert!(s.core.local.drafts.contains_key(&key));
    drop(s);
    std::fs::remove_dir_all(dir).unwrap();
}
