import { createHash } from "node:crypto";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { canonicalJson } from "@red-cup-engineering/json-engineering-services-section/canonical-json";
import {
  planMediaDemandInbox, readMediaAllocationStates, readMediaDemandInbox, recordMediaAllocationState, recordMediaNeed, recordMediaReadiness,
} from "./media-demand-journal.mjs";

const PROVIDER="urn:ame:gemini-notebook";
const PURPOSE="youtube-short-companion";
const CAPABILITY="source-grounded-short-video";
const SIX_HOURS=6*60*60*1000;
const SHORT_PROBE_COOLDOWN_MS=5*60*60*1000;

const allocationId=(value)=>`ni:///sha-256;${createHash("sha256").update(canonicalJson(value)).digest("base64url")}`;

async function educationSurface(injected){
  if(injected) return injected;
  try{
    const channel=await import("@causeway-services/public-education-services-section/channel");
    let shortService={};
    try{shortService=await import("@causeway-services/public-education-services-section/short-service");}catch{}
    return {...channel,...shortService};
  }catch{return null;}
}

/** A missing installed channel worktree is unavailable publishing capacity,
 * never a successful zero-work media turn. */
function admittedChannelIds(education){
  if(typeof education.channelIds!=="function")return null;
  const ids=education.channelIds();
  return Array.isArray(ids)&&ids.length>0&&ids.every(id=>typeof id==="string"&&id.length>0)?ids:null;
}

function episodeStates(config,education){
  const dir=join(config.directory,"production","episodes");
  if(!existsSync(dir)) return [];
  return readdirSync(dir,{withFileTypes:true}).filter((entry)=>entry.isDirectory())
    .map((entry)=>({lessonId:entry.name,dir:join(dir,entry.name),state:education.readJson(join(dir,entry.name,"state.json"),null)}))
    .filter((row)=>row.state);
}

function shortPublishAt(parentPublishAt){
  const at=Date.parse(parentPublishAt);
  if(!Number.isFinite(at)) return null;
  return new Date(at+SIX_HOURS).toISOString();
}

export async function projectEducationShortDemand({root,education:injected,env=process.env,now=new Date()}={}){
  const education=await educationSurface(injected);
  if(!education || typeof education.channelIds!=="function" || typeof education.loadChannel!=="function") return Object.freeze({type:"EducationShortDemandProjection",status:"blocked",reason:"public-education-short-surface-not-released",opened:Object.freeze([])});
  const channels=admittedChannelIds(education);
  if(!channels)return Object.freeze({type:"EducationShortDemandProjection",status:"blocked",reason:"no-admitted-education-channels",opened:Object.freeze([])});
  education.loadEnvironment?.();
  const opened=[],skipped=[];
  for(const channelId of channels){
    const config=education.loadChannel(channelId);
    if(config.enabled===false) continue;
    for(const {lessonId,dir,state} of episodeStates(config,education)){
      if(!["scheduled","published"].includes(state.stage) || !state.youtubeVideoId || !state.notebookId || !state.publishAt) continue;
      const existing=education.readJson(join(dir,"short-publication.json"),null);
      const native=education.readJson(join(dir,"notebook-short.json"),null);
      // Source custody wins over a new commission. An unfinished Notebook
      // generation or retained allocation is already work, not fresh demand.
      const nativeAccepted=Boolean(native&&(native.mediaNeed||native.allocation||native.youtubeVideoId||
        native.notebook?.generationAttempt||native.notebook?.generationStarted||native.notebook?.artifactId||
        native.artifactId||native.sourceDrive||native.drive));
      if(existing?.videoId||nativeAccepted){
        skipped.push({channel:channelId,lesson:lessonId,reason:"short-already-exists",
          ...(native?.youtubeVideoId||existing?.videoId?{videoId:native?.youtubeVideoId??existing.videoId}:{})});
        continue;
      }
      const publishAt=shortPublishAt(state.publishAt);
      if(!publishAt || Date.parse(publishAt)<=now.getTime()){skipped.push({channel:channelId,lesson:lessonId,reason:"automatic-short-window-passed"});continue;}
      const destination=`https://www.youtube.com/channel/${config.youtubeChannelId}`;
      const receipt=recordMediaNeed({root,need:{
        type:"MediaNeed",version:1,consumer:`education-channel:${channelId}`,
        objective:"Produce one source-grounded native YouTube Short from an accepted long-form education episode and measure it beside its parent.",
        openedAt:state.commissionedAt??state.createdAt,
        expiresAt:publishAt,
        source:{
          type:"AcceptedEducationEpisode",channel:channelId,lessonId,parentVideoId:state.youtubeVideoId,
          parentPublicAddress:`https://www.youtube.com/watch?v=${state.youtubeVideoId}`,parentPublishAt:state.publishAt,
          reportSha256:state.reportSha256??null,videoWorkReceipt:state.videoWorkReceipt??null,notebookId:state.notebookId,
        },
        artifacts:[{
          capability:CAPABILITY,purpose:PURPOSE,priority:95,wanted:1,disposition:"conditional",
          condition:"The configured YouTube receiver, Notebook source lineage, and native-Short production operation remain available.",
          destination,
          generation:{operation:"public-education-native-short",channelId,lessonId,parentVideoId:state.youtubeVideoId,publishAt},
        }],
        expectedFeedback:["creatorContentType confirms SHORTS","engaged views and watch behavior","traffic sources","subscriber changes","parent-versus-Short attention"],
      },origin:`education-channel:${channelId}`});
      const receiverReady=Boolean(config.youtubeChannelId && state.notebookId && config.refreshTokenEnv && env[config.refreshTokenEnv]);
      recordMediaReadiness({root,mediaNeed:receipt.mediaNeed,scope:"receiver",ready:receiverReady,authority:`education-channel:${channelId}`,basis:receiverReady?"The channel, accepted parent, Notebook source lineage and channel credential are present.":"The channel receiver is missing its current credential or Notebook/source binding.",at:now.toISOString(),destination});
      recordMediaReadiness({root,mediaNeed:receipt.mediaNeed,scope:"artifact",purpose:PURPOSE,ready:true,authority:`education-channel:${channelId}`,basis:`Parent ${state.youtubeVideoId} is ${state.stage} for ${state.publishAt}; the Short is scheduled after the parent.`,at:now.toISOString(),destination});
      opened.push({channel:channelId,lesson:lessonId,mediaNeed:receipt.mediaNeed,publishAt,appended:receipt.appended});
    }
  }
  return Object.freeze({type:"EducationShortDemandProjection",status:"complete",observedAt:now.toISOString(),opened:Object.freeze(opened),skipped:Object.freeze(skipped)});
}

function needGeneration(inbox,mediaNeed){
  const need=inbox.needs.find((row)=>row.id===mediaNeed);
  const artifact=need?.artifacts.find((row)=>row.purpose===PURPOSE);
  return need&&artifact?.generation ? {need,artifact,generation:artifact.generation} : null;
}

async function invokeShort(education,generation,lineage){
  if(typeof education.produceShortForChannel!=="function") throw new Error("public education Short operation is not released");
  return education.produceShortForChannel(generation.channelId,generation.lessonId,{
    publishAt:generation.publishAt,parentVideoId:generation.parentVideoId,lineage,
  });
}

export async function dispatchEducationShortProbe({root,education:injected,now=new Date()}={}){
  const education=await educationSurface(injected);
  if(!education || typeof education.produceShortForChannel!=="function") return Object.freeze({type:"EducationShortProbe",status:"blocked",reason:"public-education-short-operation-not-released"});
  if(!admittedChannelIds(education))return Object.freeze({type:"EducationShortProbe",status:"blocked",reason:"no-admitted-education-channels"});
  const allocations=readMediaAllocationStates({root}).filter(row=>row.provider===PROVIDER&&row.purpose===PURPOSE);
  // A generated Short may be awaiting a resumable upload or a confirmed
  // schedule. Neither generation nor a lost provider reply is delivery.
  let allocation=allocations.find(row=>["held","generated"].includes(row.state));
  if(!allocation){
    const completed=allocations.find(row=>["delivered","public-use"].includes(row.state));
    if(completed)return Object.freeze({type:"EducationShortProbe",status:"complete",reason:"native-short-probe-already-completed",allocation:completed.allocation,state:completed.state});
    const latestAttempt=[...allocations].sort((a,b)=>b.recordedAt.localeCompare(a.recordedAt))[0];
    if(latestAttempt&&["released","refused"].includes(latestAttempt.state)&&now.getTime()-Date.parse(latestAttempt.recordedAt)<SHORT_PROBE_COOLDOWN_MS){
      return Object.freeze({type:"EducationShortProbe",status:"complete",reason:"native-short-probe-cooldown",allocation:latestAttempt.allocation,retryAfter:new Date(Date.parse(latestAttempt.recordedAt)+SHORT_PROBE_COOLDOWN_MS).toISOString()});
    }
  }
  const inbox=readMediaDemandInbox({root,now});
  let target;
  if(allocation)target=needGeneration(inbox,allocation.mediaNeed);
  else{
    const plan=planMediaDemandInbox({root,available:1,costs:{[CAPABILITY]:null},allowProbe:true,now});
    if(!plan.probe||plan.probe.capability!==CAPABILITY)return Object.freeze({type:"EducationShortProbe",status:"complete",reason:"no-admissible-native-short-probe"});
    target=needGeneration(inbox,plan.probe.mediaNeed);
    if(!target)return Object.freeze({type:"EducationShortProbe",status:"blocked",reason:"Short demand lost its generation contract"});
    const attempt=1+allocations.length;
    const id=allocationId({type:"MediaAllocation",mediaNeed:target.need.id,purpose:PURPOSE,provider:PROVIDER,attempt,count:1});
    recordMediaAllocationState({root,allocation:id,mediaNeed:target.need.id,purpose:PURPOSE,count:1,state:"held",provider:PROVIDER,at:now.toISOString(),receipt:"native-short-probe",origin:"@causeway-services/public-media-services-section"});
    allocation=readMediaAllocationStates({root}).find(row=>row.allocation===id);
  }
  if(!target)return Object.freeze({type:"EducationShortProbe",status:"blocked",reason:"held Short allocation has no current demand contract",allocation:allocation.allocation});
  const lineage={mediaNeed:target.need.id,allocation:allocation.allocation,purpose:PURPOSE};
  let result;
  try{result=await invokeShort(education,target.generation,lineage);}
  catch(error){
    // A provider can accept generation, upload or schedule before losing its
    // reply. Never release or recommission uncertain effects; resume by the
    // exact native checkpoint in the next turn.
    return Object.freeze({type:"EducationShortProbe",status:"blocked",reason:"short-operation-uncertain",
      allocation:allocation.allocation,state:allocation.state,error:String(error.message??error)});
  }
  if(!result||typeof result.status!=="string")return Object.freeze({type:"EducationShortProbe",status:"blocked",reason:"short-operation-unverified",allocation:allocation.allocation,state:allocation.state});
  const bound=result.mediaNeed===lineage.mediaNeed&&result.allocation===lineage.allocation&&result.purpose===PURPOSE&&result.parentVideoId===target.generation.parentVideoId;
  const scheduled=["short-scheduled","short-published"].includes(result.status);
  const scheduleVerified=scheduled&&bound&&typeof result.videoId==="string"&&result.videoId.length>0&&
    result.publishAt===target.generation.publishAt;
  if(scheduled&&!scheduleVerified)return Object.freeze({type:"EducationShortProbe",status:"blocked",reason:"short-receiving-identity-unverified",
    allocation:allocation.allocation,state:allocation.state,result});
  if(result.mediaNeed&&(result.mediaNeed!==lineage.mediaNeed||result.allocation!==lineage.allocation||result.purpose!==PURPOSE))
    return Object.freeze({type:"EducationShortProbe",status:"blocked",reason:"short-lineage-mismatch",allocation:allocation.allocation,state:allocation.state,result});
  const receipt=result.receipt??result.videoId??result.status;
  let current=allocation;
  const advance=(state,receipt)=>{
    recordMediaAllocationState({root,...current,state,at:now.toISOString(),receipt,origin:"@causeway-services/public-education-services-section"});
    current={...current,state,recordedAt:now.toISOString(),receipt};
  };
  if(current.state==="held"&&bound&&(scheduleVerified||result.workAccepted===true) &&
    (result.receipt||result.videoId||scheduleVerified))advance("generated",receipt);
  if(current.state==="generated"&&scheduleVerified)advance("delivered",result.videoId);
  if(current.state==="delivered"&&result.status==="short-published"&&scheduleVerified)
    advance("public-use","https://www.youtube.com/watch?v="+result.videoId);
  // "short-youtube-scheduling", "short-ready", blocked provider turns and
  // disabled launches are held for reconciliation, never terminal refusals.
  return Object.freeze({type:"EducationShortProbe",status:result.status,allocation:allocation.allocation,mediaNeed:target.need.id,state:current.state,result});
}
export async function reconcileEducationShorts({root,education:injected,now=new Date()}={}){
  const education=await educationSurface(injected);
  if(!education || typeof education.channelIds!=="function")return Object.freeze({type:"EducationShortReconciliation",status:"blocked",reason:"public-education-short-surface-not-released",transitions:Object.freeze([])});
  const channels=admittedChannelIds(education);
  if(!channels)return Object.freeze({type:"EducationShortReconciliation",status:"blocked",reason:"no-admitted-education-channels",transitions:Object.freeze([])});
  education.loadEnvironment?.();
  const latest=new Map(readMediaAllocationStates({root}).map(row=>[row.allocation,row]));
  const transitions=[];
  for(const channelId of channels){
    const config=education.loadChannel(channelId);
    for(const {lessonId,dir,state:parent} of episodeStates(config,education)){
      // Native Education writes notebook-short.json. Historical distribution
      // records retain their old name, but never override native custody.
      const native=education.readJson(join(dir,"notebook-short.json"),null);
      const legacy=education.readJson(join(dir,"short-publication.json"),null);
      let publication=native?.allocation?native:legacy;
      if(!publication?.allocation)continue;
      let current=latest.get(publication.allocation);
      if(!current||["public-use","released","refused"].includes(current.state))continue;
      const videoId=publication.youtubeVideoId??publication.videoId;
      const matches=publication.mediaNeed===current.mediaNeed&&publication.purpose===PURPOSE&&
        current.purpose===PURPOSE&&current.provider===PROVIDER&&publication.parentVideoId===parent.youtubeVideoId;
      if(!matches){
        transitions.push({allocation:current.allocation,state:"obstructed",reason:"short-lineage-or-parent-mismatch"});
        continue;
      }
      const write=(state,receipt)=>{
        recordMediaAllocationState({root,...current,state,at:now.toISOString(),receipt,origin:"@causeway-services/public-education-services-section"});
        current={...current,state,recordedAt:now.toISOString(),receipt};
        latest.set(current.allocation,current);transitions.push({allocation:current.allocation,state,receipt});
      };
      const generationWitness=publication.workReceipt??publication.drive?.sha256??publication.sourceDrive?.sha256??
        publication.notebook?.artifactId??publication.notebook?.generationAttempt?.artifactId??videoId;
      if(current.state==="held"&&generationWitness)write("generated",generationWitness);
      if(current.state==="generated"&&videoId&&["scheduled","published"].includes(publication.stage))write("delivered",videoId);
      if(current.state==="delivered"&&publication.stage!=="published"&&
        Number.isFinite(Date.parse(publication.publishAt))&&Date.parse(publication.publishAt)<=now.getTime()&&
        typeof education.produceShortForChannel==="function"){
        try{
          await education.produceShortForChannel(channelId,lessonId,{
            publishAt:publication.publishAt,parentVideoId:publication.parentVideoId,
            lineage:{mediaNeed:publication.mediaNeed,allocation:publication.allocation,purpose:PURPOSE},
          });
          publication=education.readJson(join(dir,native?.allocation?"notebook-short.json":"short-publication.json"),publication);
        }catch(error){
          transitions.push({allocation:current.allocation,state:"obstructed",reason:String(error.message??error)});
        }
      }
      const confirmedVideo=publication.youtubeVideoId??publication.videoId;
      if(current.state==="delivered"&&publication.stage==="published"&&confirmedVideo===videoId&&videoId)
        write("public-use","https://www.youtube.com/watch?v="+videoId);
    }
  }
  return Object.freeze({type:"EducationShortReconciliation",status:"complete",observedAt:now.toISOString(),transitions:Object.freeze(transitions)});
}
