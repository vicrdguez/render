//! App-owned design fixtures. These are not a production protocol, source identities,
//! runner receipts, or evidence that any verification has actually run.
use render_core::*;

pub const REVIEW: &str = "review";
pub const CHAT: &str = "chat";
pub const DECISION: &str = "decision";
pub const EVIDENCE: &str = "evidence";
pub const PROPOSAL: &str = "proposal";
pub const SETTINGS: &str = "settings";
pub const OPERATION: &str = "operation";
pub const LOCAL_PROMPT: &str = "local-prompt";
pub const UNSUPPORTED: &str = "unsupported";
const TIME: HostTime = HostTime {
    utc_ms: 1_793_109_792_000,
    offset_min: 0,
};
const MODULES: &str = include_str!("../../../fixtures/modules-r2.md");
const PROMPT: &str = include_str!("../../../fixtures/local-prompt-3.md");

fn ago(seconds: i64) -> HostTime {
    HostTime {
        utc_ms: TIME.utc_ms - seconds * 1_000,
        ..TIME
    }
}

fn content(s: &str) -> Text {
    Text::Content(s.into())
}
fn host(s: &str) -> Text {
    Text::Host(s.into())
}
fn project() -> ProjectRef {
    ProjectRef {
        id: "demo".into(),
        name: "Render".into(),
    }
}
fn role() -> Role {
    Role {
        class: RoleClass::Coordinator,
        label: "coordinator".into(),
    }
}
fn stage(label: &str, state: StageState) -> TrackStage {
    TrackStage {
        label: label.into(),
        state,
        at: Some(TIME),
        detail: None,
    }
}
fn track(zoom: TrackZoom, stages: &[(&str, StageState)]) -> Track {
    Track {
        zoom,
        stages: stages.iter().map(|(l, s)| stage(l, *s)).collect(),
        calm: Some(content("DEMO · design fixture; no real execution")),
    }
}
fn next(kind: ActionKind, target: &str, commands: Vec<CommandType>) -> Next {
    Next::Act(NextAction {
        kind,
        target: target.into(),
        target_label: Some(
            match target {
                DECISION => "Q1",
                "decision-shape" => "shape",
                REVIEW => "Modules r2",
                PROPOSAL => "main",
                _ => target,
            }
            .into(),
        ),
        commands,
        basis_digest: None,
        since: Some(ago(match target {
            DECISION => 187200,
            "decision-shape" => 709200,
            REVIEW => 372,
            PROPOSAL => 4332,
            _ => 60,
        })),
        why: Some(content("inspect the supplied basis before acting")),
        options: None,
        url: None,
    })
}
fn basis(names: &[&str]) -> Basis {
    Basis {
        digest: "DEMO-basis-v1".into(),
        fields: names
            .iter()
            .map(|name| {
                let mut field = BasisField::named(name);
                field.revision = match *name {
                    "request" => Some("C2 · captured s2 · human"),
                    "emission" => Some("r2"),
                    "annotations" => Some("v3"),
                    "intake" => Some("none"),
                    "contract" => Some("K·40cc"),
                    "policy" => Some("pol3"),
                    "binding" => Some("bind1"),
                    "settings" => Some("s3"),
                    "report" | "audit" => Some("r1"),
                    _ => None,
                }
                .map(str::to_owned);
                field.digest = Some(format!("DEMO-{name}-digest"));
                field.changed_seq = Some(18342);
                field.changed_at = Some(TIME);
                field.changed_by = Some("DEMO fixture author".into());
                field
            })
            .collect(),
    }
}
fn action(command: CommandType, effect: &str, not: &str) -> HostAction {
    HostAction {
        command,
        option: None,
        option_kind: None,
        recommended: false,
        availability: Availability::Available,
        effect: Some(content(effect)),
        not: vec![content(not)],
        carries: None,
    }
}
fn decidable(target: &str, names: &[&str], actions: Vec<HostAction>) -> Decidable {
    Decidable {
        target: target.into(),
        subject: None,
        basis: basis(names),
        actions,
    }
}
fn object(id: &str, title: &str, body: ObjectBody) -> Object {
    Object {
        id: id.into(),
        revision: Some("r1".into()),
        title: Some(title.into()),
        project: Some(project()),
        workflow: Some(id.into()),
        handover: Handover {
            commitment: Some(Commitment {
                kind: CommitmentKind::Checkpoint,
                label: "Modules".into(),
                revision: Some("r2".into()),
                digest: Some("DEMO-commitment-digest".into()),
                scope: Some("design fixture only".into()),
                decided_by: Some(Decider::Human {
                    principal: "you".into(),
                    is_you: true,
                }),
                at: Some(TIME),
            }),
            owner: Some(Owner {
                who: OwnerKind::You,
                state: Some(content("inspect this scene")),
                wait: None,
            }),
            evidence: Some(EvidenceFact {
                summary: content("DEMO · illustrative source and evidence, not verification"),
                verdict: Some(Verdict::Unknown),
                source_digest: Some("DEMO-source".into()),
                current_head: Some("DEMO-source".into()),
                seq: Some(18342),
            }),
            blocker: Some(Blocker::None {
                uncertainties: 0,
                advisory_running: None,
            }),
            advisory: vec![],
        },
        next: Some(Next::Nothing),
        track: Some(track(
            TrackZoom::Design,
            &[
                ("Ground", StageState::Done),
                ("Seams", StageState::Done),
                ("Modules", StageState::NeedsYou),
                ("Proposal", StageState::Pending),
                ("Record", StageState::Pending),
            ],
        )),
        decidables: vec![],
        body,
    }
}
fn review() -> Object {
    let headings = [
        ("M1", "# Modules"),
        ("M2", "## Ledger"),
        ("M3", "## Engine"),
        ("M4", "## Desktop"),
        ("M5", "## Boundaries"),
    ];
    let nodes = headings
        .iter()
        .enumerate()
        .map(|(i, (id, title))| Node {
            id: (*id).into(),
            class: Some("section".into()),
            title: Some((*title).into()),
            byte_range: Some((
                MODULES.find(title).unwrap() as u64,
                headings
                    .get(i + 1)
                    .map(|(_, t)| MODULES.find(t).unwrap())
                    .unwrap_or(MODULES.len()) as u64,
            )),
        })
        .collect();
    let quote = "A model report is not a runner receipt.";
    let start = MODULES.find(quote).unwrap() as u64;
    let mut o = object(
        REVIEW,
        "Modules r2",
        ObjectBody::Review(Review {
            emission: REVIEW.into(),
            digest: Some("DEMO-9f3c-a1e2".into()),
            emitted_at: Some(ago(372)),
            previous: None,
            text: MODULES.into(),
            nodes,
            change_ranges: vec![(start, start + quote.len() as u64)],
            annotation_set: Some("v3".into()),
            annotations: vec![Annotation {
                id: "@7".into(),
                set_revision: "v3".into(),
                anchor: Anchor {
                    node: Some("M3".into()),
                    byte_start: start,
                    byte_end: start + quote.len() as u64,
                    quote: quote.into(),
                },
                body: content("Keep the runner receipt separate from the model report."),
                author: Some("you".into()),
                saved_at: Some(ago(132)),
            }],
            dispositions: vec![Disposition {
                annotation: "@7".into(),
                disposition: "considered".into(),
                reason: Some(content("The boundary is explicit in Engine.")),
                resulting: vec![("M3".into(), Some((start, start + quote.len() as u64)))],
            }],
            round: Some(RoundSummary {
                previous: "r1".into(),
                notes: 6,
                acted_on: 4,
                considered: 1,
                dismissed: 1,
                unanswered: 0,
            }),
            reviews: Some(ReviewCount {
                completed: 1,
                limit: 2,
            }),
            delegated: None,
            attributes_changed: false,
            fidelity: Some(content("DEMO · exact fixture Markdown bytes")),
        }),
    );
    o.revision = Some("r2".into());
    o.next = Some(next(
        ActionKind::Review,
        REVIEW,
        vec![CommandType::ApproveCheckpoint, CommandType::RequestRework],
    ));
    o.decidables.push(decidable(
        REVIEW,
        &[
            "request",
            "emission",
            "manifest",
            "annotations",
            "decisions",
            "intake",
            "policy",
            "binding",
        ],
        vec![
            action(
                CommandType::ApproveCheckpoint,
                "modules approved by you; the Proposal phase starts drafting",
                "Edited drafts are not approved; no Contract is accepted",
            ),
            action(
                CommandType::RequestRework,
                "modules r2 returns to the coordinator to draft r3 against saved notes",
                "Nothing is approved; the Proposal phase does not start",
            ),
        ],
    ));
    o
}
fn decision(id: &str, shape: bool) -> Object {
    let options = if shape {
        vec![
            (
                "Single Slice",
                "Keep one reviewable unit with a single Contract.",
            ),
            (
                "Design first",
                "Explore boundaries before accepting a Contract.",
            ),
        ]
    } else {
        vec![
            (
                "Accept the current dispositions",
                "One identity; an Output over both Axes is a definition error. Reducing one aliased Axis remains unsupported.",
            ),
            (
                "Forbid aliasing",
                "Amend the specification to require distinct caller Axes.",
            ),
            (
                "Define the semantics",
                "Clarify reductions and Outputs over aliased Axes before proceeding.",
            ),
        ]
    };
    let command = if shape {
        CommandType::ConfirmShape
    } else {
        CommandType::RecordDecision
    };
    let actions = options
        .iter()
        .enumerate()
        .map(|(i, _)| {
            let mut a = action(
                command,
                "records the selected direction; work resumes as a fresh attempt after quiescence",
                "Does not amend the Contract or specification; independent review still follows",
            );
            a.option = Some(i as u32 + 1);
            a.recommended = i == 0;
            a
        })
        .collect();
    let mut o = object(
        id,
        if shape {
            "Confirm task shape"
        } else {
            "Decision Q1"
        },
        ObjectBody::Decision(DecisionView {
            label: if shape { "Shape" } else { "Q1" }.into(),
            kind: DecisionKind::Product,
            question: content(if shape {
                "Should this task be one Slice or a design workflow?"
            } else {
                "What does a Call mean when it binds two distinct callee Axes to one caller Axis?"
            }),
            lede: Some(content(
                "this question illustrates a human decision, not an inferred classification.",
            )),
            source: Some("implement report r1".into()),
            asked_at: Some(TIME),
            blocks: Some(Downstream {
                direct: 4,
                transitive: 25,
            }),
            evidence: vec![
                content("§8.4 retains caller identity but leaves aliased reductions undefined."),
                content("The earlier F7 disposition treats both Axes as one identity."),
            ],
            options: options
                .iter()
                .enumerate()
                .map(|(i, (t, b))| DecisionOption {
                    n: i as u32 + 1,
                    kind: Some("product".into()),
                    title: content(t),
                    body: content(b),
                    recommended: i == 0,
                })
                .collect(),
            recommended_by: Some("coordinator".into()),
            observations: vec![content("F16 remains open pending your direction")],
            answer: None,
        }),
    );
    o.next = Some(next(
        if shape {
            ActionKind::ConfirmShape
        } else {
            ActionKind::Answer
        },
        id,
        vec![command],
    ));
    o.decidables.push(decidable(
        id,
        &["report", "contract", "source", "audit", "policy"],
        actions,
    ));
    o.handover.blocker = Some(Blocker::Typed(Blockage {
        wait: WaitClass::Human,
        id: Some("F16".into()),
        severity: Some("HARD".into()),
        text: content("aliased callee Axes undefined"),
        refs: vec![EVIDENCE.into()],
        since: Some(TIME),
        downstream: Some(Downstream {
            direct: 4,
            transitive: 25,
        }),
    }));
    o
}
fn evidence() -> Object {
    let mut o = object(
        EVIDENCE,
        "Execute symbolic Calls · evidence",
        ObjectBody::Evidence(EvidenceView {
            current_pass: Some(2),
            passes: vec![
                Pass {
                    ordinal: 1,
                    opened_by: Some("initial implementation".into()),
                    audit_examined: None,
                    submitted: Some("DEMO-029f917".into()),
                    prepared: Some("DEMO-b4d9a44".into()),
                    watchdog: vec![WatchdogRound {
                        round: 1,
                        reviewed: Some("DEMO-b4d9a44".into()),
                        verdict: Verdict::Fail,
                        counted: true,
                    }],
                    chain: vec![stage("Rework", StageState::Rework)],
                },
                Pass {
                    ordinal: 2,
                    opened_by: Some("Watchdog r1 rework".into()),
                    audit_examined: Some("DEMO-a6dcb53".into()),
                    submitted: Some("DEMO-5712d1a".into()),
                    prepared: Some("DEMO-3be1f0c".into()),
                    watchdog: vec![],
                    chain: vec![
                        stage("Audit", StageState::Done),
                        stage("Submitted", StageState::Done),
                        stage("Prepared", StageState::Done),
                        stage("Watchdog", StageState::Pending),
                    ],
                },
            ],
            findings: [
                ("W1", "BLOCK", "fixed", "integration conflict"),
                ("F12", "judge", "fixed", "duplicate Unsupported"),
                ("F13", "judge", "fixed", "third finding stanza"),
                ("F14", "judge", "fixed", "README scope sentence"),
                ("F15", "judge", "fixed", "whole-Time filter comment"),
                (
                    "F16",
                    "HARD",
                    "needs-human",
                    "aliased callee Axes undefined",
                ),
                ("F17", "judge", "considered", "generator skips whole-Time"),
            ]
            .iter()
            .map(|(id, severity, disposition, text)| Finding {
                id: (*id).into(),
                severity: Some((*severity).into()),
                disposition: Some((*disposition).into()),
                text: content(text),
                obligations: vec!["A1".into()],
            })
            .collect(),
            obligations: [
                ("B1", "definition errors and recursion"),
                ("B5", "whole-Time reaches through Calls"),
                ("A1", "unsupported list only shrinks"),
                ("M", "manual checks, advisory only"),
            ]
            .iter()
            .map(|(id, summary)| Obligation {
                id: (*id).into(),
                summary: content(summary),
                matrix: vec![
                    (
                        "Implementer · DEMO-5712d1a".into(),
                        Some(content("illustrative test result")),
                    ),
                    ("Audit · DEMO-a6dcb53".into(), Some(content("F16 open"))),
                    ("Watchdog".into(), None),
                ],
            })
            .collect(),
            reviews: Some(ReviewCount {
                completed: 1,
                limit: 2,
            }),
            web: vec![],
            native_checks: vec![content(
                "DEMO · macOS framework behavior and desktop interaction unrun; local prompt is advisory",
            )],
            gate_receipt: Some(content(
                "DEMO · design example of a gate receipt, not an executed gate or attestation",
            )),
        }),
    );
    o.next = Some(next(
        ActionKind::Answer,
        DECISION,
        vec![CommandType::RecordDecision],
    ));
    o.track = Some(track(
        TrackZoom::Pass,
        &[
            ("Contract", StageState::Done),
            ("Pass 1", StageState::Rework),
            ("Pass 2", StageState::NeedsYou),
            ("Integrated", StageState::Pending),
        ],
    ));
    o
}
fn readiness() -> Readiness {
    Readiness {
        eligibility: Some(host("eligible")),
        gaps: vec![],
        published: Some(content("R4")),
        promotion: Some(content("observed for R4")),
        forge: Some(content("ready PR #44; illustrative observation")),
        duplicate_risk_since: None,
        merged_differs: false,
    }
}
fn proposal() -> Object {
    let mut o = object(
        PROPOSAL,
        "Fast full test suite",
        ObjectBody::Proposal(ProposalView {
            intake: Some(content("K·5b20 accepted by you")),
            source: Some(content(
                "DEMO · R4 2c91e07; design fixture identity, not verified source",
            )),
            checks: Some(content(
                "DEMO · illustrative required checks on prepared source; no tests were run by this fixture",
            )),
            readiness: readiness(),
            findings: 1,
            deviations: 0,
            uncertainties: 1,
            advisory: vec![
                content("required forge checks were listed before publication; not observed again"),
                content("Local verification prompt is advisory; nothing waits on it"),
            ],
            local_prompt: Some(LOCAL_PROMPT.into()),
            slices: vec![ProposalSlice {
                id: EVIDENCE.into(),
                name: "finish-full-suite-optimization".into(),
                contract: Some("K·c3a0".into()),
                pass: Some(2),
                watchdog: Some(content("illustrative passing round")),
                fixed: Some(1),
            }],
        }),
    );
    let mut n = next(ActionKind::MergeMain, PROPOSAL, vec![]);
    if let Next::Act(a) = &mut n {
        a.url = Some("https://github.com/vicrdguez/skills/pull/44".into());
        a.target_label = Some("main".into());
        a.why = Some(content(
            "DEMO · opening this URL requires external-link confirmation; no machine merges main",
        ));
    }
    o.next = Some(n);
    o.track = Some(track(
        TrackZoom::Proposal,
        &[
            ("Integrated", StageState::Done),
            ("Published", StageState::Done),
            ("Merge main", StageState::NeedsYou),
        ],
    ));
    o.handover.blocker = Some(Blocker::None {
        uncertainties: 1,
        advisory_running: None,
    });
    o
}
fn settings() -> Object {
    let mut o = object(
        SETTINGS,
        "Settings · Render",
        ObjectBody::Settings(SettingsView {
            settings_revision: Some("s3".into()),
            changed_by: Some(Decider::Human {
                principal: "you".into(),
                is_you: true,
            }),
            changed_at: Some(TIME),
            routes: vec![
                ("seams".into(), RouteMode::Delegated, true),
                ("modules".into(), RouteMode::Delegated, true),
                ("proposal".into(), RouteMode::Human, false),
            ],
            pending: vec![content(
                "modules C2 captured s2 · human; pending requests keep their captured route",
            )],
            policy_default: Some("pol3".into()),
            policy_fields: vec![
                ("limit".into(), "2 completed reviews".into()),
                ("evidence".into(), "minimum rank tests".into()),
                ("reviewers".into(), "different family".into()),
            ],
            bindings: vec![(REVIEW.into(), "pol3".into(), "bind1".into())],
            history: vec![content(
                "DEMO · s3 by you · pol3 by you; design fixture history",
            )],
        }),
    );
    for field in ["seams", "modules"] {
        let mut d = decidable(
            SETTINGS,
            &["settings", "field"],
            vec![action(
                CommandType::SetCheckpointSettings,
                "new checkpoint requests capture the selected route",
                "Does not reroute pending requests; final acceptance stays yours",
            )],
        );
        d.subject = Some(field.into());
        d.basis.fields[1].revision = Some(field.into());
        o.decidables.push(d);
    }
    let mut d = decidable(
        SETTINGS,
        &["policy"],
        vec![action(
            CommandType::SavePolicyRevision,
            "saves a new default revision for new workflows",
            "Active workflows keep their binding until adoption; counts and findings stay",
        )],
    );
    d.subject = Some("policy".into());
    o.decidables.push(d);
    o
}
fn operation() -> Object {
    let mut o = object(
        OPERATION,
        "Create draft proposal PR",
        ObjectBody::Operation(OperationView {
            label: host("create draft proposal PR"),
            state: OperationState::Unknown,
            payload_digest: Some("DEMO-861a-8cf1".into()),
            attempts: vec![content(
                "attempt 1 admitted at 12:40; reply lost after request write",
            )],
            observations: vec![content(
                "listings at 12:45 and 13:02 found no matching PR; absence is not a verified association",
            )],
            blocks: vec![content("publishing"), content("ready promotion")],
            continues: vec![content("local work"), content("integration")],
            safe_choices: vec![
                content("Recheck the forge without creating a PR"),
                content("Inspect attempt 1"),
                content("Associate a verified external object"),
            ],
            next_check: Some(TIME.plus(std::time::Duration::from_secs(708))),
            duplicate_risk_since: Some(ago(4992)),
            recovery_decision: None,
        }),
    );
    o.track = Some(track(
        TrackZoom::Operation,
        &[
            ("Admitted", StageState::Done),
            ("Outcome unknown", StageState::Unknown),
            ("Resolved", StageState::Pending),
        ],
    ));
    o.handover.blocker = Some(Blocker::Typed(Blockage {
        wait: WaitClass::Effect,
        id: Some("DEMO-op9".into()),
        severity: None,
        text: content("duplicate risk remains until a host-recorded resolution"),
        refs: vec![],
        since: Some(TIME),
        downstream: None,
    }));
    o
}
fn chat() -> Object {
    object(CHAT,"Render host · chat",ObjectBody::Chat(Chat {
        roster:vec![RosterEntry { conversation:CHAT.into(),role:role(),candidate:None,assignment:Some("DEMO-as27".into()),model:Some("DEMO model".into()),state:Some("running".into()),since:Some(TIME) }],
        messages:vec![Message { id:"DEMO-message-1".into(),role:role(),at:Some(TIME),model:Some("DEMO model".into()),assignment:Some("DEMO-as27".into()),turn:Some("DEMO-t42".into()),receipt:None,body:MessageBody::Text { text:"DEMO · Modules r2 keeps Ledger independent of storage. Compare the boundaries before approving; a model report is not evidence.\n\nI will explore SQLite and file-backed candidates without changing the accepted Contract.".into(),streaming:false,truncated:false } },Message { id:"DEMO-message-2".into(),role:role(),at:Some(TIME),model:None,assignment:Some("DEMO-as27".into()),turn:Some("DEMO-t42".into()),receipt:None,body:MessageBody::Tool(ToolCall { name:"read".into(),args:Some("DEMO modules-r2.md".into()),outcome:ToolOutcome::Succeeded,exit_code:Some(0),duration_ms:Some(24),started_at:Some(TIME),status:Some(content("DEMO tool result; not a real invocation")),output:Some(REVIEW.into()),web:vec![] }) }],
        turn:Some(TurnState { turn:Some("DEMO-t42".into()),phase:TurnPhase::Running,since:Some(TIME),tools:Some(1) }),steers:vec![Steer { id:"DEMO-steer-1".into(),text:content("Keep storage backend-neutral."),delivery:Delivery::Delivered,delivered_after:Some("DEMO-message-1".into()),receipt:None }],artifacts:vec![TurnArtifact { key:REVIEW.into(),state:"emitted".into(),kind:Some("review".into()),at:Some(TIME),message:Some("DEMO-message-1".into()) }],complete:true,
    }))
}
// These retained work conversations supply real navigation targets for list examples.
// They do not invent completed checks or enable any authority commands.
fn work(id: &str, title: &str, wait: Option<WaitClass>) -> Object {
    let mut o = object(
        id,
        title,
        ObjectBody::Chat(Chat {
            roster: vec![],
            messages: vec![Message {
                id: format!("demo-{id}-status"),
                role: role(),
                at: Some(ago(180)),
                model: None,
                assignment: None,
                turn: None,
                receipt: None,
                body: MessageBody::Text {
                    text: format!(
                        "Design fixture conversation: {title}. The Brief illustrates the work state; no real execution or verification is claimed."
                    ),
                    streaming: false,
                    truncated: false,
                },
            }],
            turn: None,
            steers: vec![],
            artifacts: vec![],
            complete: true,
        }),
    );
    o.handover.commitment = None;
    o.handover.owner = Some(Owner {
        who: OwnerKind::Nobody,
        state: Some(content("Design fixture; inspect activity in the Brief")),
        wait,
    });
    o.handover.blocker = wait.map(|wait| {
        Blocker::Typed(Blockage {
            wait,
            id: None,
            severity: None,
            text: content(if wait == WaitClass::Slot {
                "Waiting for an execution slot"
            } else {
                "Waiting for qualifying integration"
            }),
            refs: vec![],
            since: Some(ago(2460)),
            downstream: None,
        })
    });
    o.track = Some(track(
        TrackZoom::Pass,
        &[
            ("Contract", StageState::Done),
            (
                "Implementation",
                if wait.is_some() {
                    StageState::Pending
                } else {
                    StageState::Running
                },
            ),
        ],
    ));
    o
}

fn snapshot(scope: Scope, resources: Vec<Resource>) -> Inbound {
    Inbound::Snapshot {
        scope,
        at: Cursor {
            epoch: Some("desktop-demo-v1".into()),
            scope_seq: 18342,
            ledger_seq: Some(18342),
            host_time: Some(TIME),
        },
        resources,
    }
}

/// Initial DEMO state. Each subscription has its own snapshot at the same ledger sequence.
/// Repeated calls return independent owned values; no IO or production decoding occurs.
pub fn snapshots() -> Vec<Inbound> {
    let prompt = object(
        LOCAL_PROMPT,
        "Local check prompt 3 · advisory",
        ObjectBody::LocalPrompt(LocalPrompt {
            version: Some(3),
            source: Some(content("R7 7f2c815 · illustrative PR #41 head")),
            current_source: Some("DEMO-R7".into()),
            gaps: vec![
                content("macOS framework behavior"),
                content("desktop interaction"),
            ],
            missing: vec![
                content("documented macOS signing prerequisite"),
                content("verified source checkout and real host enrollment"),
            ],
            created_at: Some(TIME),
            text: PROMPT.into(),
        }),
    );
    let unsupported = object(
        UNSUPPORTED,
        "Canvas metadata",
        ObjectBody::Unsupported {
            kind: "canvas-v2".into(),
            reason: Some(content(
                "this client cannot render canvas-v2; decisions are unavailable, never guessed",
            )),
            requires_client: Some("DEMO client 0.4".into()),
        },
    );
    let objects = vec![
        review(),
        chat(),
        decision(DECISION, false),
        evidence(),
        proposal(),
        settings(),
        operation(),
        prompt,
        unsupported,
        decision("decision-shape", true),
        work(
            "route-prompt",
            "Route a prompt by task shape into a single-slice Proposal",
            Some(WaitClass::Dependency),
        ),
        work(
            "evaluate-exact-sum",
            "Evaluate exact Sum with shared demand handling",
            Some(WaitClass::Slot),
        ),
        work("execute-causal-scan", "Execute causal Scan", None),
        work("auto-tag-bookmarks", "auto-tag-bookmarks", None),
        work(
            "specify-cma",
            "Specify CMA and its foundational Processors",
            None,
        ),
    ];
    let mut attention = vec![];
    for (id, group, mark, wait, reason, age, activity_age) in [
        (
            DECISION,
            AttentionGroup::NeedsYou,
            RowMark::NeedsYou,
            Some(WaitClass::Human),
            "F16 awaits your direction",
            187200,
            7200,
        ),
        (
            "decision-shape",
            AttentionGroup::NeedsYou,
            RowMark::NeedsYou,
            Some(WaitClass::Human),
            "task shape awaits confirmation",
            709200,
            10800,
        ),
        (
            PROPOSAL,
            AttentionGroup::NeedsYou,
            RowMark::NeedsYou,
            Some(WaitClass::Human),
            "merge main on the forge",
            4332,
            4332,
        ),
        (
            REVIEW,
            AttentionGroup::NeedsYou,
            RowMark::NeedsYou,
            Some(WaitClass::Human),
            "review Modules r2",
            372,
            132,
        ),
        (
            UNSUPPORTED,
            AttentionGroup::OnHost,
            RowMark::Failed,
            Some(WaitClass::Operator),
            "as38 quarantined; process alive after grace; inspect or restart the sandbox runtime",
            3132,
            180,
        ),
        (
            OPERATION,
            AttentionGroup::Waiting,
            RowMark::Unknown,
            Some(WaitClass::Effect),
            "forge reply lost; duplicate risk",
            4992,
            3672,
        ),
        (
            "route-prompt",
            AttentionGroup::Waiting,
            RowMark::Waiting,
            Some(WaitClass::Dependency),
            "dependency · integrate-fast-full-test-suite",
            345600,
            3600,
        ),
        (
            "evaluate-exact-sum",
            AttentionGroup::Waiting,
            RowMark::Waiting,
            Some(WaitClass::Slot),
            "waiting for an execution slot",
            2472,
            120,
        ),
        (
            "execute-causal-scan",
            AttentionGroup::Running,
            RowMark::Running,
            None,
            "implementer · pass 2 · editing evaluator",
            2460,
            60,
        ),
        (
            "auto-tag-bookmarks",
            AttentionGroup::Running,
            RowMark::Running,
            None,
            "Watchdog r1 · reading integrated diff",
            732,
            20,
        ),
        (
            "specify-cma",
            AttentionGroup::Running,
            RowMark::Running,
            None,
            "implementer · pass 1 · writing plan.md",
            492,
            180,
        ),
        (
            CHAT,
            AttentionGroup::Running,
            RowMark::Running,
            None,
            "coordinator turn running without an execution slot",
            672,
            40,
        ),
        (
            EVIDENCE,
            AttentionGroup::Done,
            RowMark::Done,
            None,
            "audit completed; not an integration verdict",
            5400,
            5400,
        ),
    ] {
        let o = objects.iter().find(|o| o.id == id).unwrap();
        attention.push(Resource::AttentionRow(AttentionRow {
            id: format!("attention-{id}"),
            object: id.into(),
            group,
            mark: Some(mark),
            title: o.title.clone(),
            project: Some(project()),
            proposal: Some("Render host design".into()),
            wait,
            since: Some(ago(age)),
            next: if group == AttentionGroup::NeedsYou {
                o.next.clone()
            } else {
                Some(Next::Nothing)
            },
            ask: Some(content(reason)),
            reason: Some(content(reason)),
            track: o.track.clone(),
            downstream: None,
            handover: o.handover.clone(),
            role: Some(match id {
                "execute-causal-scan" | "specify-cma" => Role {
                    class: RoleClass::Worker,
                    label: "implementer".into(),
                },
                "auto-tag-bookmarks" => Role {
                    class: RoleClass::Reviewer,
                    label: "Watchdog r1".into(),
                },
                _ => role(),
            }),
            pass: match id {
                "execute-causal-scan" => Some(2),
                "specify-cma" => Some(1),
                _ => None,
            },
            last_activity: Some(Activity {
                text: content(reason),
                at: Some(ago(activity_age)),
            }),
            seq: Some(18342),
            decidables: vec![],
        }));
    }
    attention.push(Resource::Slots(Slots {
        used: 2,
        total: 4,
        held_by_cancelled: 1,
    }));
    attention.push(Resource::Proposal(ProposalSummary {
        id: PROPOSAL.into(),
        project: Some(project()),
        name: "fast-full-test-suite".into(),
        title: Some("Fast full test suite".into()),
        shape: Some("proposal".into()),
        path: vec![
            stage("Integrated", StageState::Done),
            stage("Merge main", StageState::NeedsYou),
        ],
        readiness: readiness(),
        status: Some(content("merge main on the forge")),
        needs_you: true,
        superseded: false,
    }));
    attention.push(Resource::References(vec![
        Reference {
            label: "F16".into(),
            kind: "finding".into(),
            target: Some(EVIDENCE.into()),
            state: ReferenceState::Resolved,
            reason: None,
        },
        Reference {
            label: "Q1".into(),
            kind: "decision".into(),
            target: Some(DECISION.into()),
            state: ReferenceState::Resolved,
            reason: None,
        },
        Reference {
            label: "Modules r2".into(),
            kind: "review".into(),
            target: Some(REVIEW.into()),
            state: ReferenceState::Resolved,
            reason: None,
        },
    ]));
    let agents =
        [
            (
                "DEMO-as42",
                AgentGroup::Executing,
                Some(1),
                Some(Execution::Running),
                None,
                CHAT,
            ),
            (
                "DEMO-as38",
                AgentGroup::OnHost,
                Some(2),
                Some(Execution::Blocked),
                Some(Cancellation::Quarantined),
                UNSUPPORTED,
            ),
            (
                "DEMO-as27",
                AgentGroup::Held,
                None,
                Some(Execution::Running),
                None,
                CHAT,
            ),
        ]
        .into_iter()
        .map(|(id, group, slot, execution, cancellation, workflow)| {
            Resource::AgentRow(AgentRow {
            assignment: id.into(),
            generation: Some(1),
            group,
            slot,
            workflow: Some(workflow.into()),
            workflow_title: objects.iter().find(|o| o.id == workflow).and_then(|o| o.title.clone()),
            role: Some(role()),
            model: Some("DEMO model".into()),
            execution,
            cancellation,
            orphaned: false,
            since: Some(ago(match slot { Some(1) => 192, Some(2) => 3132, _ => 672 })),
            last_activity: Some(Activity {
                text: content("retained lifecycle observation"),
                at: Some(ago(match slot { Some(1) => 40, Some(2) => 180, _ => 60 })),
            }),
            lifecycle: if cancellation.is_some() {
                vec![
                    content("cancel requested; effect admissions fenced"),
                    content("stop requested; grace elapsed"),
                    content(
                        "quiescence NOT confirmed; workspace quarantined and slot retained",
                    ),
                ]
            } else {
                vec![content("assignment admitted")]
            },
            remedy: cancellation.map(|_| {
                content(
                    "Inspect or restart the sandbox runtime; replacement requires a new generation",
                )
            }),
            waits_on_you: false,
            conversation: Some(CHAT.into()),
            decidables: vec![],
        })
        })
        .chain([Resource::AgentTotals(AgentTotals {
            retained_workspaces: 3,
            workspace_bytes: 2_469_606_195,
            quota_bytes: Some(21_474_836_480),
        })])
        .collect();
    let slices = vec![
        Resource::LifecycleStates(vec![
            LifecycleState {
                state: "needs-human".into(),
                label: "needs human".into(),
                mark_classes: vec!["needs-you".into()],
                open: true,
            },
            LifecycleState {
                state: "integrated".into(),
                label: "integrated".into(),
                mark_classes: vec!["done".into()],
                open: false,
            },
        ]),
        Resource::SliceRow(SliceRow {
            id: DECISION.into(),
            workflow: DECISION.into(),
            project: Some(project()),
            proposal: Some(PROPOSAL.into()),
            title: Some("Execute symbolic Calls".into()),
            lifecycle: "needs-human".into(),
            wait: Some(WaitClass::Human),
            reason: Some(content("aliased callee Axes undefined")),
            since: Some(TIME),
            downstream: Some(Downstream {
                direct: 4,
                transitive: 25,
            }),
            assignment: None,
            next: Some(ActionKind::Answer),
            last_fact: Some(content("F16 requires a decision")),
        }),
    ];
    let mut events = vec![
        Inbound::Connection(ConnectionEvent::Live {
            host_name: Some("DEMO · local fixtures".into()),
            server_version: Some("desktop-demo/1".into()),
        }),
        Inbound::Admission(Admission::Open),
    ];
    events.extend(
        objects
            .into_iter()
            .map(|o| snapshot(Scope::Object(o.id.clone()), vec![Resource::Object(o)])),
    );
    events.push(snapshot(Scope::Attention, attention));
    events.push(snapshot(Scope::Agents, agents));
    events.push(snapshot(Scope::Slices, slices));
    events
}
