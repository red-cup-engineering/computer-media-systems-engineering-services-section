import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { readMediaDemandInbox } from "./media-demand-journal.mjs";

const readJson=(path)=>JSON.parse(readFileSync(path,"utf8"));
const EDUCATION="lib/emsenn/services/561-group/services/public-services-section/services/public-social-services-section/services/public-education-services-section";
const CLIMATE="services/public-science-education-services-section/services/engineering-science-education-services-section/services/ecological-science-education-services-section/services/climate-science-education-services-section";

function climateCandidate(repositoryRoot){
  const domain=resolve(repositoryRoot,EDUCATION,CLIMATE);
  const curriculumPath=join(domain,"content","curricula","climate-place-by-place","curriculum.json");
  if(!existsSync(curriculumPath)) return Object.freeze({id:"climate-place-by-place",status:"blocked",reason:"curriculum-not-found"});
  const curriculum=readJson(curriculumPath), curriculumDir=dirname(curriculumPath);
  const lessons=curriculum.lessons.map((lesson)=>{
    const relative=lesson.report??`lessons/${lesson.id}/report.md`;
    return Object.freeze({id:lesson.id,title:lesson.title,report:relative,ready:existsSync(resolve(curriculumDir,relative))});
  });
  const ready=lessons.filter((lesson)=>lesson.ready);
  const channelConfigPath=join(domain,"channels","climate-place-by-place","config.json");
  const config=existsSync(channelConfigPath)?readJson(channelConfigPath):null;
  let status="supply-building",next="finish at least four accepted lesson reports";
  if(ready.length>=4){
    if(!config?.youtubeChannelId){status="needs-channel-provisioning";next="create the Climate, Place-by-Place YouTube channel in the account UI and retain its channel id";}
    else if(!config?.notebookId){status="needs-notebook-binding";next="bind a Gemini Notebook source workspace and channel credential";}
    else if(config.enabled===false){status="ready-for-bounded-launch";next="admit the launch bundle and enable only after receiver/credential verification";}
    else {status="active";next="use the ordinary education production/analytics loop";}
  }
  return Object.freeze({
    id:"climate-place-by-place",name:"Climate, Place-by-Place",kind:"youtube-education-channel",priority:100,status,next,
    evidence:Object.freeze({curriculumLessons:lessons.length,readyReports:ready.length,channelConfigPresent:Boolean(config),youtubeChannelId:config?.youtubeChannelId??null,notebookId:config?.notebookId??null,enabled:config?.enabled??false}),
    launchBundle:Object.freeze(ready.slice(0,4).map(({id,title,report})=>Object.freeze({id,title,report}))),
    obligation:status==="needs-channel-provisioning"?Object.freeze({kind:"human-account-ui",because:"The YouTube Data API currently exposes channels.list/update but no channels.insert/create operation."}):null,
  });
}

function paceCandidate(env){
  const credential=Boolean(env.PACE_YOURSELF_YOUTUBE_OAUTH_REFRESH_TOKEN);
  return Object.freeze({
    id:"pace-yourself",name:"PACE Yourself",kind:"youtube-health-education-channel",priority:70,status:"governance-readiness-review",
    next:"reconstruct the disabled-state reason, bind a Gemini Notebook, clear health-specific editorial/scientific acceptance, then run one bounded launch fixture",
    evidence:Object.freeze({
      sourceRepository:"emsenn/health-education-youtube-services-section",observedAt:"2026-10-04",youtubeChannelId:"UC3M3DheHyXSdrK12c3cpojQ",handle:"@PACE-Yourself",
      enabled:false,notebookId:null,curriculumLessons:6,publicationHistory:0,credentialPresent:credential,
    }),
    obligations:Object.freeze([
      ...(!credential?[Object.freeze({kind:"google-oauth-consent",credential:"PACE_YOURSELF_YOUTUBE_OAUTH_REFRESH_TOKEN"})]:[]),
      Object.freeze({kind:"notebook-binding"}),
      Object.freeze({kind:"health-editorial-readiness",because:"Spare Notebook capacity is not authority to publish health education."}),
    ]),
  });
}

function koiosCandidate(root,now){
  const inbox=readMediaDemandInbox({root,consumer:"koios-news-services-section",now});
  const video=inbox.needs.flatMap((need)=>need.artifacts.map((artifact)=>({need,artifact})))
    .filter(({artifact})=>artifact.purpose==="short-form-discovery"&&artifact.wanted>0);
  const ready=inbox.frontier.filter((row)=>row.consumer==="koios-news-services-section"&&row.purpose==="short-form-discovery"&&row.state==="admissible"&&row.wanted>0);
  const threshold=6;
  return Object.freeze({
    id:"koios-video",name:"Koios video/Shorts",kind:"youtube-news-channel-candidate",priority:50,
    status:video.length>=threshold?"channel-provisioning-assessment":"demand-building",
    next:video.length>=threshold?"assess a dedicated Koios video public address and launch bundle":"keep letting witnessed articles open MediaNeeds; do not provision an empty channel",
    evidence:Object.freeze({openShortDemands:video.length,receiverReadyShortDemands:ready.length,provisioningDemandThreshold:threshold}),
  });
}

export function mediaChannelCandidateReadout({repositoryRoot=process.env.METROPLAT_REPOSITORY_ROOT,root,env=process.env,now=new Date()}={}){
  if(typeof repositoryRoot!=="string"||!repositoryRoot) throw new TypeError("METROPLAT_REPOSITORY_ROOT is required");
  if(typeof root!=="string"||!root) throw new TypeError("shared media data root is required");
  const candidates=[climateCandidate(repositoryRoot),paceCandidate(env),koiosCandidate(root,now)];
  return Object.freeze({type:"CausewayMediaChannelCandidates",observedAt:now.toISOString(),candidates:Object.freeze(candidates)});
}
