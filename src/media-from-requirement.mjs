/**
 * Projection, not another requirement ontology: a live 561 Group requirement
 * of kind "requirement", with source SignCell when present, can become a
 * proposed MediaNeed only after the CONSUMING service supplies the actual
 * media brief. This projection neither authorizes rights nor procures a model.
 */
import {admitMediaNeed} from "./media-need-contract.mjs";
const record=x=>x!==null&&typeof x==="object"&&!Array.isArray(x);
const required=(v,name)=>{
  if(typeof v!=="string"||!v.trim())throw new TypeError(name+" is required");
  return v.trim();
};

/**
 * {Requirement source + consumer media brief}
 *      project (pure)
 * {PROPOSED_NOT_ADMITTED MediaNeed; source and SignCell evidence retained}
 *
 * Never derive "we need an image" from arbitrary prose or an unset claim:
 * the consuming office must name objective, destination, output and review.
 */
export function proposeMediaNeedFromRequirement({requirement,brief,sourcePath}={}){
  if(!record(requirement)||requirement.kind!=="requirement")
    throw new TypeError("existing native kind=requirement record required");
  const id=required(requirement.id,"native requirement id");
  required(requirement.asks,"original requirement ask");
  if(!record(brief)||!Array.isArray(brief.artifacts)||brief.artifacts.length===0)
    throw new TypeError("consuming service media brief and artifacts required");
  const path=required(sourcePath,"source requirement path");
  const consumer=required(brief.consumer,"consuming service");
  const objective=required(brief.objective,"specific media objective");
  if(typeof brief.openedAt!=="string"||!Number.isFinite(Date.parse(brief.openedAt)))
    throw new TypeError("openedAt must be an instant");
  const cell=requirement["x-provenance"]?.["sign-cell"]??requirement["sign-cell"];
  if(cell!==undefined&&(!record(cell)||typeof cell.mark!=="string"||!cell.mark.startsWith("ni:///sha-256;")))
    throw new TypeError("native SignCell source mark is invalid");
  const artifacts=brief.artifacts.map((raw,index)=>{
    if(!record(raw))throw new TypeError("artifact "+index+" must be an object");
    return {
      capability:required(raw.capability,"artifact capability"),
      purpose:required(raw.purpose,"artifact purpose"),
      destination:required(raw.destination,"artifact receiver"),
      acceptanceCriteria:required(raw.acceptanceCriteria,"artifact acceptance criteria"),
      wanted:raw.wanted??1,
      priority:0,
      disposition:"hold",
      ...(typeof raw.visualBrief==="string"&&raw.visualBrief.trim()?{visualBrief:raw.visualBrief.trim()}:{})
    };
  });
  const candidate={
    type:"MediaNeed",version:1,consumer,objective,
    openedAt:new Date(brief.openedAt).toISOString(),
    source:{
      requirementPath:path,requirementId:id,
      ...(cell?.mark?{signCellMark:cell.mark}:{}),
      ...(cell?.cell?{signCell:cell.cell}:{}),
      raisedBy:requirement["raised-by"]??null,
      speechAct:"unapproved-media-projection"
    },
    intake:{
      state:"proposed-unverified",
      ...(brief.reviewer?{reviewer:required(brief.reviewer,"accepting reviewer")}:{})
    },
    artifacts
  };
  // Shared canonical admission checks artifact key uniqueness, types, bounds.
  // The temporary validation id must never masquerade as a journal identity.
  admitMediaNeed({...candidate,id:"unrecorded-projection"});
  return Object.freeze({
    type:"MediaRequirementProjection",status:"PROPOSED_NOT_ADMITTED",
    originalRequirement:id,
    mediaNeedCandidate:Object.freeze(candidate),
    evidence:"source requirement and SignCell preserved; customer must separately settle rights, reuse, priority, readiness and reviewer"
  });
}
