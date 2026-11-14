# Tau runtime-loading measurement probe

Probe: /tmp/tau-runtime-probe.uolLFS
Checkout commit: b6bc81457f230f9480c96bf2ccb6e27f0289bf62 (origin/render-core, detached)
Node: v24.22.1; platform: darwin/arm64; pi-durable/pi-schema: 1.5.2; jiti: 2.7.0.

No source edits, commits or pushes. Only fetched origin and created/built a temporary worktree as requested. The original worktree showed six deleted documentation files when inspected; this probe did not touch those paths. The untrusted /tmp/render-ground/pi loader was read, never executed. All server homes are under this probe directory; model calls use pi-ai faux.

## Setup commands

```sh
git -C /Users/vr-osxs/dev/render-core fetch origin
git -C /Users/vr-osxs/dev/render-core worktree add --detach /tmp/tau-runtime-probe.uolLFS/checkout origin/render-core
cd /tmp/tau-runtime-probe.uolLFS/checkout
/nix/var/nix/profiles/default/bin/nix develop -c typecheck
cd /tmp/tau-runtime-probe.uolLFS
npm install jiti@2.7.0
cd /tmp/tau-runtime-probe.uolLFS/ext/own
npm install  # package.json pins is-number 7.0.0 and pi-schema 1.5.2
```

## Q1 answer

Yes: aliases gave identical running function objects, TypeScript compiled on load, and the tool/decision/continuation journey worked over real HTTP and SQLite. Explicit exported-subpath aliases were required for the tested entry-file alias.

Default first import: 62.487 ms. Five independent process + empty transform-cache samples: 62.183, 63.601, 62.431, 64.476, 61.719 ms (median 62.431; mean 62.882; range 61.719–64.476). Host package native imports happened before the timer. These are not OS-disk-cache-cold measurements. The cold script adds fsCache pointing at a new probe-local empty directory; the primary q1 script uses the requested default options (moduleCache:false plus aliases).

All requested symbols are imported by ext/demo/index.ts. ext/demo/entry.ts is the second variant with entry. Function identity was tested with strict === against native host imports. The static baseline uses the identical authored body with its erasable generic removed and import specifiers replaced with resolved URLs, then native import, without jiti. Both journeys completed the then task with result yes, using two faux model requests.

Additional measured boundary: aliases applied to the TS entry and its transitive TS helper, but not inside a native-loaded .mjs or type:module .js helper. With a second pi-schema installed in the extension's own node_modules, those native helpers re-exported the extension's own obj, not the host's. See native-alias-boundary.log. Thus the measured direct-TS identity success is not a guarantee that aliases rewrite native dependency internals.

Not measured: extension type correctness (jiti is not a type checker), OS-cold disk/cache startup, other platforms/Node versions.

## Q2 answer

Yes via internals, not a public host operation: a missing task resumed, the existing agent gained the tool on its next request, the in-progress run completed, and a second project stayed untouched. The three internal mutations alone do not refresh the host's Options cache.

Exact access: wrap Projects.prototype.start to capture its this; call projects.get('p') to reach the real store and registry. Hold the mutable modules object supplied to startServer. While the server is already serving, jiti-import ext/late/index.ts, set modules.late, call open.registry.install(late.extension), then replace open.selection.defaults with its prior defaults plus the extension. selection is an ordinary runtime object property despite not being included in the public OpenProject type.

A registry-only install woke task scheduling but did not add the tool to the bare agent; the selection refresh was also necessary. The already-listed addExtensions call is a no-op and did not reinstall the deliberately uninstalled extension. The late module exports options; extensions lists its schema, but options returns no item and setOptions refuses with bad_options because startServer's host.options map was only initialized at startup.

Code-read requirement requested by the owner (NOT an implemented operation or measured LOC): startServer would need to expose a module-registration operation updating its module catalogue and host.options cache, and Projects would need a callable route to its existing #install refresh for already-open projects selecting that name. Approximately 20–30 lines of glue, excluding loading/discovery/validation. This estimate is not a measurement.

Not measured: a public registration API (none exists); successful live Options-cache registration; simultaneous callers or crash/reconnect during installation. Mid-run evidence is one held model request, unchanged LiveDoc.run during install, next-request tool lists, successful read/late_tool results, and a done submission. An abort signal after an async tool-producing provider response also occurred in the no-install control; the run itself did not abort.

## Q3 answer

Yes for transformed TS files and compatible registry definitions, but moduleCache:false does not invalidate native ESM/CJS module caches. Live registry install replaces the same-name extension, not duplicates it. A running task finishes its current old phase and hands over to compatible new code at its next phase. An in-flight old tool finishes with its old result; the next call uses new code.

Both true waiting (allSettled on a child) and sleeping tasks resumed under new code. Same-version replacement worked; a higher version without migrate left a sleeping task blocked migration_failed, while an already-running old definition completed with task_outdated. Adding an identity migrator then resumed the sleeping task as version 2.

H12 is confirmed for uninstall. For compatible replacement, it differs: the invocation is not interrupted in its current phase, but a stored running(second) -> pending(second) -> running(second) handover occurred, and second ran the replacement. The actual edited-and-reloaded TS probe observed this transition, not just statically authored old/new definitions.

### Q3(a): Markdown-only changes in actual W2 source

Copied packages/w2/src to ext/w2-prose. After first import, changed only agent.md and jiti-imported index.ts again. index.ts SHA-256 stayed 4f7bc3bdf14d9b2f0432d27561d608750cacef43e3b8f0017d4b9c486e009678. The second module returned the new Markdown in entry().instructions (13.978 ms in the final run); the previously loaded module still returned the old text.

Crucial separate measurement: on the real host, replace W2 in its live registry while an existing conversation is mid-run. Both its initial and next request retained old prose, while a newly created W2 conversation used the new prose. W2.entry persists instructions in pi.agent; loading new code alone did not rewrite that stored field. Both runs completed done.

### Q3(b): reopen only project A

A listed W2; B listed none. To reach genuine internals without source edits, a Node registerHooks load hook exposed the compiled Projects private fields/methods as underscore properties IN MEMORY ONLY. No other behavior was rewritten. Captured the same Projects object startServer uses. On A only, called old harness.close(ctx), released its lock, removed A from the open map, then called existing #openDirectory and #finish with A's unchanged project record. modules.w2 had already been replaced with the jiti-reimported W2 module. B's harness and registry object identities stayed unchanged.

A close/reopen took 3.605 ms in the recorded run. B's held 2.2-second faux model request continued, same live run, no abort while held, done; B's open and timeline HTTP streams stayed open and its conversation stream advanced from 1 to 5 frames. A's existing open and timeline streams ended with end.reason=failed. An explicit new A open stream reconnected successfully and remained open.

A's stored W2 timer fired using the replacement task (registry identity matched the new due task, and its emitted event included CYCLE-TASK-NEW). A's new W2 conversation had CYCLE-PROSE-NEW; A's existing one still had its old persisted instructions, even after reopen. A's held model request was interrupted by close and resent after reopen: two provider attempts, same submission id 37, eventual done. Resending the same HTTP input requestId returned that same done submission.

Requested source-level size estimate, not an implementation/measurement: about 15–25 lines for a one-project reopen wrapper reusing Projects.#serial, shut, #openDirectory and #finish; protocol wiring, failure recovery and any stream rebinding are excluded. The measured raw probe body has five listed operations; no ordinary public reopen call exists today.

### Q3(c): stored task versions

Read the installed README (Reload, Persist and Resume, and task examples), dist/types.d.ts TaskDefinition and dist/harness/scheduler.js #resolve/#fit. migrate(input, checkpoint, fromVersion) is called when resolving an older stored definition for execution; its returned input/checkpoint and new version are persisted before the replacement runs. In the isolated timer measurement, no migration happened synchronously at install or during 20 ms while the timer was not due. At the due time, v2's migrator ran exactly once with fromVersion=1, changed both input and checkpoint, and new code completed the task as version 2.

Same version with different code ran new wake code against the untouched v1 input/checkpoint, without calling migrate (even though supplied), and without rerunning initial(). V2 without migrate installed successfully but the due timer stayed blocked migration_failed: Task timer.probe version 2 has no migration from 1.

### Q3(d): live in-flight replacement

The actual-edited-file probe held an old custom task phase and an old tool call, changed index.ts from old to new, jiti-reimported, then registry.install(new.extension). The task was still running and both old bodies still held after replacement. Once released, old tool finished with old output, next tool call used new output, and model requests saw tool description old then new then new. The old task phase finished old code, then the second phase used new code through a recorded pending handover.

Not measured: crashes during replacement/cycling; unsafe tool side-effect replay during project cycling; aggregate inbox stream rebinding; renamed/removed checkpoint phases; application-specific migration beyond the tested input/checkpoint transformation; other platforms/runtime versions. Native ESM/CJS stale code and native-helper second-copy identities are measured, not unmeasured cases.

## Source read (not executed from the untrusted tree)

- packages/host/src/index.ts: startServer, modules, host.options initialization.
- packages/host/src/projects.ts: Projects.start/get/#install/addExtensions and per-project default selection.
- packages/host/src/calls.ts: HTTP catalogue/options calls.
- packages/host/test/helpers.ts and extensions.ts: faux setup, HTTP pairing and decisions.
- packages/tau/test/w2.test.ts: missing-extension journey.
- docs/core/spikes/host.mjs: H12.
- installed pi-durable README.md in full: Reload, Persist and Resume, task examples.
- installed pi-durable dist/types.d.ts: TaskDefinition.migrate.
- installed pi-durable dist/harness/registry.js: RegistryImpl.install/#publish, same-name replacement.
- installed pi-durable dist/harness/scheduler.js: registry subscription and #progress handover.
- installed pi-durable dist/harness/harness.js and tool.js: agent resolution and captured in-flight tool.
- /tmp/render-ground/pi/packages/coding-agent/src/core/extensions/loader.ts: read only.

## Setup: full recorded output

Working directory: /tmp/tau-runtime-probe.uolLFS/checkout

```sh
/nix/var/nix/profiles/default/bin/nix develop -c typecheck
```

```text
workspace lock: pass
workspace import boundaries: pass
```

## Setup evidence: actual versions, architecture, SQLite files, no demo build outputs: full recorded output

Working directory: /tmp/tau-runtime-probe.uolLFS/checkout

```sh
/nix/var/nix/profiles/default/bin/nix develop -c node --experimental-import-meta-resolve /tmp/tau-runtime-probe.uolLFS/evidence.mjs
```

```text
runtime {"node":"v24.22.1","platform":"darwin","arch":"arm64"}
installed version {"name":"jiti","version":"2.7.0"}
installed version {"name":"pi-durable","version":"1.5.2"}
installed version {"name":"pi-schema","version":"1.5.2"}
installed version {"name":"is-number","version":"7.0.0"}
demo folder files ["entry.ts","facade.ts","future-package.ts","index.ts","nonerasable.ts","subpath.ts","syntax.ts","throw.ts"]
real SQLite file {"file":"/tmp/tau-runtime-probe.uolLFS/homes/q1/projects/p/store.sqlite","bytes":126976,"header":"SQLite format 3\u0000"}
real SQLite file {"file":"/tmp/tau-runtime-probe.uolLFS/homes/q2-1794670543927/projects/p/store.sqlite","bytes":131072,"header":"SQLite format 3\u0000"}
cold cache files ["1-index.a448dce8.mjs"]
alias lexical and real paths {"lexical":"/tmp/tau-runtime-probe.uolLFS/checkout/node_modules/@earendil-works/pi-durable/dist/index.js","real":"/nix/store/a9bcb3d484glhv4isgch8bynmy4afnay-tau-workspace-node-modules-0.0.0/node_modules/@earendil-works/pi-durable/dist/index.js"}
```

## Q1: primary alias and HTTP journey: full recorded output

Working directory: /tmp/tau-runtime-probe.uolLFS/checkout

```sh
/nix/var/nix/profiles/default/bin/nix develop -c node --experimental-import-meta-resolve /tmp/tau-runtime-probe.uolLFS/q1.mjs
```

```text
environment {"node":"v24.22.1","jiti":"2.7.0","durable":"1.5.2","aliases":{"tau-store":"/private/tmp/tau-runtime-probe.uolLFS/checkout/packages/store/dist/src/index.js","tau-store/host":"/private/tmp/tau-runtime-probe.uolLFS/checkout/packages/store/dist/src/host.js","tau-kit":"/private/tmp/tau-runtime-probe.uolLFS/checkout/packages/kit/dist/src/index.js","@earendil-works/pi-durable":"/nix/store/a9bcb3d484glhv4isgch8bynmy4afnay-tau-workspace-node-modules-0.0.0/node_modules/@earendil-works/pi-durable/dist/index.js","@earendil-works/pi-schema":"/nix/store/a9bcb3d484glhv4isgch8bynmy4afnay-tau-workspace-node-modules-0.0.0/node_modules/@earendil-works/pi-schema/dist/index.js"}}
first import ms 62.487
identity {"request":true,"defineTask":true,"obj":true}
target form {"real":false,"piTarget":"/nix/store/a9bcb3d484glhv4isgch8bynmy4afnay-tau-workspace-node-modules-0.0.0/node_modules/@earendil-works/pi-durable/dist/index.js","request":true,"defineTask":true,"obj":true}
target form {"real":true,"piTarget":"/nix/store/a9bcb3d484glhv4isgch8bynmy4afnay-tau-workspace-node-modules-0.0.0/node_modules/@earendil-works/pi-durable/dist/index.js","request":true,"defineTask":true,"obj":true}
subpath {"explicit":false,"error":"Error","message":"Cannot find module '/private/tmp/tau-runtime-probe.uolLFS/checkout/packages/store/dist/src/index.js/host'\nRequire stack:\n- /tmp/tau-runtime-probe.uolLFS/ext/demo/subpath.ts"}
subpath {"explicit":true,"identity":true}
aliased reexport identity true
nonerasable TS 7
load error {"name":"syntax","type":"Error","message":"ParseError: Unexpected token  \n /tmp/tau-runtime-probe.uolLFS/ext/demo/syntax.ts:1:22"}
process alive after syntax true
load error {"name":"throw","type":"Error","message":"probe top-level throw"}
process alive after throw true
HTTP bind {"status":200,"body":{"result":{"project":{"project":"p","workdir":"/tmp/tau-runtime-probe.uolLFS","extensions":["demo"],"missing":[]},"repeated":false}}}
HTTP extensions {"status":200,"body":{"result":{"items":[{"name":"demo","workflow":true,"schema":{"type":"object","properties":{"label":{"type":"string","default":"probe"}},"required":["label"],"additionalProperties":false}}]}}}
HTTP options {"status":200,"body":{"result":{"items":[{"extension":"demo","schema":{"type":"object","properties":{"label":{"type":"string","default":"probe"}},"required":["label"],"additionalProperties":false},"value":{},"errors":[]}]}}}
HTTP create {"conversation":13}
HTTP input {"status":200,"body":{"result":{"submission":{"id":20,"conversationId":13,"requestId":"client:probe:ask","type":"input","status":"placed","entry":19}}}}
HTTP decision {"status":200,"body":{"result":{"decision":{"id":"demo:one#1","subject":"demo:one","title":"Probe","basis":25,"choices":["yes","no"],"conversation":13,"then":{"task":"demo.then"},"requestedAt":1794669738465,"status":"open"},"text":"Probe decision"}}}
HTTP answer {"status":200,"body":{"result":{"decision":{"id":"demo:one#1","subject":"demo:one","title":"Probe","basis":25,"choices":["yes","no"],"conversation":13,"then":{"task":"demo.then"},"requestedAt":1794669738465,"status":"answered","choice":"yes","annotations":[],"by":"probe","at":1794669738473,"continuation":31},"repeated":false}}}
HTTP then {"status":200,"body":{"result":{"decision":{"id":"demo:one#1","subject":"demo:one","title":"Probe","basis":25,"choices":["yes","no"],"conversation":13,"then":{"task":"demo.then"},"requestedAt":1794669738465,"status":"answered","choice":"yes","annotations":[],"by":"probe","at":1794669738473,"continuation":31},"text":"Probe decision","then":{"status":"terminal","outcome":{"status":"completed","result":"yes"}}}}}
model calls 2
```

## Q1: five cold-transform samples: full recorded output

Working directory: /tmp/tau-runtime-probe.uolLFS/checkout

```sh
for i in 1 2 3 4 5; do /nix/var/nix/profiles/default/bin/nix develop -c node --experimental-import-meta-resolve /tmp/tau-runtime-probe.uolLFS/cold.mjs "$i"; done
```

```text
cold sample {"id":"1","ms":62.183,"identities":[true,true,true]}
cold sample {"id":"2","ms":63.601,"identities":[true,true,true]}
cold sample {"id":"3","ms":62.431,"identities":[true,true,true]}
cold sample {"id":"4","ms":64.476,"identities":[true,true,true]}
cold sample {"id":"5","ms":61.719,"identities":[true,true,true]}
```

## Q1: installed dependency, real second copy, symlink targets, live-host errors, static baseline: full recorded output

Working directory: /tmp/tau-runtime-probe.uolLFS/checkout

```sh
/nix/var/nix/profiles/default/bin/nix develop -c node --experimental-import-meta-resolve /tmp/tau-runtime-probe.uolLFS/q1-extra.mjs
```

```text
own dependency {"isNumber":true,"requestIdentity":true,"defineTaskIdentity":true,"schemaIdentity":true,"secondInstalledSchemaIdentity":false}
second copy without alias {"nativeSecondSameAsJiti":true,"hostIdentity":false}
checkout node_modules targets {"targets":{"tau-store":"/tmp/tau-runtime-probe.uolLFS/checkout/node_modules/tau-store/dist/src/index.js","tau-store/host":"/tmp/tau-runtime-probe.uolLFS/checkout/node_modules/tau-store/dist/src/host.js","tau-kit":"/tmp/tau-runtime-probe.uolLFS/checkout/node_modules/tau-kit/dist/src/index.js","@earendil-works/pi-durable":"/tmp/tau-runtime-probe.uolLFS/checkout/node_modules/@earendil-works/pi-durable/dist/index.js","@earendil-works/pi-schema":"/tmp/tau-runtime-probe.uolLFS/checkout/node_modules/@earendil-works/pi-schema/dist/index.js"},"request":true,"defineTask":true,"obj":true}
error while server live {"name":"syntax","type":"Error","message":"ParseError: Unexpected token  \n /tmp/tau-runtime-probe.uolLFS/ext/demo/syntax.ts:1:22"}
server still responds after syntax {"status":200,"body":{"result":{"items":[]}}}
error while server live {"name":"throw","type":"Error","message":"probe top-level throw"}
server still responds after throw {"status":200,"body":{"result":{"items":[]}}}
static module identity {"request":true,"defineTask":true,"obj":true}
static baseline {"http":200,"then":{"status":"terminal","outcome":{"status":"completed","result":"yes"}},"modelCalls":2}
```

## Q1: packaged subpath facades and native-strip control: full recorded output

Working directory: /tmp/tau-runtime-probe.uolLFS/checkout

```sh
/nix/var/nix/profiles/default/bin/nix develop -c node --experimental-import-meta-resolve /tmp/tau-runtime-probe.uolLFS/subpaths-extra.mjs
```

```text
node_modules subpath facade {"defineTask":true,"obj":true}
bare import own copy without alias {"hostIdentity":false}
native Node nonerasable control {"type":"SyntaxError","code":"ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX","message":"TypeScript enum is not supported in strip-only mode"}
```

## Q2: live installation in real host, two projects and mid-run conversation: full recorded output

Working directory: /tmp/tau-runtime-probe.uolLFS/checkout

```sh
/nix/var/nix/profiles/default/bin/nix develop -c node --experimental-import-meta-resolve /tmp/tau-runtime-probe.uolLFS/q2.mjs
```

```text
prepared sleeping task {"id":18,"conversationId":12,"kind":"late.due","version":1,"input":{},"background":true,"abortRequested":false,"state":{"status":"sleeping","checkpoint":{"phase":"wake"},"until":1794670544925},"startedAt":1794670543925}
restart no modules {"status":200,"body":{"result":{"items":[{"project":"p","workdir":"/tmp/tau-runtime-probe.uolLFS","extensions":["late"],"missing":["late"]}]}}}
bind missing repeated {"status":200,"body":{"result":{"project":{"project":"p","workdir":"/tmp/tau-runtime-probe.uolLFS","extensions":["late"],"missing":["late"]},"repeated":true}}}
before installation blocked {"record":{"id":18,"conversationId":12,"kind":"late.due","version":1,"input":{},"background":true,"abortRequested":false,"state":{"status":"sleeping","checkpoint":{"phase":"wake"},"until":1794670544925},"startedAt":1794670543925},"state":{"kind":"blocked","reason":"missing_task"}}
before agents {"p":["read","write","edit","bash"],"q":["read","write","edit","bash"]}
runtime jiti import ms 0.63
registry only agent tools ["read","write","edit","bash"]
internal calls {"capture":"Projects.prototype.start wrapper captures this","map":"modules.late=late","registry":"projects.get(\"p\").registry.install(late.extension)","selection":"projects.get(\"p\").selection.defaults=[...defaults,late.extension]"}
waiting task resumed {"ms":0.856,"state":{"status":"terminal","outcome":{"status":"completed","result":"woke"}},"resumed":1}
midrun before release {"sameRun":true,"aborted":false}
after HTTP extensions {"status":200,"body":{"result":{"items":[{"name":"late","workflow":false,"schema":{"type":"object","properties":{"label":{"type":"string","default":"late-default"}},"required":["label"],"additionalProperties":false}}]}}}
after HTTP projects {"status":200,"body":{"result":{"items":[{"project":"p","workdir":"/tmp/tau-runtime-probe.uolLFS","extensions":["late"],"missing":[]},{"project":"q","workdir":"/tmp/tau-runtime-probe.uolLFS","extensions":[],"missing":[]}]}}}
live-added options view {"status":200,"body":{"result":{"items":[]}}}
live-added setOptions {"status":409,"body":{"refused":{"errors":[{"path":"","keyword":"options","message":"late has no options"}],"code":"bad_options","message":"late has no options."}}}
after agents {"p":["read","write","edit","bash","late_tool"],"q":["read","write","edit","bash"],"qRegistry":["coding-tools"]}
midrun completed {"result":{"conversationId":12,"requestId":"midrun","type":"input","status":"done","entry":19,"id":20,"answer":32},"providerSignalAbortedAfterResponse":true,"toolExecutions":1,"requests":[{"before":true,"tools":["read","write","edit","bash"]},{"before":false,"tools":["read","write","edit","bash","late_tool"],"results":[{"tool":"read","isError":false}]},{"before":false,"tools":["read","write","edit","bash","late_tool"],"results":[{"tool":"read","isError":false},{"tool":"late_tool","isError":false}]}]}
second project request tools ["read","write","edit","bash"]
second project result {"conversationId":12,"type":"input","status":"done","entry":18,"id":19,"answer":26}
no-install control provider signal aborted after response true
addExtensions already listed {"status":200,"body":{"result":{"project":{"project":"p","workdir":"/tmp/tau-runtime-probe.uolLFS","extensions":["late"],"missing":[]}}}}
registry after addExtensions already listed ["coding-tools"]
```

## Q3: reload, live registry replacement, waiting/sleeping tasks and incompatible versions: full recorded output

Working directory: /tmp/tau-runtime-probe.uolLFS/checkout

```sh
/nix/var/nix/profiles/default/bin/nix develop -c node --experimental-import-meta-resolve /tmp/tau-runtime-probe.uolLFS/q3.mjs
```

```text
reload ts {"first":{"value":1,"leaf":1},"second":{"value":2,"leaf":1},"third":{"value":2,"leaf":2},"fresh":{"value":2,"leaf":2}}
reload js {"first":{"value":1,"leaf":1},"second":{"value":2,"leaf":1},"third":{"value":2,"leaf":2},"fresh":{"value":2,"leaf":2}}
reload mjs {"first":{"value":1,"leaf":1},"second":{"value":1,"leaf":1},"third":{"value":1,"leaf":1},"fresh":{"value":1,"leaf":1}}
before replacement {"running":{"status":"running","checkpoint":{"phase":"first"}},"waiting":{"status":"waiting","on":[10],"policy":"allSettled","checkpoint":{"phase":"second"}},"sleeping":{"status":"sleeping","checkpoint":{"phase":"second"},"until":1794670178755},"oldTool":1,"newTool":0}
same name install {"ms":0.022,"count":1,"currentIsNew":true,"priorSnapshotStillOld":true}
compatible task outcomes [{"id":8,"version":1,"state":{"status":"terminal","outcome":{"status":"completed","result":"new"}}},{"id":11,"version":1,"state":{"status":"terminal","outcome":{"status":"completed","result":"new"}}},{"id":9,"version":1,"state":{"status":"terminal","outcome":{"status":"completed","result":"new"}}}]
compatible steps ["old:first-enter","old:sleep","old:wait","old:first-exit","new:second","new:second","new:second"]
in flight tool {"submission":{"conversationId":2,"type":"input","status":"done","entry":12,"id":13,"answer":25},"oldTool":1,"newTool":1,"contexts":[[{"tool":"replace_tool","content":[{"type":"text","text":"old-tool-output"}]}],[{"tool":"replace_tool","content":[{"type":"text","text":"old-tool-output"}]},{"tool":"replace_tool","content":[{"type":"text","text":"new-tool-output"}]}]]}
uninstall running result {"status":"terminal","outcome":{"status":"completed","result":"uninstalled"}}
uninstall steps ["uninstalled:first-enter","uninstalled:first-exit","uninstalled:second"]
incompatible running result {"status":"terminal","outcome":{"status":"completed","result":"v1"}}
incompatible sleeping state {"record":{"id":28,"conversationId":2,"kind":"versioned.task","version":1,"input":{"mode":"sleep"},"background":true,"abortRequested":false,"state":{"status":"sleeping","checkpoint":{"phase":"second"},"until":1794670278756},"startedAt":1794670178756},"state":{"kind":"blocked","reason":"migration_failed","error":{}}}
migration replacement result {"id":28,"conversationId":2,"kind":"versioned.task","version":2,"input":{"mode":"sleep"},"background":true,"abortRequested":false,"state":{"status":"terminal","outcome":{"status":"completed","result":"v2-migrated"}},"startedAt":1794670178756,"endedAt":1794670278757}
reports [{"kind":"task_outdated","reason":"missing_task","message":"Task 26 keeps running under its old gone.task definition","task":26},{"kind":"migration_failed","message":"Task versioned.task version 2 has no migration from 1","task":28},{"kind":"task_outdated","reason":"migration_failed","message":"Task 27 keeps running under its old versioned.task definition","task":27}]
```

## Q3: transitive native-module cache boundary: full recorded output

Working directory: /tmp/tau-runtime-probe.uolLFS/checkout

```sh
/nix/var/nix/profiles/default/bin/nix develop -c node --experimental-import-meta-resolve /tmp/tau-runtime-probe.uolLFS/reload-matrix.mjs
```

```text
reload matrix {"type":"module","entry":"ts","leaf":"ts","first":{"value":1,"leaf":1},"editedEntry":{"value":2,"leaf":1},"editedLeaf":{"value":2,"leaf":2}}
reload matrix {"type":"module","entry":"ts","leaf":"js","first":{"value":1,"leaf":1},"editedEntry":{"value":2,"leaf":1},"editedLeaf":{"value":2,"leaf":1}}
reload matrix {"type":"module","entry":"ts","leaf":"mjs","first":{"value":1,"leaf":1},"editedEntry":{"value":2,"leaf":1},"editedLeaf":{"value":2,"leaf":1}}
reload matrix {"type":"module","entry":"js","leaf":"js","first":{"value":1,"leaf":1},"editedEntry":{"value":1,"leaf":1},"editedLeaf":{"value":1,"leaf":1}}
reload matrix {"type":"commonjs","entry":"ts","leaf":"cjs","first":{"value":1,"leaf":1},"editedEntry":{"value":2,"leaf":1},"editedLeaf":{"value":2,"leaf":1}}
reload matrix {"type":"commonjs","entry":"cjs","leaf":"cjs","first":{"value":1,"leaf":1},"editedEntry":{"value":1,"leaf":1},"editedLeaf":{"value":1,"leaf":1}}
```

## Q3: actual edited TypeScript file installed into live registry: full recorded output

Working directory: /tmp/tau-runtime-probe.uolLFS/checkout

```sh
/nix/var/nix/profiles/default/bin/nix develop -c node --experimental-import-meta-resolve /tmp/tau-runtime-probe.uolLFS/q3-loaded.mjs
```

```text
loaded file replaced {"before":"old","after":"new","distinctExtension":true,"distinctTask":true}
while old code held {"steps":["old:enter"],"tools":["old"],"taskState":{"status":"running","checkpoint":{"phase":"first"}},"installedCount":1}
loaded replacement task result {"status":"terminal","outcome":{"status":"completed","result":"new"}}
loaded replacement submission {"conversationId":2,"type":"input","status":"done","entry":9,"id":10,"answer":22}
loaded replacement actual code {"steps":["old:enter","old:exit","new:second"],"tools":["old","new"],"outputs":[[[{"type":"text","text":"old"}]],[[{"type":"text","text":"old"}],[{"type":"text","text":"new"}]]],"modelRequests":[{"toolDescription":"old","oldToolResult":false},{"toolDescription":"new","oldToolResult":true},{"toolDescription":"new","oldToolResult":true}]}
loaded replacement task transitions [{"seq":2,"status":"pending","phase":"first"},{"seq":3,"status":"running","phase":"first"},{"seq":10,"status":"running","phase":"second"},{"seq":11,"status":"pending","phase":"second"},{"seq":13,"status":"running","phase":"second"},{"seq":15,"status":"terminal"}]
```

## Q1: native transitive dependency alias boundary: full recorded output

Working directory: /tmp/tau-runtime-probe.uolLFS/checkout

```sh
/nix/var/nix/profiles/default/bin/nix develop -c node --experimental-import-meta-resolve /tmp/tau-runtime-probe.uolLFS/native-alias-boundary.mjs
```

```text
alias boundary with installed second pi-schema {"directTsImportHost":true,"transitiveTsImportHost":true,"transitiveMjsImportHost":false,"transitiveMjsImportOwn":true,"transitiveNativeJsImportHost":false,"transitiveNativeJsImportOwn":true}
```

## Q3(a): copied W2 source, Markdown-only reload and persisted-conversation instructions: full recorded output

Working directory: /tmp/tau-runtime-probe.uolLFS/checkout

```sh
/nix/var/nix/profiles/default/bin/nix develop -c node --experimental-import-meta-resolve /tmp/tau-runtime-probe.uolLFS/q3-prose.mjs
```

```text
W2 prose-only reload {"importMs":13.978,"indexUnchanged":true,"indexSha256":"4f7bc3bdf14d9b2f0432d27561d608750cacef43e3b8f0017d4b9c486e009678","oldText":"Sharpen the user's claim into a falsifiable forecast. Record the probability as your estimate, a resolution date and a rule. Use `record_forecast` or `revise_forecast`. Use `calibration` to summarize outcomes. You have no shell, files or network.\n","newText":"Sharpen the user's claim into a falsifiable forecast. Record the probability as your estimate, a resolution date and a rule. Use `record_forecast` or `revise_forecast`. Use `calibration` to summarize outcomes. You have no shell, files or network.\n\nPROSE-ONLY-CHANGE-NEW.\n","oldModuleStillOld":true,"distinctExtension":true,"distinctTask":true}
W2 live replacement prose persistence {"sameHarness":true,"existingRun":"done","newRun":"done","existingSavedInstructionsNew":false,"newSavedInstructionsNew":true,"requests":[{"request":1,"newProse":false},{"request":2,"newProse":false},{"request":3,"newConversation":true,"newProse":true}]}
```

## Q3(b): cycle only project A, keep B running and both projects client streams observed: full recorded output

Working directory: /tmp/tau-runtime-probe.uolLFS/checkout

```sh
/nix/var/nix/profiles/default/bin/nix develop -c node --experimental-import-meta-resolve /tmp/tau-runtime-probe.uolLFS/q3-cycle.mjs
```

```text
cycle prepared timer {"id":33,"conversationId":13,"kind":"w2.due","version":1,"input":{"subject":"w2:13:cycle","forecast":32,"dueAt":1794671177657},"background":true,"abortRequested":false,"state":{"status":"sleeping","checkpoint":{"phase":"ask"},"until":1794671177657},"startedAt":1794671176168}
one-project cycle internals {"hook":"Node registerHooks load: Projects #private -> _public, in memory only","hookLoads":1,"calls":["a.store.harness.close(ctx)","a.lock.release()","projects._open.delete(\"a\")","projects._openDirectory(\"a\")","projects._finish(opened, priorRecord)"],"ms":3.605,"aNewHarness":true,"bSameHarness":true,"bSameRegistry":true}
streams after A cycle {"aOpen":{"closed":true,"end":"failed"},"aTimeline":{"closed":true,"end":"failed"},"bOpen":{"closed":false,"end":null},"bTimeline":{"closed":false,"end":null}}
B while A reopened {"sameRun":true,"bAbortedWhileHeld":false}
A persisted/new conversation prose {"newConversation":41,"newHasProse":true,"existingHasProse":false}
A timer after reopen {"state":{"status":"terminal","outcome":{"status":"completed","result":null}},"registryTaskIsNew":true,"events":[{"text":"Forecast is due. CYCLE-TASK-NEW","at":1794671177662,"conversation":13,"forecast":32,"decision":"w2:13:cycle#1"}]}
A in-flight recovery {"aInterrupted":true,"attempts":2,"result":{"conversationId":19,"requestId":"client:probe:active","type":"input","status":"done","entry":36,"id":37,"answer":40},"repeatedInput":{"status":200,"body":{"result":{"submission":{"id":37,"conversationId":19,"requestId":"client:probe:active","type":"input","status":"done","entry":36,"answer":40}}}},"reconnectedStream":{"closed":false,"frames":1}}
B completion {"result":{"conversationId":12,"requestId":"client:probe:bactive","type":"input","status":"done","entry":18,"id":19,"answer":22},"bAbortedWhileHeld":false,"streamStillOpen":true,"timelineStillOpen":true,"framesBefore":1,"framesAfter":5}
cycle model requests [{"tag":"A-active","proseNew":false,"at":1794671176181},{"tag":"B-active","proseNew":false,"at":1794671176183},{"tag":"A-active","proseNew":false,"at":1794671176209},{"tag":"A-new","proseNew":true,"at":1794671176213}]
```

## Q3(c): same-version and version-2 stored timers with/without migration: full recorded output

Working directory: /tmp/tau-runtime-probe.uolLFS/checkout

```sh
/nix/var/nix/profiles/default/bin/nix develop -c node --experimental-import-meta-resolve /tmp/tau-runtime-probe.uolLFS/q3-versioned-timer.mjs
```

```text
stored timer same-version {"atInstall":{"initial":0,"migrate":[],"wake":[]},"beforeDue":{"calls":{"initial":0,"migrate":[],"wake":[]},"stored":{"id":8,"conversationId":2,"kind":"timer.probe","version":1,"input":{"payload":"v1-input","at":1794671176178},"background":true,"abortRequested":false,"state":{"status":"sleeping","checkpoint":{"phase":"wake","schema":"v1-checkpoint"},"until":1794671176178},"startedAt":1794671175178}},"after":{"id":8,"conversationId":2,"kind":"timer.probe","version":1,"input":{"payload":"v1-input","at":1794671176178},"background":true,"abortRequested":false,"state":{"status":"terminal","outcome":{"status":"completed","result":{"code":"new","input":{"payload":"v1-input","at":1794671176178},"checkpoint":{"phase":"wake","schema":"v1-checkpoint"},"version":1}}},"startedAt":1794671175178,"endedAt":1794671176179},"newModuleCalls":{"initial":0,"migrate":[],"wake":[{"code":"new","input":{"payload":"v1-input","at":1794671176178},"checkpoint":{"phase":"wake","schema":"v1-checkpoint"},"version":1}]},"oldModuleCalls":{"initial":1,"migrate":[],"wake":[]},"reports":[]}
stored timer v2-with-migrate {"atInstall":{"initial":0,"migrate":[],"wake":[]},"beforeDue":{"calls":{"initial":0,"migrate":[],"wake":[]},"stored":{"id":8,"conversationId":2,"kind":"timer.probe","version":1,"input":{"payload":"v1-input","at":1794671176226},"background":true,"abortRequested":false,"state":{"status":"sleeping","checkpoint":{"phase":"wake","schema":"v1-checkpoint"},"until":1794671176226},"startedAt":1794671175226}},"after":{"id":8,"conversationId":2,"kind":"timer.probe","version":2,"input":{"payload":"v1-input-migrated","at":1794671176226},"background":true,"abortRequested":false,"state":{"status":"terminal","outcome":{"status":"completed","result":{"code":"new","input":{"payload":"v1-input-migrated","at":1794671176226},"checkpoint":{"phase":"wake","schema":"v1-checkpoint-migrated"},"version":2}}},"startedAt":1794671175226,"endedAt":1794671176227},"newModuleCalls":{"initial":0,"migrate":[{"input":{"payload":"v1-input","at":1794671176226},"checkpoint":{"phase":"wake","schema":"v1-checkpoint"},"fromVersion":1}],"wake":[{"code":"new","input":{"payload":"v1-input-migrated","at":1794671176226},"checkpoint":{"phase":"wake","schema":"v1-checkpoint-migrated"},"version":2}]},"oldModuleCalls":{"initial":1,"migrate":[],"wake":[]},"reports":[]}
stored timer v2-without-migrate {"atInstall":{"initial":0,"migrate":[],"wake":[]},"beforeDue":{"calls":{"initial":0,"migrate":[],"wake":[]},"stored":{"id":8,"conversationId":2,"kind":"timer.probe","version":1,"input":{"payload":"v1-input","at":1794671176266},"background":true,"abortRequested":false,"state":{"status":"sleeping","checkpoint":{"phase":"wake","schema":"v1-checkpoint"},"until":1794671176266},"startedAt":1794671175266}},"after":{"record":{"id":8,"conversationId":2,"kind":"timer.probe","version":1,"input":{"payload":"v1-input","at":1794671176266},"background":true,"abortRequested":false,"state":{"status":"sleeping","checkpoint":{"phase":"wake","schema":"v1-checkpoint"},"until":1794671176266},"startedAt":1794671175266},"graph":{"kind":"blocked","reason":"migration_failed"}},"newModuleCalls":{"initial":0,"migrate":[],"wake":[]},"oldModuleCalls":{"initial":1,"migrate":[],"wake":[]},"reports":[{"kind":"migration_failed","error":"Task timer.probe version 2 has no migration from 1"}]}
```

## Cleanup

Ran `git -C /Users/vr-osxs/dev/render-core worktree remove --force /tmp/tau-runtime-probe.uolLFS/checkout` after checking the temporary checkout's porcelain status was empty.

```text
temporary checkout status before removal:
removing detached checkout:
git worktree remove exit=0
checkout directory absent: yes
finished: 2026-11-14T15:50:23Z
```

Probe directory birth: 2026-11-14T15:19:45Z. Elapsed through cleanup: 30 minutes 38 seconds. Scripts, package copies, SQLite files, and full evidence remain in this probe directory. No commit or push was made.
