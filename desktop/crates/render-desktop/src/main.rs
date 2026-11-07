fn main() {
    let mut spec = render_desktop::app_spec();
    spec.init = render_desktop::initialize;
    rune::App::new(spec)
        .font_smoothing(rune::FontSmoothing::Off)
        .chrome(rune::Chrome {
            full_size_content: true,
            traffic_lights: Some((14.0, 11.0)),
            drag_regions: true,
        })
        .keep_running()
        .on_close(render_desktop::on_close)
        .on_focus(render_desktop::on_focus)
        .on_frame_drawn(render_desktop::on_frame_drawn)
        .on_ime(render_desktop::on_ime)
        .run();
}
