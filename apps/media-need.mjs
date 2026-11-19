#!/usr/bin/env node
/** Portable author-side MediaNeed requirement check and trusted journal ingest. */
import {readFileSync,realpathSync} from "node:fs";
import {resolve,relative,isAbsolute,sep} from "node:path";
import {admitMediaNeed} from "../src/media-need-contract.mjs";
const [mode,file,...extra]=process.argv.slice(2);
if(!["--check","--record"].includes(mode)||!file||extra.length)throw new Error("Usage: media-need.mjs --check|--record MEDIA_NEED.json");
const source=JSON.parse(readFileSync(file,"utf8"));
const raw={...source,id:source.id??"unassigned-source-draft"};
const validated=admitMediaNeed(raw);
if(!source.source||typeof source.source!=="object"||Array.isArray(source.source)
  ||!Object.values(source.source).some(x=>typeof x==="string"&&x.trim()))
  throw new TypeError("a source reference or revision is required");
// If the consumer identifies an existing native requirement, assert actual
// file lineage, not just a hand-copied label. This is a local source assay,
// not a grant of editorial/rights/production authority.
if(source.source.requirementPath!==undefined){
  const path=source.source.requirementPath;
  if(typeof path!=="string"||!path.trim()||isAbsolute(path))
    throw new TypeError("source.requirementPath must be a repository-relative file");
  const root=realpathSync(process.cwd());
  const target=realpathSync(resolve(root,path));
  const rel=relative(root,target);
  if(rel===""||rel===".."||rel.startsWith(".."+sep)||isAbsolute(rel))
    throw new TypeError("source requirement must remain within the consuming repository");
  const requirement=JSON.parse(readFileSync(target,"utf8"));
  if(requirement.kind!=="requirement"||typeof requirement.id!=="string"||
     !requirement.id.trim()||typeof requirement.asks!=="string"||!requirement.asks.trim())
    throw new TypeError("referenced source must be a real typed requirement with an ask");
  if(source.source.requirementId!==requirement.id)
    throw new TypeError("source.requirementId differs from actual requirement");
  const cell=requirement["x-provenance"]?.["sign-cell"]??requirement["sign-cell"];
  if(cell?.mark!==undefined){
    if(source.source.signCellMark!==cell.mark)
      throw new TypeError("source.signCellMark differs from source requirement SignCell");
  }else if(source.source.signCellMark!==undefined){
    throw new TypeError("source has a SignCell mark that the requirement does not");
  }
}
for(const artifact of validated.artifacts){
  if(typeof artifact.destination!=="string"||!artifact.destination.trim())
    throw new TypeError("each artifact must name its receiving destination");
  if(typeof (artifact.acceptanceCriteria??source.intake?.acceptanceCriteria)!=="string"
    ||!(artifact.acceptanceCriteria??source.intake?.acceptanceCriteria).trim())
    throw new TypeError("each artifact needs testable consumer acceptance criteria");
}
if(mode==="--check"){
  // No generated, synthetic or user-provided id is described as a received id.
  process.stdout.write(JSON.stringify({status:"SOURCE_REQUIREMENT_VALID_UNRECEIVED",consumer:validated.consumer,
    artifacts:validated.artifacts.map(a=>({purpose:a.purpose,capability:a.capability,disposition:a.disposition}))})+"\n");
}else{
  const root=process.env.METROPLAT_WEB_DATA_DIR;
  if(!root)throw new Error("METROPLAT_WEB_DATA_DIR required for --record");
  const {recordMediaNeed}=await import("../src/media-demand-journal.mjs");
  const {id:providedId,...content}=source;
  const receipt=recordMediaNeed({root,need:content,origin:source.source.issue??source.source.ref??source.source.publicAddress??"consumer-source"});
  process.stdout.write(JSON.stringify({status:"RECORDED_NOT_READY",mediaNeed:receipt.mediaNeed,receipt})+"\n");
}
