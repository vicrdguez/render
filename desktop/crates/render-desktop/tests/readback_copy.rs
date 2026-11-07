use render_core::CommandType;
use render_desktop::{AppState, app_spec, view};
use rune::{Env, Runtime, text::TextSystem};

#[test]
fn readback_tags_name_the_human_act_not_the_wire_command() {
    let spec = app_spec();
    let mut state = AppState::default();
    let (_, scene) = spec
        .scenes
        .iter()
        .find(|(name, _)| *name == "readback")
        .unwrap();
    scene(&mut state);
    let mut rt = Runtime::with_text(
        state,
        view,
        (800.0, 982.0),
        Env::default(),
        TextSystem::new(spec.fonts, spec.families),
    );
    for (command, label) in [
        (CommandType::ApproveCheckpoint, "APPROVE"),
        (CommandType::RequestRework, "REWORK"),
        (CommandType::RecordDecision, "ANSWER"),
        (CommandType::ConfirmShape, "CONFIRM"),
        (CommandType::AcceptIntake, "ACCEPT"),
        (CommandType::AcceptAmendment, "ACCEPT"),
        (CommandType::SupersedeContract, "SUPERSEDE"),
        (CommandType::CancelWork, "CANCEL"),
        (CommandType::SetCheckpointSettings, "ROUTE"),
        (CommandType::SavePolicyRevision, "SAVE"),
        (CommandType::AdoptPolicy, "ADOPT"),
    ] {
        rt.state
            .core
            .session
            .readback
            .as_mut()
            .unwrap()
            .action
            .command = command;
        rt.invalidate();
        rt.frame(0.0);
        assert!(
            rt.elements()
                .iter()
                .any(|e| e.text.as_deref() == Some(format!("◆ {label}").as_str())),
            "{command:?} must display the human act {label}"
        );
    }
}
