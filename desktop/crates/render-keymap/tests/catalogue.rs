use render_keymap::{Availability, Keymap, Resolution, Tier};

const TABLE: &str = include_str!("../../../assets/design/keymap.toml");

fn exact(map: &Keymap, mode: &str, ctx: &str, seq: &str, id: &str) {
    match map.resolve(mode, ctx, seq) {
        Resolution::Exact(found) => assert_eq!(found.command.id, id),
        other => panic!("expected {id}, got {other:?}"),
    }
}

#[test]
fn bundled_catalogue_preserves_commands_and_ex_aliases() {
    let map = Keymap::bundled().unwrap();
    assert_eq!(map.commands().len(), 115);
    assert_eq!(
        map.commands().iter().map(|c| c.keys.len()).sum::<usize>(),
        176
    );
    assert_eq!(map.by_ex(":brief").unwrap().id, "queue.open");
    assert_eq!(map.by_ex("x").unwrap().id, "review.save_close");
    assert!(map.by_ex("-").is_none());
    assert_eq!(map.by_ex("approve").unwrap().tier, Tier::Decide);
}

#[test]
fn resolution_inherits_shadows_and_respects_modes() {
    let map = Keymap::bundled().unwrap();
    exact(&map, "n", "filter", "<CR>", "list.open");
    exact(&map, "Normal", "diagram", "<CR>", "float.close");
    exact(&map, "n", "diagram", "-", "diagram.zoom");
    exact(&map, "Visual", "review", "c", "annotate");
    exact(&map, "Insert", "prompt", "<D-CR>", "chat.send");
    exact(&map, "n", "review", " aa", "auth.approve");
    exact(&map, "ho", "handover", "<leader>n", "handover.keys");
    assert!(matches!(
        map.resolve("n", "review", "<leader>a"),
        Resolution::Prefix
    ));
    for (mode, ctx, seq) in [
        ("i", "prompt", "<leader>aa"),
        ("n", "prompt", "<leader>aa"),
        ("n", "handover", "<leader>aa"),
        ("n", "explorer", "<leader>sf"),
        ("n", "missing", "q"),
        ("bad", "review", "q"),
        ("n", "review", "<bogus>"),
    ] {
        assert!(
            matches!(map.resolve(mode, ctx, seq), Resolution::NoMatch),
            "{mode} {ctx} {seq}"
        );
    }
}

#[test]
fn disabled_commands_remain_discoverable_with_context_reasons() {
    let map = Keymap::bundled().unwrap();
    let results = map.palette("approve", "list");
    assert_eq!(results.len(), 1);
    assert!(matches!(
        results[0].availability,
        Availability::Unavailable(_)
    ));
    assert_eq!(
        map.palette("approve", "review")[0].availability,
        Availability::Available
    );
    let children = map.children("<leader>a", "n", "list");
    assert_eq!(children.len(), 8);
    assert_eq!(
        children
            .iter()
            .filter(|c| c.availability == Availability::Available)
            .count(),
        1
    );
    assert!(
        children
            .iter()
            .any(|c| c.command.is_some_and(|c| c.id == "auth.cancel"))
    );
    assert!(
        map.children("<leader>", "n", "review")
            .iter()
            .any(|c| c.key == "a" && c.label == "◇ authorize")
    );
    assert_eq!(
        map.children("", "n", "diagram")
            .iter()
            .find(|c| c.key == "<CR>")
            .unwrap()
            .command
            .unwrap()
            .id,
        "float.close"
    );
    assert_eq!(map.palette("BRIEF", "review").len(), 0);
    assert_eq!(map.palette("brief", "review")[0].command.id, "queue.open");
}

#[test]
fn rejects_adversarial_tables_at_parse_boundary() {
    let cases = [
        ("schema = 1", "schema = 2"),
        (
            "id = \"view.switch\"",
            "host_trigger = true\nid = \"view.switch\"",
        ),
        ("id = \"view.switch\"", "id = \"find.object\""),
        ("ex = \"buffers\"", "ex = \"find\""),
        ("ex_aliases = [\"brief\"]", "ex_aliases = [\"find\"]"),
        ("reader = \"global\"", "reader = \"review\""),
        ("reader = \"global\"", "reader = \"missing\""),
        ("seq = \"<leader>.\"", "seq = \"<leader><leader>\""),
        ("seq = \"<leader>.\"", "seq = \"<leader>\""),
        ("seq = \"<leader>.\"", "seq = \"j\""),
        ("seq = \"<leader>.\"", "seq = \"gn\""),
        ("seq = \"<leader>.\"", "seq = \"<C-h>\""),
        ("seq = \"<leader>.\"", "seq = \"<leader>wq\""),
        ("seq = \"<leader>.\"", "seq = \"<wat>\""),
        ("seq = \"<leader>.\"", "seq = \"<label>\""),
        ("seq = \"<leader>aa\"", "seq = \"<leader>ba\""),
        ("seq = \"<leader>.\"", "seq = \"<leader>az\""),
        ("repeatable = false", "repeatable = true"),
        (
            "ctx = [\"review\", \"diff\"]\nwire = [\"approveCheckpoint\"]",
            "ctx = [\"global\"]\nwire = [\"approveCheckpoint\"]",
        ),
        (
            "ctx = [\"review\", \"diff\"]\nwire = [\"approveCheckpoint\"]",
            "ctx = [\"list\"]\nwire = [\"approveCheckpoint\"]",
        ),
        ("alias_of = \"open.chat\"", "alias_of = \"missing\""),
        ("alias_of = \"open.chat\"", "alias_of = \"auth.approve\""),
        ("shadows = \"parent\"", "shadows = \"anything\""),
        ("seq = \"<leader>cn\"", "seq = \"q\""),
        ("local_only = true", "local_only = false"),
        (
            "wire = [\"createDesign\"]",
            "wire = [\"createDesign\"]\nex_aliases = [\"q!\"]",
        ),
        (
            "mode = \"i\", ctx = \"prompt\", seq = \"<D-CR>\"",
            "mode = \"i\", ctx = \"prompt\", seq = \"<leader>z\"",
        ),
        ("seq = \"<leader>;\"", "seq = \"<D-j>\""),
    ];
    for (from, to) in cases {
        assert!(TABLE.contains(from), "missing mutation target {from}");
        assert!(
            Keymap::parse(&TABLE.replacen(from, to, 1)).is_err(),
            "accepted mutation {from} -> {to}"
        );
    }
}
