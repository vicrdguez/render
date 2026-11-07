#[derive(Clone, Copy, Debug, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub enum Screen {
    Brief,
    Slices,
    Proposals,
    Results,
    Agents,
    Review,
    Diff,
    Dispositions,
    Chat,
    Decision,
    Evidence,
    Settings,
    Proposal,
    Operation,
    LocalPrompt,
}
impl Screen {
    pub fn context(self) -> &'static str {
        match self {
            Self::Brief => "list",
            Self::Slices => "slices",
            Self::Proposals | Self::Results | Self::Agents => "explorer",
            Self::Review | Self::Dispositions => "review",
            Self::Diff => "diff",
            Self::Chat => "chat",
            Self::Decision => "decision",
            Self::Evidence => "evidence",
            Self::Settings => "settings",
            Self::Proposal | Self::Operation | Self::LocalPrompt => "reader",
        }
    }
    pub fn title(self) -> &'static str {
        match self {
            Self::Brief => "Brief",
            Self::Slices => "Slices",
            Self::Proposals => "Proposals",
            Self::Results => "Results",
            Self::Agents => "Agents",
            Self::Review => "Review",
            Self::Diff => "Compare",
            Self::Dispositions => "Dispositions",
            Self::Chat => "Chat",
            Self::Decision => "Decision",
            Self::Evidence => "Evidence",
            Self::Settings => "Settings",
            Self::Proposal => "Proposal",
            Self::Operation => "Operation",
            Self::LocalPrompt => "Local check prompt",
        }
    }
    pub fn work(self) -> bool {
        !matches!(
            self,
            Self::Brief | Self::Slices | Self::Proposals | Self::Results | Self::Agents
        )
    }
    pub fn icon(self) -> &'static str {
        match self {
            Self::Brief => "brief",
            Self::Slices => "slices",
            Self::Agents => "agents",
            Self::Chat => "chat",
            Self::Settings => "settings",
            Self::Operation => "unknown",
            _ => "document",
        }
    }
}

#[derive(Clone, Debug)]
pub struct Tab {
    /// Process-local view identity; not host identity or persisted authority.
    pub(crate) identity: std::rc::Rc<()>,
    pub screen: Screen,
    pub object: Option<String>,
    /// Structured row/field index; never a source byte offset.
    pub cursor: usize,
    pub scroll: usize,
    pub reader: crate::reader::ReaderState,
    /// Some pins an exact recorded revision (including an explicitly absent revision).
    pub revision: Option<Option<String>>,
    pub restored_reader_byte: Option<usize>,
    pub outline_visible: bool,
    pub results: Option<crate::picker::Results>,
}
impl Tab {
    pub fn new(screen: Screen, object: Option<String>) -> Self {
        Self {
            identity: std::rc::Rc::new(()),
            screen,
            object,
            cursor: 0,
            scroll: 0,
            reader: crate::reader::ReaderState::default(),
            revision: None,
            restored_reader_byte: None,
            outline_visible: true,
            results: None,
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum PickerKind {
    Commands,
    Objects,
    Recent,
    Search,
    Tabs,
    Theme,
    History,
    Lines,
}

#[derive(Clone, Debug)]
pub enum Modal {
    Handover,
    Picker {
        kind: PickerKind,
        query: String,
        selected: usize,
    },
    Ex(String),
    Filter {
        selected: usize,
    },
    Readback,
    SaveDrafts {
        count: usize,
    },
    Outbox {
        selected: usize,
    },
    Url(String),
    ConfirmDiscard {
        object: String,
    },
    PolicyChanges {
        object: String,
    },
    Diagram {
        source: String,
        zoom: f32,
        pan: [f32; 2],
    },
    Info {
        title: String,
        lines: Vec<String>,
    },
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ComposeKind {
    Note,
    Chat,
    Decision,
    Emission,
    Policy,
}
