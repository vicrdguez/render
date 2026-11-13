import type { ConversationId, Task, Tx, TypedEntry } from "@earendil-works/pi-durable";
import { request, withdraw, emit, decision, eventLog } from "tau-store";
import type { DecisionId } from "tau-store";
declare const tx: Tx;
declare const conversation: ConversationId;
declare const basis: TypedEntry<{text:string}>;
declare const broad: Task<{decision:DecisionId;choice:"approve"|"abort"},{phase:"act"},void,object>;
declare const narrow: Task<{decision:DecisionId;choice:"approve"},{phase:"act"},void,object>;
void [withdraw,emit,decision,eventLog];
function compileOnly() {
  request(tx,{subject:"w1:1:design",title:"Review",basis,choices:["approve","abort"],conversation,then:broad,requestedAt:1});
  // @ts-expect-error continuation must accept abort as well as approve
  request(tx,{subject:"w1:1:design",title:"Review",basis,choices:["approve","abort"],conversation,then:narrow,requestedAt:1});
}
void compileOnly;
