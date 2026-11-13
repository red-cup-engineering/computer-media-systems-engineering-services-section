import * as googleFlow from "@red-cup-engineering/google-flow-computer-inference-system-engineering-services-section/flow-generate";
import { readMediaAllocationStates, recordMediaAllocationState } from "./media-demand-journal.mjs";

const at = (value, fallback) => Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : fallback.toISOString();

/** Project Flow custody into the shared allocation lifecycle without inventing missing effects. */
export function reconcileFlowMediaAllocations({ root, flow = googleFlow, now = new Date() } = {}) {
  if (typeof flow.flowMediaInventory !== "function") {
    return Object.freeze({ type:"FlowMediaAllocationReconciliation", status:"blocked", reason:"google-flow-custody-upgrade-not-released", transitions:Object.freeze([]) });
  }
  const inventory=flow.flowMediaInventory();
  const latest=new Map(readMediaAllocationStates({root}).map((row)=>[row.allocation,row]));
  const transitions=[];
  for(const artifact of inventory.artifacts ?? []) {
    if(!artifact.allocation) continue;
    let current=latest.get(artifact.allocation);
    if(!current) { transitions.push({allocation:artifact.allocation,status:"unmatched-provider-allocation"}); continue; }
    if(artifact.mediaNeed && artifact.mediaNeed!==current.mediaNeed) { transitions.push({allocation:artifact.allocation,status:"lineage-mismatch",field:"mediaNeed"}); continue; }
    if(artifact.purpose && artifact.purpose!==current.purpose) { transitions.push({allocation:artifact.allocation,status:"lineage-mismatch",field:"purpose"}); continue; }
    const write=(state,receipt,recordedAt)=>{
      const result=recordMediaAllocationState({
        root,allocation:current.allocation,mediaNeed:current.mediaNeed,purpose:current.purpose,count:current.count,
        state,provider:current.provider,at:recordedAt,receipt,origin:"@red-cup-engineering/google-flow-computer-inference-system-engineering-services-section",
      });
      current={...current,state,recordedAt,receipt};latest.set(current.allocation,current);
      transitions.push({allocation:current.allocation,state,appended:result.appended,receipt});
    };
    if(current.state==="held" && ["generated","delivered","public-use"].includes(artifact.custody)) {
      write("generated",artifact.completionId,at(artifact.generatedAt,now));
    }
    if(current.state==="generated" && ["delivered","public-use"].includes(artifact.custody)) {
      write("delivered",artifact.delivery?.id ?? artifact.completionId,at(artifact.delivery?.recordedAt,now));
    }
    if(current.state==="delivered" && artifact.custody==="public-use") {
      write("public-use",artifact.delivery?.publicAddress ?? artifact.delivery?.id ?? artifact.completionId,at(artifact.delivery?.recordedAt,now));
    }
  }
  return Object.freeze({
    type:"FlowMediaAllocationReconciliation",status:"complete",observedAt:now.toISOString(),
    providerInventory:inventory.counts,transitions:Object.freeze(transitions),
  });
}
