/** Plain-language cross-ecosystem intake projected onto the existing MediaNeed. */
const REQUIRED=[
  "Consuming enterprise or office","Source or requirement reference","What must this media accomplish?",
  "Artifact capability","Artifact purpose (stable key)","Delivery destination or placement",
  "Acceptance criteria","Reviewing office or person","Rights and reuse status"
];
const CAPS=new Set(["image-generation","source-grounded-short-video","source-grounded-slide-deck","audio-production","image-editing","native-capture"]);
const RIGHTS=new Set(["Unknown / needs review","Rights claimed by consumer","Prohibited / do not generate"]);
function fieldsOf(body){
  if(typeof body!=="string"||body.length>32000)throw new TypeError("issue body missing or too large");
  const found=new Map(),heads=[...body.matchAll(/^### ([^\n]+)\s*$/gmu)];
  for(let i=0;i<heads.length;i++){
    const start=heads[i].index+heads[i][0].length,end=i+1<heads.length?heads[i+1].index:body.length,key=heads[i][1].trim();
    if(found.has(key))throw new TypeError("duplicate issue field: "+key);
    found.set(key,body.slice(start,end).trim());
  }
  return found;
}
const required=(fields,key)=>{
  const value=fields.get(key);
  if(!value||value==="_No response_"||value.length>8000)throw new TypeError("missing or oversized field: "+key);
  return value;
};
/**
 * Issue authors propose; they do NOT become customer, reviewer, rights authority
 * or provider by typing names into a public form.
 * The result is deliberately held until existing MediaReadiness is witnessed.
 */
export function proposeMediaNeedFromIssue(issue){
  if(!issue||typeof issue!=="object"||Array.isArray(issue))throw new TypeError("issue object required");
  // This form is INTERNAL to the owning private repository. A public report,
  // even one that copies all field names, is not an admissible media demand.
  if(typeof issue.html_url!=="string"||!/^https:\/\/github\.com\/causeway-services\/public-media-services-section\/issues\/\d+$/u.test(issue.html_url))
    throw new TypeError("canonical private media-intake repository issue URL required");
  const opened=new Date(issue.created_at);
  if(!Number.isFinite(opened.getTime()))throw new TypeError("issue created_at required");
  const fields=fieldsOf(issue.body);
  for(const key of REQUIRED)required(fields,key);
  const capability=required(fields,"Artifact capability"),rights=required(fields,"Rights and reuse status");
  if(!CAPS.has(capability))throw new TypeError("unsupported artifact capability");
  if(!RIGHTS.has(rights))throw new TypeError("unsupported rights status");
  const purpose=required(fields,"Artifact purpose (stable key)");
  if(!/^[a-z][a-z0-9-]{1,63}$/u.test(purpose))throw new TypeError("artifact purpose must be stable kebab-case");
  const disposition=rights==="Prohibited / do not generate"?"ineligible":
    rights==="Unknown / needs review"?"hold":"conditional";
  const need={
    type:"MediaNeed",version:1,
    consumer:required(fields,"Consuming enterprise or office"),
    objective:required(fields,"What must this media accomplish?"),openedAt:opened.toISOString(),
    source:{issue:issue.html_url,requirement:required(fields,"Source or requirement reference"),
      submittedBy:issue.user?.login??"unknown"},
    intake:{
      state:"proposed-unverified",proposedRights:rights,
      reviewer:required(fields,"Reviewing office or person"),
      acceptanceCriteria:required(fields,"Acceptance criteria"),
      ...(fields.get("Visual and factual constraints")?{visualBrief:fields.get("Visual and factual constraints")}:{ }),
      ...(fields.get("Existing usable media reference")&&fields.get("Existing usable media reference")!=="_No response_"?
        {existingAsset:fields.get("Existing usable media reference")}:{ }),
      ...(fields.get("Suggested urgency")?{suggestedUrgency:fields.get("Suggested urgency")}:{ })
    },
    artifacts:[{
      capability,purpose,destination:required(fields,"Delivery destination or placement"),
      priority:0,wanted:1,disposition,
      ...(disposition==="conditional"?{condition:"independent owner, rights, reuse, reviewer and destination readiness"}:{})
    }]
  };
  return Object.freeze({type:"MediaRequirementProposal",status:"PROPOSED_NOT_ADMITTED",issue:issue.html_url,mediaNeedCandidate:need,
    warning:"Issue authorship does not establish customer standing, rights, priority, provider award, or receiver readiness."});
}
