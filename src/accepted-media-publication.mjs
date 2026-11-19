import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve, sep } from "node:path";
import * as googleFlow from "@red-cup-engineering/google-flow-computer-inference-system-engineering-services-section/flow-generate";
import {
  readMediaAllocationStates, readMediaArtifactReviews, readMediaDemandInbox, recordMediaAllocationState,
} from "./media-demand-journal.mjs";
import { qualifyMediaSocialDistributor, qualifyMediaSocialReadback } from './media-social-receiving.mjs';

const TID_ALPHABET="234567abcdefghijklmnopqrstuvwxyz";

export function blueskyTid({at,salt}) {
  const millis=Date.parse(at);
  if(!Number.isFinite(millis)) throw new TypeError("Bluesky TID needs an instant");
  const digest=createHash("sha256").update(String(salt)).digest();
  const clock=BigInt(((digest[0] << 8) | digest[1]) & 1023);
  let value=(BigInt(millis)*1000n << 10n) | clock;
  const chars=Array(13);
  for(let i=12;i>=0;i-=1){chars[i]=TID_ALPHABET[Number(value & 31n)];value >>= 5n;}
  const tid=chars.join("");
  if(!/^[234567abcdefghij][234567abcdefghijklmnopqrstuvwxyz]{12}$/u.test(tid)) throw new Error("derived Bluesky TID is invalid");
  return tid;
}

function assetPath(root,relativePath){
  const base=resolve(root), path=resolve(base,relativePath);
  if(path!==base && !path.startsWith(base+sep)) throw new Error("accepted asset escaped shared media custody");
  return path;
}

function publicBlueskyAddress(handle,rkey){
  return `https://bsky.app/profile/${encodeURIComponent(handle)}/post/${rkey}`;
}

/** Publish accepted social assets; rejected reviews release their allocation back to demand. */
export async function publishAcceptedMedia({
  root, env=process.env, fetch=globalThis.fetch, now=new Date(), social, flow=googleFlow,
}={}) {
  let distribution=social;
  if(distribution===undefined){
    try{distribution=await import("@red-cup-engineering/news-property/distribute");}
    catch{return Object.freeze({type:"AcceptedMediaPublication",status:"blocked",reason:"retry-safe-bluesky-media-upgrade-not-released",published:Object.freeze([])});}
  }
  const socialAdmission=qualifyMediaSocialDistributor(distribution);
  if(!socialAdmission.ok) {
    return Object.freeze({type:"AcceptedMediaPublication",status:"blocked",
      reason:socialAdmission.reason,published:Object.freeze([])});
  }
  if(typeof flow.recordFlowDelivery!=="function" || typeof flow.flowMediaInventory!=="function") {
    return Object.freeze({type:"AcceptedMediaPublication",status:"blocked",reason:"google-flow-delivery-upgrade-not-released",published:Object.freeze([])});
  }
  const providerInventory=flow.flowMediaInventory();
  const providerByCompletion=new Map((providerInventory.artifacts??[]).map((row)=>[row.completionId,row]));
  const allocations=new Map(readMediaAllocationStates({root}).map((row)=>[row.allocation,row]));
  const inbox=readMediaDemandInbox({root,now});
  const needs=new Map(inbox.needs.map((need)=>[need.id,need]));
  const reviews=readMediaArtifactReviews({root});
  const published=[],released=[],obstructions=[];
  for(const review of reviews){
    let state=allocations.get(review.allocation);
    if(!state || ["public-use","released","refused"].includes(state.state)) continue;
    if(!review.accepted){
      if(["generated","delivered"].includes(state.state)){
        recordMediaAllocationState({root,...state,state:"released",at:review.recordedAt,receipt:`review-rejected:${review.completionId}`,origin:review.authority});
        state={...state,state:"released",recordedAt:review.recordedAt};allocations.set(state.allocation,state);
        released.push({allocation:state.allocation,mediaNeed:state.mediaNeed,purpose:state.purpose});
      }
      continue;
    }
    // An internally accepted scientific figure, audio item, video or deck is
    // not a social publication order. Acceptance never invents distribution.
    if(review.distribution===undefined) continue;
    if(!["generated","delivered"].includes(state.state)){obstructions.push({allocation:state.allocation,reason:`allocation-state-${state.state}`});continue;}
    const need=needs.get(state.mediaNeed);
    if(!need){obstructions.push({allocation:state.allocation,reason:"media-need-not-found"});continue;}
    const demand=need.artifacts.find((item)=>item.purpose===state.purpose);
    if(!demand){obstructions.push({allocation:state.allocation,reason:"media-artifact-demand-not-found"});continue;}
    const providerArtifact=providerByCompletion.get(review.completionId);
    if(!providerArtifact){obstructions.push({allocation:state.allocation,reason:"provider-completion-not-found"});continue;}
    if(providerArtifact.allocation!==state.allocation||providerArtifact.mediaNeed!==state.mediaNeed||providerArtifact.purpose!==state.purpose){
      obstructions.push({allocation:state.allocation,reason:"provider-completion-lineage-mismatch"});continue;
    }
    const actualDestination=`https://bsky.app/profile/${review.distribution.handle}`;
    if(demand.destination&&demand.destination!==actualDestination){obstructions.push({allocation:state.allocation,reason:"review-destination-differs-from-demand"});continue;}
    if(demand.distribution){
      const fields=["channel","handle","text","url"];
      if(fields.some((field)=>demand.distribution[field]!==review.distribution[field])){
        obstructions.push({allocation:state.allocation,reason:"review-distribution-packet-differs-from-consumer"});continue;
      }
    }
    if(typeof need.source?.publicAddress==="string"&&need.source.publicAddress!==review.distribution.url){
      obstructions.push({allocation:state.allocation,reason:"review-link-differs-from-source"});continue;
    }
    const path=assetPath(root,review.asset.relativePath);
    let bytes;
    try{bytes=readFileSync(path);}catch(error){obstructions.push({allocation:state.allocation,reason:`accepted-asset-unreadable: ${error.message}`});continue;}
    const digest=createHash("sha256").update(bytes).digest("hex");
    if(digest!==review.asset.sha256){obstructions.push({allocation:state.allocation,reason:"accepted-asset-digest-mismatch"});continue;}
    const {handle,text,url}=review.distribution;
    const rkey=blueskyTid({at:review.recordedAt,salt:review.allocation});
    const receipt=await distribution.postBluesky({
      handle,appPassword:env.BLUESKY_APP_PASSWORD,fetch,now:()=>review.recordedAt,
      stories:[{
        text,url,rkey,
        image:{bytes,mimeType:review.asset.mimeType,alt:review.asset.altText,sanitized:true,aspectRatio:{width:review.asset.width,height:review.asset.height}},
      }],
    });
    if(receipt.status!=="ok" || !receipt.uri || !receipt.cid || !receipt.did ||
       receipt.uri!=="at://"+receipt.did+"/app.bsky.feed.post/"+rkey){
      obstructions.push({allocation:state.allocation,
        reason:receipt.reason??"authenticated-strong-provider-receipt-required"});
      continue;
    }

    // A platform createRecord acknowledgement is only a delivered attempt.
    // Persist the exact record URI in the existing allocation journal so a
    // crash or unavailable public AppView cannot turn it into public-use.
    if(state.state==="generated"){
      try {
        recordMediaAllocationState({root,...state,state:"delivered",at:now.toISOString(),
          receipt:receipt.uri,origin:"@causeway-services/public-media-services-section"});
        state={...state,state:"delivered",recordedAt:now.toISOString()};
        allocations.set(state.allocation,state);
      }catch(error){
        obstructions.push({allocation:state.allocation,
          reason:"provider-receipt-not-retained: "+error.message});
        continue;
      }
    }
    let observation;
    try {
      observation=await distribution.observeBlueskyPost({
        uri:receipt.uri,cid:receipt.cid,did:receipt.did,text,url,
        imageAlt:review.asset.altText,fetch,
      });
    }catch(error){
      observation={status:"held",reason:"public-readback-unavailable: "+error.message};
    }
    const qualified=qualifyMediaSocialReadback({receipt,observation,rkey});
    if(!qualified.ok){
      obstructions.push({allocation:state.allocation,
        reason:"public-readback-not-received: "+(observation?.reason??qualified.reason)});
      continue;
    }
    const publicAddress=publicBlueskyAddress(handle,rkey);
    const consumer=need.consumer;
    const destination="https://bsky.app/profile/"+handle;
    let delivery;
    try{
      delivery=flow.recordFlowDelivery({
        completionId:review.completionId,consumer,destination,stage:"public-use",
        publicAddress,at:now.toISOString(),
      });
      if(!delivery || typeof delivery.id!=="string" || !delivery.id){
        throw new TypeError("media delivery journal returned no durable receipt");
      }
      recordMediaAllocationState({root,...state,state:"public-use",at:now.toISOString(),
        receipt:publicAddress,origin:"@causeway-services/public-media-services-section"});
    }catch(error){
      obstructions.push({allocation:state.allocation,
        reason:"public-use-settlement-not-received: "+error.message});
      continue;
    }
    state={...state,state:"public-use",recordedAt:now.toISOString()};allocations.set(state.allocation,state);
    published.push({allocation:state.allocation,mediaNeed:state.mediaNeed,purpose:state.purpose,
      uri:receipt.uri,cid:receipt.cid,publicAddress,providerReceipt:delivery.id,
      publicReadback:qualified.source,recovered:receipt.posts?.[0]?.recovered===true});
  }
  return Object.freeze({type:"AcceptedMediaPublication",status:obstructions.length?"held":"complete",observedAt:now.toISOString(),published:Object.freeze(published),released:Object.freeze(released),obstructions:Object.freeze(obstructions)});
}
