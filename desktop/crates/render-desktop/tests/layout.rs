use render_desktop::layout::Axis;

#[test]
fn work_axis_preserves_the_normative_measure_at_four_widths() {
    for (width, left, text, notes) in [
        (1512.0, Some(172.0), 436.0, Some(1076.0)),
        (1200.0, Some(24.0), 288.0, Some(928.0)),
        (1000.0, None, 200.0, None),
        (800.0, None, 100.0, None),
    ] {
        let axis = Axis::new(width);
        assert_eq!(axis.left.map(|r| r.0), left);
        assert_eq!(axis.text, text);
        assert_eq!(axis.notes.map(|r| r.0), notes);
        assert_eq!(axis.measure, 600.0);
    }
}

#[test]
fn narrow_axis_does_not_put_content_outside_the_window() {
    let axis = Axis::new(480.0);
    assert!(axis.text >= 24.0);
    assert!(axis.text + axis.measure <= 464.0);
}
