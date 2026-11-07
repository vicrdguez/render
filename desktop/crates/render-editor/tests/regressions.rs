use render_editor::{Editor, Mode};
fn keys(e: &mut Editor, keys: &[&str]) {
    for key in keys {
        assert!(e.handle_key(key).handled, "{key}");
    }
}

#[test]
fn visual_put_replaces_and_finishes_utf8_transaction() {
    let mut e = Editor::new("éabc");
    keys(&mut e, &["y", "l", "l", "l", "v", "0", "p"]);
    assert_eq!(e.selection(), None);
    assert_eq!(e.mode(), Mode::Normal);
    assert_eq!(e.text(), "éc");
    keys(&mut e, &["u"]);
    assert_eq!(e.text(), "éabc");
    keys(&mut e, &["C-r"]);
    assert_eq!(e.text(), "éc");
    let mut e = Editor::new("one\ntwo\nthree");
    keys(&mut e, &["y", "y", "j", "V", "p"]);
    assert_eq!(e.text(), "one\none\nthree");
    assert_eq!(e.selection(), None);
    keys(&mut e, &["u"]);
    assert_eq!(e.text(), "one\ntwo\nthree");
}
#[test]
fn character_find_operands_repeats_and_operators() {
    let mut e = Editor::new("abc def d猫\nd");
    keys(&mut e, &["f", "d"]);
    assert_eq!(e.cursor(), 4);
    keys(&mut e, &[";"]);
    assert_eq!(e.cursor(), 8);
    keys(&mut e, &[","]);
    assert_eq!(e.cursor(), 4);
    keys(&mut e, &["0", "t", "d"]);
    assert_eq!(e.cursor(), 3);
    keys(&mut e, &[";"]);
    assert_eq!(e.cursor(), 7);
    keys(&mut e, &["F", "a"]);
    assert_eq!(e.cursor(), 0);
    keys(&mut e, &["2", "f", "d"]);
    assert_eq!(e.cursor(), 8);
    keys(&mut e, &["T", "d"]);
    assert_eq!(e.cursor(), 5);
    keys(&mut e, &["0", "d", "f", "d"]);
    assert_eq!(e.text(), "ef d猫\nd");
    keys(&mut e, &["u", "0", "d", "t", "d"]);
    assert_eq!(e.text(), "def d猫\nd");
    let mut e = Editor::new("a1b1猫");
    keys(&mut e, &["f", "1"]);
    assert_eq!(e.cursor(), 1);
    keys(&mut e, &["f", "猫"]);
    assert_eq!(e.cursor(), 4);
    keys(&mut e, &["f", "z"]);
    assert_eq!(e.cursor(), 4);
}
#[test]
fn sentence_objects_and_counts() {
    for (text, seq, expected) in [
        ("One. Two.", vec!["d", "i", "s"], " Two."),
        ("One. Two.", vec!["d", "a", "s"], "Two."),
        ("É! 猫? Last.", vec!["2", "d", "i", "s"], " Last."),
        ("one two three", vec!["2", "d", "i", "w"], " three"),
        ("one two three", vec!["d", "2", "a", "w"], "three"),
        (
            "(outer (inner) tail)",
            vec!["w", "w", "2", "d", "i", "("],
            "()",
        ),
    ] {
        let mut e = Editor::new(text);
        keys(&mut e, &seq);
        assert_eq!(e.text(), expected);
        keys(&mut e, &["u"]);
        assert_eq!(e.text(), text);
    }
}
#[test]
fn counted_absolute_lines() {
    let mut e = Editor::new("one\ntwo\nthree");
    keys(&mut e, &["2", "G"]);
    assert_eq!(e.cursor(), 4);
    keys(&mut e, &["G"]);
    assert_eq!(e.cursor(), 8);
    keys(&mut e, &["2", "g", "g"]);
    assert_eq!(e.cursor(), 4);
    keys(&mut e, &["g", "g"]);
    assert_eq!(e.cursor(), 0);
    keys(&mut e, &["1", "G"]);
    assert_eq!(e.cursor(), 0);
    keys(&mut e, &["j", "d", "1", "G"]);
    assert_eq!(e.text(), "three");
    keys(&mut e, &["u", "1", "d", "G"]);
    assert_eq!(e.text(), "three");
}
#[test]
fn markdown_continuation_indent_and_plain_newline() {
    for (text, continued) in [
        ("- item", "- item\n- "),
        ("  * item", "  * item\n  * "),
        ("9. item", "9. item\n10. "),
        ("- [x] done", "- [x] done\n- [ ] "),
    ] {
        let mut e = Editor::new(text);
        keys(&mut e, &["A", "Enter"]);
        assert_eq!(e.text(), continued);
        keys(&mut e, &["C-t"]);
        assert!(e.text().ends_with(&format!(
            "\n  {}",
            continued.split('\n').next_back().unwrap()
        )));
        keys(&mut e, &["C-d"]);
        assert_eq!(e.text(), continued);
        keys(&mut e, &["Esc", "u"]);
        assert_eq!(e.text(), text);
        keys(&mut e, &["A", "C-Enter"]);
        assert_eq!(e.text(), format!("{text}\n"));
    }
}
#[test]
fn dot_replays_resolved_jk_not_new_timing() {
    let mut e = Editor::default();
    keys(&mut e, &["i", "j"]);
    std::thread::sleep(std::time::Duration::from_millis(350));
    keys(&mut e, &["k", "Esc"]);
    assert_eq!(e.text(), "jk");
    keys(&mut e, &["."]);
    assert_eq!(e.text(), "jjkk");
    keys(&mut e, &["u"]);
    assert_eq!(e.text(), "jk");
    let mut e = Editor::default();
    keys(&mut e, &["i", "x", "j", "k", "."]);
    assert_eq!(e.text(), "xx");
    assert_eq!(e.mode(), Mode::Normal);
}
