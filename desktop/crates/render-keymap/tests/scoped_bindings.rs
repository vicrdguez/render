use render_keymap::{Availability, Keymap, Resolution};

const TABLE: &str = include_str!("../../../assets/design/keymap.toml");

fn disjoint_prefix_table() -> String {
    TABLE
        .replace(
            "[groups]",
            "[groups]\n\"<leader>tf\" = \"follow or measure\"",
        )
        .replace(
            "ctx = [\"reader\"]\nkeys = [{ mode = \"n\", ctx = \"global\", seq = \"<leader>tw\"",
            "ctx = [\"evidence\"]\nkeys = [{ mode = \"n\", ctx = \"global\", seq = \"<leader>tfx\"",
        )
}

#[test]
fn available_longer_binding_remains_reachable_past_unavailable_exact() {
    let map = Keymap::parse(&disjoint_prefix_table()).unwrap();
    assert!(matches!(
        map.resolve("normal", "evidence", "<leader>tf"),
        Resolution::Prefix
    ));
    match map.resolve("normal", "evidence", "<leader>tfx") {
        Resolution::Exact(found) => {
            assert_eq!(found.command.id, "toggle.measure");
            assert_eq!(found.availability, Availability::Available);
        }
        other => panic!("unexpected {other:?}"),
    }
}

#[test]
fn unavailable_exact_keeps_reason_when_longer_binding_is_unavailable() {
    let map = Keymap::parse(&disjoint_prefix_table()).unwrap();
    match map.resolve("n", "list", "<leader>tf") {
        Resolution::Exact(found) => {
            assert_eq!(found.command.id, "toggle.follow");
            assert_eq!(
                found.availability,
                Availability::Unavailable("chat only".into())
            );
        }
        other => panic!("unexpected {other:?}"),
    }
    assert!(matches!(
        map.resolve("n", "list", "<leader>t"),
        Resolution::Prefix
    ));
}

#[test]
fn available_exact_precedes_even_an_available_longer_shadow_binding() {
    let source = disjoint_prefix_table().replace(
        "ctx = [\"evidence\"]\nkeys = [{ mode = \"n\", ctx = \"global\", seq = \"<leader>tfx\"",
        "ctx = [\"chat\"]\nkeys = [{ mode = \"n\", ctx = \"chat\", shadows = \"parent\", seq = \"<leader>tfx\"",
    );
    let map = Keymap::parse(&source).unwrap();
    match map.resolve("n", "chat", "<leader>tf") {
        Resolution::Exact(found) => {
            assert_eq!(found.command.id, "toggle.follow");
            assert_eq!(found.availability, Availability::Available);
        }
        other => panic!("unexpected {other:?}"),
    }
}

#[test]
fn unavailable_explicit_exact_shadow_still_wins_over_available_parent() {
    let source = TABLE.replace(
        "ctx = [\"diagram\"]\nnote = \"From fit-to-window",
        "ctx = [\"evidence\"]\nnote = \"From fit-to-window",
    );
    let map = Keymap::parse(&source).unwrap();
    match map.resolve("n", "diagram", "-") {
        Resolution::Exact(found) => {
            assert_eq!(found.command.id, "diagram.zoom");
            assert_eq!(found.binding.shadows.as_deref(), Some("parent"));
            assert_eq!(
                found.availability,
                Availability::Unavailable("evidence only".into())
            );
        }
        other => panic!("unexpected {other:?}"),
    }
}

#[test]
fn disjoint_command_contexts_select_the_available_binding() {
    let source = TABLE
        .replace("seq = \"<leader>tw\"", "seq = \"<leader>tf\"")
        .replace(
            "ctx = [\"reader\"]\nkeys = [{ mode = \"n\", ctx = \"global\", seq = \"<leader>tf\"",
            "ctx = [\"evidence\"]\nkeys = [{ mode = \"n\", ctx = \"global\", seq = \"<leader>tf\"",
        );
    let map = Keymap::parse(&source).unwrap();
    for (ctx, expected) in [("chat", "toggle.follow"), ("evidence", "toggle.measure")] {
        match map.resolve("n", ctx, "<leader>tf") {
            Resolution::Exact(found) => assert_eq!(found.command.id, expected),
            other => panic!("unexpected {other:?}"),
        }
    }
}
