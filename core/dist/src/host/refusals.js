// docs/core/protocol.md, "A call". The HTTP layer takes each status from here.
export const statusOf = {
    bad_request: 400,
    bad_cursor: 400,
    unauthorized: 401,
    unknown_call: 404,
    unknown_project: 404,
    unknown_conversation: 404,
    unknown_decision: 404,
    too_large: 413,
    conflict: 409,
    not_open: 409,
    stale_basis: 409,
    unknown_choice: 409,
    bad_annotation: 409,
    extension_not_loaded: 409,
    bad_options: 409,
    options_invalid: 409,
    not_a_workflow: 409,
    unknown_model: 409,
    busy: 409,
    idle: 409,
    event_log: 409,
};
export const refuse = (code, message, fields = {}) => ({ refused: { ...fields, code, message } });
//# sourceMappingURL=refusals.js.map