/**
 * The existing semantic-record journal carries independent (for, against)
 * witness flags. Readiness is a conservative Boolean admission projection:
 * only support-without-counterevidence permits action. The full two-sided
 * evidence and distinct authorities survive this projection.
 */
export function normalizeReadinessEvidence({ready,evidence}={}){
  if(evidence===undefined){
    if(typeof ready!=="boolean")throw new TypeError("readiness requires boolean ready or two-sided evidence");
    return Object.freeze({for:ready,against:!ready});
  }
  if(evidence===null||typeof evidence!=="object"||Array.isArray(evidence)||
    typeof evidence.for!=="boolean"||typeof evidence.against!=="boolean")
    throw new TypeError("readiness evidence must independently supply Boolean for and against");
  const projected=evidence.for&&!evidence.against;
  if(ready!==undefined&&(typeof ready!=="boolean"||ready!==projected))
    throw new TypeError("ready projection contradicts two-sided readiness evidence");
  return Object.freeze({for:evidence.for,against:evidence.against});
}
export function readinessTruth(evidence){
  const state=normalizeReadinessEvidence({evidence});
  return state.for?(state.against?"both":"supported"):(state.against?"refuted":"neither");
}
const join=(a,b)=>Object.freeze({for:a.for||b.for,against:a.against||b.against});
const state=evidence=>Object.freeze({ready:evidence.for&&!evidence.against,evidence,truth:readinessTruth(evidence)});
const at=record=>{const t=Date.parse(record.recordedAt);if(!Number.isFinite(t))throw new TypeError("readiness observation timestamp required");return t};

/**
 * One authority's latest event supersedes that authority's older events;
 * simultaneous contradictory events join to 'both', never arbitrary order.
 * Different authorities remain independent evidence contributors.
 * This does not authenticate any actor: input must come from the host's
 * already authorized/witnessed journal, not a public form.
 */
export function aggregateReadinessEvidence(records){
  if(!Array.isArray(records))throw new TypeError("readiness records required");
  const latestByAuthority=new Map();
  for(const record of records){
    if(!record||typeof record!=="object")throw new TypeError("readiness record must be an object");
    const {mediaNeed,scope,authority,purpose}=record;
    if(typeof mediaNeed!=="string"||!mediaNeed||typeof authority!=="string"||!authority||
      !["receiver","artifact"].includes(scope)||(scope==="artifact"&&(!purpose||typeof purpose!=="string")))
      throw new TypeError("readiness record must bind need, scope, authority, and artifact purpose if applicable");
    const key=JSON.stringify([scope,mediaNeed,scope==="artifact"?purpose:null,authority]);
    const evidence=normalizeReadinessEvidence(record);
    const moment=at(record);
    const previous=latestByAuthority.get(key);
    if(!previous||previous.moment<moment)latestByAuthority.set(key,{record,moment,evidence});
    else if(previous.moment===moment)latestByAuthority.set(key,{record,moment,evidence:join(previous.evidence,evidence)});
  }
  const receiver=new Map(),artifact=new Map();
  for(const {record,evidence} of latestByAuthority.values()){
    const target=record.scope==="receiver"?receiver:artifact;
    const key=record.scope==="receiver"?record.mediaNeed:record.mediaNeed+"#"+record.purpose;
    const old=target.get(key)?.evidence;
    target.set(key,state(old?join(old,evidence):evidence));
  }
  return Object.freeze({receiver,artifact});
}


/**
 * A consumer-scoped inbox must not expose other principals' readiness or
 * counterevidence merely because the host's backing journal is shared.
 *
 * This is a projection after host authorization, never itself an ACL.
 * Only exact admitted need/artifact identities are returned; orphan
 * readiness records remain in the journal but cannot leak into this view.
 */
export function scopeMediaReadinessEvidence({receiver,artifact},needs){
  if(!(receiver instanceof Map)||!(artifact instanceof Map)||!Array.isArray(needs))
    throw new TypeError("readiness maps and admitted MediaNeed list required");
  const allowedNeedIds=new Set();
  const allowedArtifactKeys=new Set();
  for(const need of needs){
    if(!need||typeof need.id!=="string"||!Array.isArray(need.artifacts))
      throw new TypeError("cannot scope readiness to an invalid MediaNeed");
    allowedNeedIds.add(need.id);
    for(const entry of need.artifacts){
      if(typeof entry?.purpose!=="string")
        throw new TypeError("scoped MediaNeed has no artifact purpose");
      allowedArtifactKeys.add(need.id+"#"+entry.purpose);
    }
  }
  return Object.freeze({
    receiver:new Map([...receiver].filter(([key])=>allowedNeedIds.has(key))),
    artifact:new Map([...artifact].filter(([key])=>allowedArtifactKeys.has(key)))
  });
}
