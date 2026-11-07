//! Device-local Brief presence. The caller owns input collection and persistence;
//! this module never writes the store or treats drawing a frame as reading it.

use render_core::{AttentionGroup, HostTime, Moment, ObjectId, SeenBrief};
use std::collections::BTreeMap;
use std::time::Duration;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct PresenceSignals {
    pub key: bool,
    pub visible: bool,
    pub screen_awake: bool,
}

impl PresenceSignals {
    pub fn present(self, brief_focused: bool, recent_input: bool) -> bool {
        self.key && self.visible && self.screen_awake && brief_focused && recent_input
    }
}

/// No wall clock, and no comparison across unrelated monotonic clocks.
pub fn input_is_recent(last_input: Option<Moment>, now: Moment) -> bool {
    last_input.is_some_and(|last| {
        last.clock == now.clock
            && now
                .at
                .checked_sub(last.at)
                .is_some_and(|age| age <= Duration::from_secs(300))
    })
}

/// Stable spelling for the existing string-valued `SeenRow::group` field.
pub fn seen_group(group: AttentionGroup) -> &'static str {
    match group {
        AttentionGroup::NeedsYou => "NeedsYou",
        AttentionGroup::OnHost => "OnHost",
        AttentionGroup::Waiting => "Waiting",
        AttentionGroup::Running => "Running",
        AttentionGroup::Done => "Done",
    }
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct PresenceRow {
    pub id: ObjectId,
    pub old_group: Option<String>,
    pub group: AttentionGroup,
}

/// Frozen at return, not recomputed as the host changes while present.
/// `rows` is exactly the counted list, suitable for `za` and strong row titles.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct PresenceSummary {
    pub since: Option<HostTime>,
    pub returned_at: Option<HostTime>,
    pub away: Option<Duration>,
    pub rows: Vec<PresenceRow>,
    pub restored: bool,
}

impl PresenceSummary {
    /// (new for you, on the host, started), not current group totals.
    pub fn counts(&self) -> (usize, usize, usize) {
        let count = |group| self.rows.iter().filter(|row| row.group == group).count();
        (
            count(AttentionGroup::NeedsYou),
            count(AttentionGroup::OnHost),
            count(AttentionGroup::Running),
        )
    }

    pub fn explanation(&self) -> Option<&'static str> {
        if self.restored {
            Some("host continuity changed · rows as they stand now")
        } else if self.rows.is_empty() {
            Some("nothing changed")
        } else {
            None
        }
    }

    fn between(base: &SeenBrief, current: &SeenBrief) -> Self {
        let restored = base.epoch != current.epoch;
        let mut summary = Self {
            since: if restored { None } else { base.host_time },
            returned_at: current.host_time,
            away: None,
            rows: Vec::new(),
            restored,
        };
        if restored {
            return summary;
        }
        summary.away = base
            .host_time
            .zip(current.host_time)
            .and_then(|(start, end)| {
                end.utc_ms
                    .checked_sub(start.utc_ms)
                    .and_then(|ms| u64::try_from(ms).ok())
                    .map(Duration::from_millis)
            });
        let old: BTreeMap<_, _> = base.rows.iter().map(|row| (&row.id, &row.group)).collect();
        for row in &current.rows {
            let group = match row.group.as_str() {
                "NeedsYou" => AttentionGroup::NeedsYou,
                "OnHost" => AttentionGroup::OnHost,
                "Running" => AttentionGroup::Running,
                _ => continue,
            };
            let old_group = old.get(&row.id).copied();
            if old_group != Some(&row.group) {
                summary.rows.push(PresenceRow {
                    id: row.id.clone(),
                    old_group: old_group.cloned(),
                    group,
                });
            }
        }
        summary
    }
}

#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct PresenceUpdate {
    /// Persist this device-local baseline when Some. No core mutation happens here.
    pub baseline: Option<SeenBrief>,
}

pub struct PresenceTracker {
    was_present: bool,
    last_present: Option<SeenBrief>,
    persisted: Option<SeenBrief>,
    summary: Option<PresenceSummary>,
}

impl PresenceTracker {
    pub fn new(saved: Option<SeenBrief>) -> Self {
        Self {
            was_present: false,
            last_present: saved.clone(),
            persisted: saved,
            summary: None,
        }
    }

    pub fn summary(&self) -> Option<&PresenceSummary> {
        self.summary.as_ref()
    }

    pub fn update(&mut self, present: bool, current: SeenBrief) -> PresenceUpdate {
        let mut update = PresenceUpdate::default();
        if present {
            if let Some(base) = &self.last_present
                && (!self.was_present || base.epoch != current.epoch)
            {
                self.summary = Some(PresenceSummary::between(base, &current));
            }
            // Retain fresh host time in memory without dirtying the whole device
            // store on every frame. Flush it once on departure below.
            let changed = self.persisted.as_ref().is_none_or(|saved| {
                saved.epoch != current.epoch
                    || saved.seq != current.seq
                    || saved.rows != current.rows
            });
            if changed {
                self.persisted = Some(current.clone());
                update.baseline = Some(current.clone());
            }
            self.last_present = Some(current);
        } else if self.was_present {
            self.summary = None;
            if self.last_present != self.persisted {
                self.persisted = self.last_present.clone();
                update.baseline = self.last_present.clone();
            }
        }
        self.was_present = present;
        update
    }
}

/// Query only public OS state, on the main thread. Unknown is not presence.
/// The application must combine this with Brief focus and recent local input.
/// This is an OS-state probe, not proof of a human reading the application.
#[cfg(target_os = "macos")]
pub fn native_presence() -> Option<PresenceSignals> {
    use objc2::MainThreadMarker;
    use objc2_app_kit::{NSApplication, NSWindowOcclusionState};
    use objc2_foundation::{NSNumber, ns_string};

    #[link(name = "CoreGraphics", kind = "framework")]
    unsafe extern "C" {
        // SDK CGDisplayConfiguration.h: boolean_t is unsigned int,
        // CGDirectDisplayID is uint32_t. Neither function takes a pointer.
        fn CGDisplayIsAsleep(display: u32) -> u32;
        fn CGDisplayIsOnline(display: u32) -> u32;
    }

    let mtm = MainThreadMarker::new()?;
    let app = NSApplication::sharedApplication(mtm);
    let window = app.keyWindow()?;
    let screen = window.screen()?;
    let description = screen.deviceDescription();
    let value = description.objectForKey(ns_string!("NSScreenNumber"))?;
    let display = value.downcast_ref::<NSNumber>()?.unsignedIntValue();
    // SAFETY: the display ID comes from this window's NSScreen's NSNumber,
    // checked at runtime, not a guessed primary display or an object cast.
    let screen_awake = unsafe {
        if CGDisplayIsOnline(display) == 0 {
            return None;
        }
        CGDisplayIsAsleep(display) == 0
    };
    Some(PresenceSignals {
        key: app.isActive() && window.isKeyWindow(),
        visible: !app.isHidden()
            && window.isVisible()
            && !window.isMiniaturized()
            && window
                .occlusionState()
                .contains(NSWindowOcclusionState::Visible),
        screen_awake,
    })
}

#[cfg(not(target_os = "macos"))]
pub fn native_presence() -> Option<PresenceSignals> {
    None
}
