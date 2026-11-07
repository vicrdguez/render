use render_core::AttentionGroup;
use render_desktop::{AppState, Screen, presence::PresenceSignals};

#[test]
fn brief_presence_needs_real_signals_and_recent_input_and_freezes_departure() {
    let mut app = AppState::default();
    app.install_demo();
    let signals = Some(PresenceSignals {
        key: true,
        visible: true,
        screen_awake: true,
    });
    app.observe_presence(signals);
    assert!(app.core.local.seen_brief.is_none(), "launch is not input");
    app.last_input = Some(app.moment());
    app.observe_presence(None);
    assert!(
        app.core.local.seen_brief.is_none(),
        "unknown OS state is absent"
    );
    app.observe_presence(signals);
    assert!(app.core.local.seen_brief.is_some());
    app.open(Screen::Chat, Some("chat".into()));
    app.observe_presence(signals);
    let baseline = app.core.local.seen_brief.clone();
    let mut row = app.core.host.attention.rows[0].clone();
    row.object = "new-arrival".into();
    row.group = AttentionGroup::NeedsYou;
    app.core.host.attention.rows.push(row);
    app.now = 20.0;
    app.observe_presence(signals);
    assert_eq!(app.core.local.seen_brief, baseline);
    app.open(Screen::Brief, None);
    app.last_input = Some(app.moment());
    app.observe_presence(signals);
    assert_eq!(app.presence.summary().unwrap().counts(), (1, 0, 0));
    assert_eq!(app.presence.summary().unwrap().rows[0].id, "new-arrival");
}

#[test]
fn since_line_and_expansion_show_the_frozen_delta_not_current_totals() {
    use render_core::{SeenBrief, SeenRow};
    use render_desktop::{
        app_spec,
        presence::{PresenceTracker, seen_group},
        view,
    };
    use rune::{Env, Runtime, text::TextSystem};
    let mut app = AppState::default();
    app.install_demo();
    let newly = app
        .core
        .host
        .attention
        .rows
        .iter()
        .find(|r| r.group == AttentionGroup::NeedsYou)
        .unwrap()
        .object
        .clone();
    app.presence = PresenceTracker::new(Some(SeenBrief {
        epoch: app.core.host.epoch.clone(),
        seq: app.core.host.seq,
        host_time: app.core.host.host_now(app.moment()),
        rows: app
            .core
            .host
            .attention
            .rows
            .iter()
            .filter(|r| r.object != newly)
            .map(|r| SeenRow {
                id: r.object.clone(),
                group: seen_group(r.group).into(),
            })
            .collect(),
    }));
    app.last_input = Some(app.moment());
    app.observe_presence(Some(PresenceSignals {
        key: true,
        visible: true,
        screen_awake: true,
    }));
    app.since_expanded = true;
    let spec = app_spec();
    let mut rt = Runtime::with_text(
        app,
        view,
        (1512.0, 982.0),
        Env::default(),
        TextSystem::new(spec.fonts, spec.families),
    );
    rt.frame(0.0);
    assert!(rt.elements().iter().any(|e| {
        e.text
            .as_deref()
            .is_some_and(|v| v.contains("1 new for you"))
    }));
    assert!(
        rt.elements()
            .iter()
            .any(|e| e.key.as_deref() == Some(&format!("brief.since.row.{newly}")))
    );
}
