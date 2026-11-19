import * as googleFlow from "@red-cup-engineering/google-flow-computer-inference-system-engineering-services-section/flow-generate";
import {readMediaAllocationStates,readMediaArtifactReviews,readMediaDemandInbox} from "./media-demand-journal.mjs";
import {projectMediaArtifactReviewQueue} from "./media-review-queue-contract.mjs";

/**
 * Production wrapper: existing Flow custody remains the default provider.
 * Other authenticated provider controllers can supply their actual artifact
 * custody observations. Passing a record is not consumer acceptance.
 */
export function mediaArtifactReviewQueue({
  root,flow=googleFlow,providerArtifacts,now=new Date()
}={}){
  let artifacts=providerArtifacts;
  if(artifacts===undefined){
    if(typeof flow.flowMediaInventory!=="function")
      return Object.freeze({type:"MediaArtifactReviewQueue",status:"blocked",
        reason:"google-flow-custody-upgrade-not-released",items:Object.freeze([])});
    const inventory=flow.flowMediaInventory();
    artifacts=inventory.artifacts??[];
  }
  if(!Array.isArray(artifacts))throw new TypeError("provider artifact custody must be an array");
  const inbox=readMediaDemandInbox({root,now});
  return projectMediaArtifactReviewQueue({
    allocations:readMediaAllocationStates({root}),needs:inbox.needs,
    reviews:readMediaArtifactReviews({root}),artifacts,now
  });
}
