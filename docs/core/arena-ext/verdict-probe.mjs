// Judge checks on installed pi-durable 1.5.2 only. No imports from the source tree.
// Questions: Can one-request dispatch preserve a queued follow-up? Do exact tool
// lists hide an extension's sections? Is passive reporting model-free?
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
const base = process.env.PI_MODULES;
const { BACKGROUND_CONTEXT: ctx } = await import(`${base}/chord/dist/context/index.js`);
const { createModels } = await import(`${base}/pi-ai/dist/models.js`);
const { fauxAssistantMessage, fauxProvider, fauxToolCall } = await import(`${base}/pi-ai/dist/providers/faux.js`);
const { obj } = await import(`${base}/pi-schema/dist/index.js`);
const { Harness, createRegistry, defineExtension, defineTool, section } = await import(`${base}/pi-durable/dist/index.js`);
const { openNodeSqliteStorage } = await import(`${base}/pi-durable/dist/storage/sqlite/node.js`);
const dir = mkdtempSync('/tmp/arena-ext/judge/tmp/judge-');
let entered, release;
const inTool = new Promise(r => { entered = r; });
const released = new Promise(r => { release = r; });
let dispatches = 0, requests = 0;
const dispatch = defineTool({ name: 'dispatch', description: 'Dispatch and finish.', parameters: obj({}),
  execute: async () => { dispatches++; if (dispatches === 1) { entered(); await released; }
    return { output: [{type:'text',text:'sent'}], control:{terminate:true} }; }
});
const show = defineTool({name:'show_diff',description:'Read published diff.',parameters:obj({}),execute:async()=>({output:[]})});
const w1 = defineExtension({name:'w1',tools:[dispatch,show],sections:[section('w1_notes',()=> 'SECRET_LANE_NOTE')]});
const registry = createRegistry(); registry.install(w1);
const faux = fauxProvider({models:[{id:'a'}]});
const call = () => { requests++; return fauxAssistantMessage([fauxToolCall('dispatch',{})],{stopReason:'toolUse'}); };
faux.setResponses([call, call]);
const models = createModels(); models.setProvider(faux.provider);
const h = await Harness.open(await openNodeSqliteStorage(join(dir,'check.sqlite')), {models,registry,settings:{retry:{enabled:false}}},ctx);
h.resume();
const agent = {model:{provider:'faux',modelId:'a'},extensions:[w1]};
const lane = await h.createConversation({ownership:{kind:'ownerless'},agent:{...agent,tools:[dispatch]}},ctx);
const a = await lane.submit({type:'input',content:'item1'},ctx); await inTool;
const b = await lane.submit({type:'input',content:'item2'},ctx);
assert.equal((await b.status(ctx)).status,'queued'); release();
assert.equal((await a.wait(ctx)).status,'done'); assert.equal((await b.wait(ctx)).status,'done');
await lane.waitForIdle(ctx); assert.equal(requests,2); assert.equal(dispatches,2);
console.log('J1 ok: 2 queued items dispatched in 2 requests; terminate did not lose the follow-up');
const notice = await lane.submit({type:'write',requestId:'notice',entry:{kind:'w1.report',data:{text:'REVIEW_FAILED'},model:[{role:'user',content:'REVIEW_FAILED',timestamp:Date.now()}]}},ctx);
assert.equal((await notice.wait(ctx)).status,'done');
assert.equal(requests,2); assert.ok(JSON.stringify((await lane.context(ctx)).messages).includes('REVIEW_FAILED'));
console.log('J2 ok: a passive report entered model context with no request');
let reviewContext;
faux.setResponses([(context)=>{reviewContext=context;return fauxAssistantMessage('reviewed');}]);
const reviewer = await h.createConversation({ownership:{kind:'ownerless'},agent:{...agent,tools:[show]}},ctx);
await (await reviewer.submit({type:'input',content:'Review only published files.'},ctx)).wait(ctx);
assert.deepEqual((await reviewer.agent(ctx)).tools.map(t=>t.name),['show_diff']);
assert.ok(JSON.stringify(reviewContext).includes('SECRET_LANE_NOTE'));
console.log('J3 ok: exact [w1] and [show_diff] tools still exposed the unfiltered w1_notes section');
// A review entry ID does not exist until appendEntry, which makes submit too late.
await assert.rejects(h.commit(async tx => {
  const review = await tx.appendEntry(reviewer.id,{kind:'w1.review',data:{text:'failed'}});
  await lane.submit(tx,{type:'write',requestId:String(review.id),entry:{kind:'w1.report',data:{text:'failed'}}});
},ctx), error => error.name === 'ReadAfterWrite');
console.log('J4 ok: append review then submit a notice keyed by its ID throws ReadAfterWrite, as expected');
await h.close(ctx);
console.log('ok: judge checks J1-J4 passed');
