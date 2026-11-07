use render_core::{ClockId, HostTime, Moment, SeenBrief, SeenRow};
use render_desktop::presence::*;
use std::time::Duration;

fn brief(epoch: &str, seq: u64, ms: i64, rows: &[(&str, &str)]) -> SeenBrief {
    SeenBrief {
        epoch: Some(epoch.into()),
        seq: Some(seq),
        host_time: Some(HostTime {
            utc_ms: ms,
            offset_min: 120,
        }),
        rows: rows
            .iter()
            .map(|(id, group)| SeenRow {
                id: (*id).into(),
                group: (*group).into(),
            })
            .collect(),
    }
}

#[test]
fn every_presence_gate_is_required_and_input_uses_one_monotonic_threshold() {
    let yes = PresenceSignals {
        key: true,
        visible: true,
        screen_awake: true,
    };
    assert!(yes.present(true, true));
    for signals in [
        PresenceSignals { key: false, ..yes },
        PresenceSignals {
            visible: false,
            ..yes
        },
        PresenceSignals {
            screen_awake: false,
            ..yes
        },
    ] {
        assert!(!signals.present(true, true));
    }
    assert!(!yes.present(false, true));
    assert!(!yes.present(true, false));
    let at = |s| Moment {
        clock: ClockId(1),
        at: Duration::from_secs(s),
    };
    assert!(input_is_recent(Some(at(1)), at(301)));
    assert!(!input_is_recent(Some(at(1)), at(302)));
    assert!(!input_is_recent(None, at(1)));
    assert!(!input_is_recent(Some(at(2)), at(1)));
    assert!(!input_is_recent(
        Some(at(1)),
        Moment {
            clock: ClockId(2),
            ..at(2)
        }
    ));
}

#[test]
fn new_device_and_continuous_presence_have_no_return_summary_or_frame_writes() {
    let mut tracker = PresenceTracker::new(None);
    let first = brief("e", 1, 1_000, &[("a", "Waiting")]);
    assert_eq!(
        tracker.update(true, first.clone()).baseline,
        Some(first.clone())
    );
    assert!(tracker.summary().is_none());
    let later = brief("e", 1, 2_000, &[("a", "Waiting")]);
    assert!(tracker.update(true, later.clone()).baseline.is_none());
    // Departure flushes the latest in-memory host timestamp once.
    assert_eq!(
        tracker.update(false, brief("e", 2, 3_000, &[])).baseline,
        Some(later)
    );
    assert!(tracker.update(false, first).baseline.is_none());
    assert!(tracker.summary().is_none());
}

#[test]
fn departure_freezes_last_present_rows_and_return_counts_exact_group_moves() {
    let mut tracker = PresenceTracker::new(None);
    let before = brief(
        "e",
        10,
        3_000,
        &[
            ("same", "NeedsYou"),
            ("human", "Waiting"),
            ("host", "Running"),
            ("done", "Running"),
        ],
    );
    tracker.update(true, before);
    tracker.update(false, brief("e", 11, 4_000, &[("human", "NeedsYou")]));
    tracker.update(false, brief("e", 12, 5_000, &[]));
    let current = brief(
        "e",
        13,
        3_603_000,
        &[
            ("same", "NeedsYou"),
            ("human", "NeedsYou"),
            ("host", "OnHost"),
            ("new", "Running"),
            ("done", "Done"),
        ],
    );
    assert_eq!(
        tracker.update(true, current.clone()).baseline,
        Some(current)
    );
    let summary = tracker.summary().unwrap().clone();
    assert_eq!(summary.counts(), (1, 1, 1));
    assert_eq!(
        summary
            .rows
            .iter()
            .map(|r| r.id.as_str())
            .collect::<Vec<_>>(),
        ["human", "host", "new"]
    );
    assert_eq!(summary.rows[0].old_group.as_deref(), Some("Waiting"));
    assert_eq!(summary.rows[2].old_group, None);
    assert_eq!(summary.since.unwrap().utc_ms, 3_000);
    assert_eq!(summary.since.unwrap().offset_min, 120);
    assert_eq!(summary.away, Some(Duration::from_secs(3600)));
    tracker.update(true, brief("e", 14, 3_604_000, &[]));
    assert_eq!(tracker.summary(), Some(&summary));
    tracker.update(false, brief("e", 15, 3_605_000, &[]));
    assert!(tracker.summary().is_none());
}

#[test]
fn saved_device_baseline_compares_on_first_return_and_unchanged_is_explicit() {
    let saved = brief("e", 3, 10_000, &[("a", "NeedsYou")]);
    let mut tracker = PresenceTracker::new(Some(saved.clone()));
    assert!(
        tracker
            .update(false, brief("e", 4, 20_000, &[]))
            .baseline
            .is_none()
    );
    tracker.update(true, brief("e", 5, 30_000, &[("a", "NeedsYou")]));
    let summary = tracker.summary().unwrap();
    assert_eq!(summary.counts(), (0, 0, 0));
    assert!(summary.rows.is_empty());
    assert_eq!(summary.explanation(), Some("nothing changed"));
    assert_eq!(summary.away, Some(Duration::from_secs(20)));
    let mut new_device = PresenceTracker::new(None);
    new_device.update(false, saved.clone());
    new_device.update(true, saved);
    assert!(new_device.summary().is_none());
}

#[test]
fn restored_epoch_explains_instead_of_comparing_rollback_rows() {
    let saved = brief("old", 100, 90_000, &[("a", "Waiting")]);
    let mut tracker = PresenceTracker::new(Some(saved));
    tracker.update(true, brief("new", 1, 10_000, &[("a", "NeedsYou")]));
    let summary = tracker.summary().unwrap();
    assert!(summary.restored);
    assert_eq!(summary.counts(), (0, 0, 0));
    assert!(summary.rows.is_empty());
    assert_eq!(summary.away, None);
    assert_eq!(
        summary.explanation(),
        Some("host continuity changed · rows as they stand now")
    );
    tracker.update(false, brief("new", 2, 11_000, &[]));
    tracker.update(true, brief("new", 3, 12_000, &[("a", "OnHost")]));
    assert!(!tracker.summary().unwrap().restored);
    assert_eq!(tracker.summary().unwrap().counts(), (0, 1, 0));
    // Restore during continuous presence also invalidates the displayed comparison.
    tracker.update(true, brief("third", 1, 1_000, &[]));
    assert!(tracker.summary().unwrap().restored);
}

#[test]
fn missing_or_regressing_host_time_never_uses_local_wall_time() {
    for time in [
        None,
        Some(HostTime {
            utc_ms: 1,
            offset_min: 0,
        }),
    ] {
        let mut tracker = PresenceTracker::new(Some(brief("e", 1, 100, &[])));
        let mut current = brief("e", 2, 200, &[]);
        current.host_time = time;
        tracker.update(true, current);
        assert_eq!(tracker.summary().unwrap().away, None);
    }
}

#[test]
fn native_probe_off_main_thread_fails_closed_without_ui_automation() {
    assert_eq!(std::thread::spawn(native_presence).join().unwrap(), None);
}
