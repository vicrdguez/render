//! Acceptance at the native Runtime / device store / demo transport boundaries.
//! Draw acknowledgements are explicit; these are not physical OS timing tests.
use render_core::*;
use render_desktop::{AppState, Screen, app_spec};
use render_host::*;
use rune::{Key, Runtime};
use std::{cell::RefCell, collections::VecDeque, path::PathBuf, rc::Rc, time::Duration};

#[derive(Default)]
struct Delivery {
    held: VecDeque<Inbound>,
    ready: VecDeque<Inbound>,
    sent: Vec<PreparedCommand>,
    lose_reply: bool,
}
struct ControlledDemo {
    demo: DemoAdapter,
    delivery: Rc<RefCell<Delivery>>,
}
impl HostAdapter for ControlledDemo {
    fn format(&self) -> &str {
        self.demo.format()
    }
    fn connect(&mut self) -> Result<(), AdapterError> {
        self.demo.connect()
    }
    fn poll(&mut self) -> Option<Inbound> {
        while let Some(event) = self.demo.poll() {
            self.delivery.borrow_mut().held.push_back(event);
        }
        self.delivery.borrow_mut().ready.pop_front()
    }
    fn prepare(&self, intent: &CommandIntent) -> Result<PreparedCommand, AdapterError> {
        self.demo.prepare(intent)
    }
    fn transmit(&mut self, command: &PreparedCommand) -> Result<(), AdapterError> {
        self.delivery.borrow_mut().sent.push(command.clone());
        self.demo.transmit(command)?;
        if self.delivery.borrow().lose_reply {
            Err(AdapterError::NotConnected)
        } else {
            Ok(())
        }
    }
    fn query_receipt(&mut self, id: &str) -> Result<(), AdapterError> {
        self.demo.query_receipt(id)
    }
    fn subscribe(&mut self, scopes: &[Scope]) -> Result<(), AdapterError> {
        self.demo.subscribe(scopes)
    }
    fn fetch(&mut self, scope: &Scope) -> Result<(), AdapterError> {
        self.demo.fetch(scope)
    }
}
struct Fixture {
    rt: Runtime<AppState>,
    delivery: Rc<RefCell<Delivery>>,
    dir: PathBuf,
    draw: u64,
    key: DraftKey,
}
impl Fixture {
    fn new(name: &str, refuse: bool, unknown: bool) -> Self {
        let dir = std::env::temp_dir().join(format!(
            "render-save-lifecycle-{}-{name}",
            std::process::id()
        ));
        let _ = std::fs::remove_dir_all(&dir);
        let mut state = AppState::default();
        state.attach_store(&dir);
        state.install_demo();
        state.open(Screen::Review, Some("review".into()));
        let mut initial = demo_data::snapshots();
        // A genuinely stale server annotation set produces a real refusal receipt.
        if refuse {
            for event in &mut initial {
                if let Inbound::Snapshot { resources, .. } = event {
                    for resource in resources {
                        if let Resource::Object(object) = resource
                            && object.id == "review"
                            && let ObjectBody::Review(review) = &mut object.body
                        {
                            review.annotation_set = Some("server-newer-set".into());
                        }
                    }
                }
            }
        }
        let mut demo = DemoAdapter::new(initial);
        demo.connect().unwrap();
        while demo.poll().is_some() {}
        let delivery = Rc::new(RefCell::new(Delivery {
            lose_reply: unknown,
            ..Delivery::default()
        }));
        state.set_adapter(Box::new(ControlledDemo {
            demo,
            delivery: delivery.clone(),
        }));
        state.requests.clear();
        let mut rt =
            rune::App::new(app_spec()).headless_runtime((1000.0, 800.0), rune::Env::default());
        rt.state = state;
        rt.frame(0.0);
        let mut f = Self {
            rt,
            delivery,
            dir,
            draw: 0,
            key: DraftKey {
                object: "review".into(),
                kind: DraftKind::Annotations,
                base: Some("v3".into()),
            },
        };
        f.present();
        f.key(Key::Text("i".into()));
        f.rt.paste("acceptance note α");
        f.rt.frame(0.0);
        f.key =
            f.rt.state
                .composer
                .as_ref()
                .expect("native annotation editor")
                .key
                .clone();
        f.key(Key::Escape);
        f.key(Key::Escape);
        assert!(f.rt.state.composer.is_none());
        f.present();
        f.assert_draft("acceptance note α");
        f
    }
    fn key(&mut self, key: Key) {
        self.rt.key(key.into());
        self.rt.frame(0.0);
    }
    fn present(&mut self) {
        self.rt.frame(0.0);
        self.draw += 1;
        self.rt.state.acknowledge_draw_for_test(Moment {
            clock: ClockId(987),
            at: Duration::from_millis(self.draw),
        });
        self.rt.state.consume_draw();
    }
    fn wq(&mut self) {
        for ch in [":", "w", "q"] {
            self.key(Key::Text(ch.into()));
        }
        self.key(Key::Enter);
        self.rt.state.flush_service();
        self.rt.frame(0.0);
        assert_eq!(
            self.delivery.borrow().sent.len(),
            1,
            "one actual save dispatch"
        );
    }
    fn save_first(&mut self) {
        for ch in [" ", "a", "a"] {
            self.key(Key::Text(ch.into()));
        }
        assert!(
            self.rt
                .elements()
                .iter()
                .filter_map(|e| e.text.as_deref())
                .any(|text| text.contains("Save 1 local drafts first?")),
            "native save-first prompt must be visible"
        );
        self.key(Key::Text("y".into()));
        self.rt.state.flush_service();
        self.rt.frame(0.0);
        assert_eq!(self.delivery.borrow().sent.len(), 1);
    }
    fn release(&mut self, receipts: bool) {
        self.rt.state.poll_service();
        let mut d = self.delivery.borrow_mut();
        let mut remaining = VecDeque::new();
        for event in std::mem::take(&mut d.held) {
            if matches!(event, Inbound::Receipt { .. }) == receipts {
                d.ready.push_back(event);
            } else {
                remaining.push_back(event);
            }
        }
        d.held = remaining;
        drop(d);
        self.rt.frame(0.0);
    }
    fn open(&self) -> bool {
        self.rt
            .state
            .tabs
            .iter()
            .any(|t| t.object.as_deref() == Some("review"))
    }
    fn assert_draft(&mut self, expected: &str) {
        assert!(self.open(), "review tab must stay open");
        let DraftBody::Notes(notes) = &self.rt.state.core.local.drafts[&self.key].body else {
            panic!("annotation draft")
        };
        assert_eq!(notes[0].body, expected);
        assert!(self.rt.state.persist());
        drop(self.rt.state.store.take());
        let mut reopened = AppState::default();
        reopened.attach_store(&self.dir);
        assert!(
            reopened.persistence_error.is_none(),
            "{:?}",
            reopened.persistence_error
        );
        self.rt.state.store = reopened.store.take();
        assert_eq!(
            reopened.core.local.drafts[&self.key].body,
            self.rt.state.core.local.drafts[&self.key].body,
            "draft bytes survive device-store reopen"
        );
    }
    fn saved_note(&self) {
        let ObjectBody::Review(review) = &self.rt.state.core.host.objects["review"].body else {
            panic!()
        };
        assert!(
            review
                .annotations
                .iter()
                .any(|a| a.body.as_str() == "acceptance note α")
        );
    }
    fn no_authority_send(&self) {
        let d = self.delivery.borrow();
        assert_eq!(
            d.sent.len(),
            1,
            "save must never automatically dispatch authority or retry"
        );
        assert!(
            self.rt
                .state
                .core
                .local
                .outbox
                .iter()
                .all(|e| e.intent.command == CommandType::SaveAnnotations)
        );
    }
}
impl Drop for Fixture {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.dir);
    }
}

#[test]
fn wq_waits_for_observation_after_accepted_receipt() {
    wq_in_order(true);
}
#[test]
fn wq_waits_for_accepted_receipt_after_observation() {
    wq_in_order(false);
}
fn wq_in_order(receipt_first: bool) {
    let mut f = Fixture::new(
        if receipt_first {
            "receipt-first"
        } else {
            "state-first"
        },
        false,
        false,
    );
    f.wq();
    f.assert_draft("acceptance note α");
    f.release(receipt_first);
    f.assert_draft("acceptance note α");
    f.release(!receipt_first);
    f.saved_note();
    f.no_authority_send();
    assert!(!f.open(), "wq closes after acceptance AND observation");
    assert!(!f.rt.state.core.local.drafts.contains_key(&f.key));
    assert!(f.rt.state.persist());
    drop(f.rt.state.store.take());
    let mut reopened = AppState::default();
    reopened.attach_store(&f.dir);
    assert!(reopened.persistence_error.is_none());
    f.rt.state.store = reopened.store.take();
    assert!(!reopened.core.local.drafts.contains_key(&f.key));
    assert!(
        !reopened
            .tabs
            .iter()
            .any(|t| t.object.as_deref() == Some("review"))
    );
    f.no_authority_send();
}

#[test]
fn refused_and_unknown_saves_keep_tab_and_durable_draft_without_retry() {
    for (name, refuse, unknown) in [("refused", true, false), ("unknown", false, true)] {
        let mut f = Fixture::new(name, refuse, unknown);
        f.wq();
        if refuse {
            f.release(true);
        }
        // Unknown can have an observed server update without any acceptance receipt.
        f.release(false);
        f.present();
        f.assert_draft("acceptance note α");
        assert!(f.rt.state.core.session.readback.is_none());
        assert!(matches!(
            f.rt.state.core.local.outbox[0].state,
            OutboxState::Unknown { .. } | OutboxState::Settled(ReceiptOutcome::Refused { .. })
        ));
        f.no_authority_send();
    }
}

#[test]
fn save_first_requires_acceptance_observation_and_new_draw_then_only_opens_fresh_readback() {
    let mut f = Fixture::new("save-first", false, false);
    let old_basis = f.rt.state.core.host.objects["review"].decidables[0]
        .basis
        .clone();
    f.save_first();
    f.release(true);
    f.present();
    assert!(f.rt.state.core.session.readback.is_none());
    f.assert_draft("acceptance note α");
    f.release(false);
    f.saved_note();
    assert!(
        f.rt.state.core.session.readback.is_none(),
        "inbound is not a presented frame"
    );
    f.present();
    f.no_authority_send();
    assert!(
        f.rt.state.core.session.readback.is_some(),
        "save-first resumes after the new draw"
    );
    let readback = f.rt.state.core.session.readback.as_ref().unwrap();
    assert_ne!(readback.decidable.basis, old_basis);
    assert_eq!(
        readback.decidable.basis,
        f.rt.state.core.host.objects["review"].decidables[0].basis
    );
    assert!(f.open());
    f.present();
    f.no_authority_send();
}

#[test]
fn save_first_refused_or_unknown_never_opens_readback_or_retries() {
    for (name, refuse, unknown) in [
        ("first-refused", true, false),
        ("first-unknown", false, true),
    ] {
        let mut f = Fixture::new(name, refuse, unknown);
        f.save_first();
        if refuse {
            f.release(true);
        }
        f.release(false);
        f.present();
        f.assert_draft("acceptance note α");
        assert!(f.rt.state.core.session.readback.is_none());
        f.no_authority_send();
    }
}

#[test]
fn save_first_newer_local_edit_blocks_readback_and_retains_bytes() {
    let mut f = Fixture::new("first-newer-edit", false, false);
    f.save_first();
    let id = f.rt.state.local_notes()[0].local_id;
    assert!(f.rt.state.edit_note(id));
    f.rt.paste(" newer local bytes");
    f.rt.frame(0.0);
    let expected =
        f.rt.state
            .composer
            .as_ref()
            .unwrap()
            .editor
            .text()
            .to_owned();
    assert!(expected.contains("newer local bytes"));
    f.key(Key::Escape);
    f.key(Key::Escape);
    f.release(true);
    f.release(false);
    f.present();
    f.saved_note();
    f.assert_draft(&expected);
    assert!(f.rt.state.core.session.readback.is_none());
    f.no_authority_send();
}

#[test]
fn newer_local_edit_survives_old_save_and_prevents_wq_close() {
    let mut f = Fixture::new("newer-edit", false, false);
    f.wq();
    let id = f.rt.state.local_notes()[0].local_id;
    assert!(f.rt.state.edit_note(id));
    f.rt.paste(" newer local bytes");
    f.rt.frame(0.0);
    let expected =
        f.rt.state
            .composer
            .as_ref()
            .unwrap()
            .editor
            .text()
            .to_owned();
    assert!(expected.contains("newer local bytes"));
    f.release(true);
    f.release(false);
    f.present();
    f.saved_note();
    f.assert_draft(&expected);
    assert_eq!(
        f.rt.state.composer.as_ref().unwrap().editor.text(),
        expected
    );
    f.no_authority_send();
}
