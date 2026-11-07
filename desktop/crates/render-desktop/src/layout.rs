#[derive(Clone, Copy, Debug)]
pub struct Axis {
    pub left: Option<(f32, f32)>,
    pub text: f32,
    pub measure: f32,
    pub notes: Option<(f32, f32)>,
}

impl Axis {
    /// Wide reading borrows the note rail; narrow windows keep safe edge padding.
    pub fn reading(width: f32, wide: bool) -> Self {
        let mut axis = Self::new(width);
        if wide {
            axis.measure = (width - axis.text - 32.0).max(axis.measure);
            axis.notes = None;
        }
        axis
    }
    pub fn new(width: f32) -> Self {
        if width < 1180.0 {
            let measure = 600.0_f32.min((width - 64.0).max(40.0));
            return Self {
                left: None,
                text: (width - measure) / 2.0,
                measure,
                notes: None,
            };
        }
        let padding = if width >= 1264.0 {
            (0.6 * (width - 1224.0)).floor()
        } else {
            24.0
        };
        let left_width = (width - 984.0).clamp(196.0, 200.0);
        let note_width = (width - 944.0).clamp(240.0, 320.0);
        let text = padding + left_width + 64.0;
        Self {
            left: Some((padding, left_width)),
            text,
            measure: 600.0,
            notes: Some((text + 640.0, note_width)),
        }
    }
}
