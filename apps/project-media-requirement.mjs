#!/usr/bin/env node
import {readFileSync} from "node:fs";
import {proposeMediaNeedFromIssue} from "../src/media-requirement-intake.mjs";
const args=process.argv.slice(2);
const record=args.includes("--record");
const paths=args.filter(arg=>arg!=="--record");
if(paths.length!==1)throw new Error("Usage: project-media-requirement.mjs GITHUB_EVENT_JSON [--record]");
const event=JSON.parse(readFileSync(paths[0],"utf8"));
const projected=proposeMediaNeedFromIssue(event.issue??event);
// Default CI mode: proposal only, never promoted to receiver-ready demand.
// Trusted receiver mode: append the still-held proposal to the existing shared
// MediaNeed semantic journal; owner and artifact readiness remain separate.
if(!record){
  process.stdout.write(JSON.stringify(projected,null,2)+"\n");
}else{
  const root=process.env.METROPLAT_WEB_DATA_DIR;
  if(!root)throw new Error("METROPLAT_WEB_DATA_DIR is required for recording");
  const {recordMediaNeed}=await import("../src/media-demand-journal.mjs");
  const result=recordMediaNeed({root,need:projected.mediaNeedCandidate,origin:projected.issue});
  process.stdout.write(JSON.stringify({status:"RECORDED_NOT_READY",issue:projected.issue,mediaNeed:result.mediaNeed,receipt:result},null,2)+"\n");
}
