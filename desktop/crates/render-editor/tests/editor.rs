use render_editor::{Editor, Mode};

fn keys(editor: &mut Editor, sequence: &[&str]) {
    for key in sequence {
        editor.handle_key(key);
    }
}

#[test]
fn constructors_and_replacement_reset_local_state() {
    let mut e = Editor::new("hello");
    assert_eq!(e.mode(), Mode::Normal);
    assert_eq!(e.cursor(), 0);
    keys(&mut e, &["x", "v", "l"]);
    e.set_text("世界");
    assert_eq!(e.text(), "世界");
    assert_eq!(e.cursor(), 0);
    assert_eq!(e.selection(), None);
    e.handle_key("u");
    assert_eq!(e.text(), "世界");
    assert_eq!(Editor::default().text(), "");
    assert_eq!(Editor::insert("note").mode(), Mode::Insert);
}

#[test]
fn unicode_motions_and_line_boundaries() {
    let mut e = Editor::new("é猫 z\n日本語\nx");
    keys(&mut e, &["l"]);
    assert_eq!(e.cursor(), 2);
    keys(&mut e, &["h"]);
    assert_eq!(e.cursor(), 0);
    keys(&mut e, &["w"]);
    assert_eq!(&e.text()[e.cursor()..], "z\n日本語\nx");
    keys(&mut e, &["b"]);
    assert_eq!(e.cursor(), 0);
    keys(&mut e, &["e"]);
    assert_eq!(e.cursor(), 2);
    keys(&mut e, &["0", "$"]);
    assert_eq!(e.cursor(), 6);
    keys(&mut e, &["j"]);
    assert_eq!(&e.text()[e.cursor()..], "語\nx");
    keys(&mut e, &["k", "0"]);
    assert_eq!(e.cursor(), 0);
    keys(&mut e, &["G"]);
    assert_eq!(&e.text()[e.cursor()..], "x");
    keys(&mut e, &["g", "g"]);
    assert_eq!(e.cursor(), 0);
}

#[test]
fn insert_escape_jk_and_literal_paste() {
    let mut e = Editor::default();
    keys(&mut e, &["i", "é", "j", "k"]);
    assert_eq!(e.text(), "é");
    assert_eq!(e.mode(), Mode::Normal);
    keys(&mut e, &["A"]);
    e.paste("jk ␣aa :approve");
    e.handle_key("Esc");
    assert_eq!(e.text(), "éjk ␣aa :approve");
    e.handle_key("u");
    assert_eq!(e.text(), "é");
    e.handle_key("C-r");
    assert_eq!(e.text(), "éjk ␣aa :approve");
    e.handle_key("i");
    e.set_composing(true);
    keys(&mut e, &["j", "k"]);
    assert_eq!(e.mode(), Mode::Insert);
    e.handle_key("Esc");
    assert_eq!(e.mode(), Mode::Insert);
    e.handle_key("Esc");
    assert_eq!(e.mode(), Mode::Normal);
}

#[test]
fn insert_editing_and_open_lines() {
    let mut e = Editor::new("one\ntwo");
    keys(&mut e, &["A", "!", "Backspace", "Enter", "x", "Esc"]);
    assert_eq!(e.text(), "one\nx\ntwo");
    keys(&mut e, &["O", "上", "Esc"]);
    assert_eq!(e.text(), "one\n上\nx\ntwo");
    keys(&mut e, &["o", "下", "Esc"]);
    assert_eq!(e.text(), "one\n上\n下\nx\ntwo");
    keys(&mut e, &["I", "a", " ", "b", "C-w"]);
    assert_eq!(e.text(), "one\n上\na 下\nx\ntwo");
    e.handle_key("C-u");
    assert_eq!(e.text(), "one\n上\n下\nx\ntwo");
}

#[test]
fn operators_word_end_and_backward_motion() {
    let mut e = Editor::new("one two three");
    keys(&mut e, &["d", "w"]);
    assert_eq!(e.text(), "two three");
    e.handle_key("u");
    keys(&mut e, &["c", "w", "X", "Esc"]);
    assert_eq!(e.text(), "X two three");
    e.handle_key("u");
    assert_eq!(e.text(), "one two three");
    keys(&mut e, &["w", "d", "b"]);
    assert_eq!(e.text(), "two three");
    keys(&mut e, &["d", "e"]);
    assert_eq!(e.text(), " three");
}

#[test]
fn text_objects_quotes_nested_brackets_and_paragraphs() {
    for (text, seq, expected) in [
        ("one two", vec!["d", "i", "w"], " two"),
        ("one two", vec!["d", "a", "w"], "two"),
        (
            "\"hé猫\" end",
            vec!["c", "i", "\"", "X", "Esc"],
            "\"X\" end",
        ),
        (
            "(outer (inner) tail)",
            vec!["w", "w", "d", "i", "("],
            "(outer () tail)",
        ),
        ("[one] two", vec!["d", "a", "b"], " two"),
        ("one\ntwo\n\nthree", vec!["d", "i", "p"], "\nthree"),
        ("one\ntwo\n\nthree", vec!["d", "a", "p"], "three"),
    ] {
        let mut e = Editor::new(text);
        keys(&mut e, &seq);
        assert_eq!(e.text(), expected, "{seq:?}");
    }
    let mut e = Editor::new("no quote");
    keys(&mut e, &["d", "i", "\""]);
    assert_eq!(e.text(), "no quote");
    assert_eq!(e.mode(), Mode::Normal);
}

#[test]
fn line_operators_register_and_put() {
    let mut e = Editor::new("one\ntwo\nthree");
    keys(&mut e, &["y", "y", "p"]);
    assert_eq!(e.text(), "one\none\ntwo\nthree");
    keys(&mut e, &["d", "d"]);
    assert_eq!(e.text(), "one\ntwo\nthree");
    keys(&mut e, &["P"]);
    assert_eq!(e.text(), "one\none\ntwo\nthree");
    keys(&mut e, &["c", "c", "X", "Esc"]);
    assert_eq!(e.text(), "one\nX\ntwo\nthree");
    e.handle_key("u");
    assert_eq!(e.text(), "one\none\ntwo\nthree");
    keys(&mut e, &["G", "d", "d"]);
    assert_eq!(e.text(), "one\none\ntwo");
    e.handle_key("p");
    assert_eq!(e.text(), "one\none\ntwo\nthree");
}

#[test]
fn tail_change_delete_join_and_character_put() {
    let mut e = Editor::new("abc\n  def");
    keys(&mut e, &["l", "D"]);
    assert_eq!(e.text(), "a\n  def");
    e.handle_key("u");
    keys(&mut e, &["C", "猫", "Esc"]);
    assert_eq!(e.text(), "a猫\n  def");
    keys(&mut e, &["J"]);
    assert_eq!(e.text(), "a猫 def");
    keys(&mut e, &["0", "x", "p"]);
    assert_eq!(e.text(), "猫a def");
    e.handle_key("P");
    assert_eq!(e.text(), "猫aa def");
}

#[test]
fn visual_ranges_are_inclusive_and_linewise() {
    let mut e = Editor::new("é猫x\nnext\nlast");
    keys(&mut e, &["v", "l"]);
    assert_eq!(e.selection(), Some(0..5));
    e.handle_key("d");
    assert_eq!(e.text(), "x\nnext\nlast");
    assert_eq!(e.mode(), Mode::Normal);
    assert_eq!(e.selection(), None);
    e.handle_key("u");
    keys(&mut e, &["V", "j"]);
    assert_eq!(e.selection(), Some(0..12));
    e.handle_key("y");
    assert_eq!(e.register(), "é猫x\nnext\n");
    keys(&mut e, &["g", "g", "v", "l", "c", "Z", "Esc"]);
    assert_eq!(e.text(), "Zx\nnext\nlast");
}

#[test]
fn undo_redo_branching_and_repeat_change() {
    let mut e = Editor::new("one two three");
    keys(&mut e, &["c", "i", "w", "X", "Esc", "w", "."]);
    assert_eq!(e.text(), "X X three");
    e.handle_key("u");
    assert_eq!(e.text(), "X two three");
    e.handle_key("Ctrl-r");
    assert_eq!(e.text(), "X X three");
    keys(&mut e, &["u", "x", "C-r"]);
    assert_eq!(e.text(), "X wo three");
    e.set_text("abcdef");
    keys(&mut e, &["x", "."]);
    assert_eq!(e.text(), "cdef");
}

#[test]
fn cancellation_and_unknown_keys_are_local() {
    let mut e = Editor::new("safe");
    keys(&mut e, &["d", "Esc", "l"]);
    assert_eq!(e.text(), "safe");
    assert_eq!(e.cursor(), 1);
    for key in ["Enter", "Cmd-Enter", "Alt-Enter", ":approve", "␣aa"] {
        assert!(!e.handle_key(key).handled);
        assert_eq!(e.text(), "safe");
    }
    keys(&mut e, &["d", "?", "x"]);
    assert_eq!(e.text(), "sfe");
}

#[test]
fn empty_buffers_and_unicode_sequences_never_split_bytes() {
    for initial in ["", "\n", "é猫🙂\n短\n", "e\u{301} x", "a"] {
        let mut e = Editor::new(initial);
        for key in [
            "h",
            "k",
            "$",
            "l",
            "j",
            "G",
            "v",
            "h",
            "y",
            "p",
            "x",
            "u",
            "C-r",
            "d",
            "d",
            "i",
            "🙂",
            "Backspace",
            "Esc",
            ".",
            "g",
            "g",
        ] {
            e.handle_key(key);
            assert!(e.text().is_char_boundary(e.cursor()), "{initial:?} {key}");
            if let Some(range) = e.selection() {
                assert!(e.text().is_char_boundary(range.start));
                assert!(e.text().is_char_boundary(range.end));
            }
        }
    }
}

#[test]
fn counted_motions_and_operators() {
    let mut e = Editor::new("one two three four five six seven");
    keys(&mut e, &["2", "d", "2", "w"]);
    assert_eq!(e.text(), "five six seven");
    keys(&mut e, &["2", "w"]);
    assert_eq!(&e.text()[e.cursor()..], "seven");
    keys(&mut e, &["0", "d", "G"]);
    assert_eq!(e.text(), "");
}

#[test]
fn inserted_text_is_one_undo_transaction_and_repeatable() {
    let mut e = Editor::new("ab");
    keys(&mut e, &["a"]);
    e.insert_text("猫");
    e.insert_text("🙂");
    e.handle_key("Esc");
    assert_eq!(e.text(), "a猫🙂b");
    keys(&mut e, &["l", "."]);
    assert_eq!(e.text(), "a猫🙂b猫🙂");
    e.handle_key("u");
    assert_eq!(e.text(), "a猫🙂b");
    e.handle_key("u");
    assert_eq!(e.text(), "ab");
}
