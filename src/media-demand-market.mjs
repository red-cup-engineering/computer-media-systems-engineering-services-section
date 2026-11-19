import { shareAllowance } from "@red-cup-engineering/organizing/enterprise";
import {admitMediaNeed} from "./media-need-contract.mjs";
export {admitMediaNeed} from "./media-need-contract.mjs";

const artifactKey=(need,artifact)=>`${need.id}#${artifact.purpose}`;
export function mediaDemandFrontier(needs,{readiness={},receivers={},now=new Date()}={}) {
  const at=now instanceof Date?now:new Date(now);
  if (!Number.isFinite(at.getTime())) throw new TypeError("frontier now must be an instant");
  const rows=[];
  for (const raw of needs??[]) {
    const need=admitMediaNeed(raw);
    const expired=need.expiresAt && Date.parse(need.expiresAt)<=at.getTime();
    for (const artifact of need.artifacts) {
      const key=artifactKey(need,artifact);
      let state=artifact.disposition;
      let reason=null;
      if (expired) { state="expired"; reason="need-expired"; }
      else if (need.intake?.state === "proposed-unverified") {
        state="blocked"; reason="source-proposal-not-admitted";
      }
      else if (receivers[need.id]!==true) { state="blocked"; reason="receiver-readiness-unsettled"; }
      else if (artifact.disposition==="conditional" && readiness[key]!==true) { state="blocked"; reason="condition-unsettled"; }
      else if (artifact.disposition==="hold") { state="blocked"; reason="receiver-hold"; }
      else if (artifact.disposition==="ineligible") { state="ineligible"; reason="receiver-ineligible"; }
      else if (artifact.disposition==="conditional") state="admissible";
      rows.push(Object.freeze({
        key,need:need.id,consumer:need.consumer,capability:artifact.capability,purpose:artifact.purpose,
        priority:artifact.priority,wanted:artifact.wanted,state,
        ...(reason?{reason}:{}),
        ...(artifact.destination?{destination:artifact.destination}:{}),
      }));
    }
  }
  return Object.freeze(rows);
}

/**
 * Plan one allowance's media draws from already-admitted receiver demand.
 *
 * This is deliberately not a "viral score": receiver priority is authoritative, past service is
 * only fairness memory, and provider capacity never creates demand. Known-price work is delegated
 * to organizing's work-conserving shareAllowance. At most one unknown-price probe is proposed, and
 * only when the caller explicitly permits probing; the actual allowance-ledger hold remains the
 * coordinating/sealed effect boundary.
 */
export function planMediaAllowance({
  available,
  costs,
  needs,
  readiness={},
  receivers={},
  served={},
  weights={},
  allowProbe=false,
  now=new Date(),
}={}) {
  if (!(typeof available==="number" && available>=0 && Number.isFinite(available))) throw new TypeError("available must be a finite non-negative number");
  const frontier=mediaDemandFrontier(needs,{readiness,receivers,now});
  const admissible=frontier.filter(row=>row.state==="admissible" && row.wanted>0);
  const priced=[],free=[],unknown=[],unsupported=[];
  for (const row of admissible) {
    const hasPrice=Object.prototype.hasOwnProperty.call(costs??{},row.capability);
    const price=costs?.[row.capability];
    const history=served[`${row.consumer}\0${row.capability}`] ?? 0;
    const weight=weights[row.consumer] ?? 1;
    if (!hasPrice) {
      unsupported.push(row);
    } else if (price===0) {
      free.push({
        mediaNeed:row.need,consumer:row.consumer,capability:row.capability,purpose:row.purpose,
        draws:row.wanted,units:0,...(row.destination?{destination:row.destination}:{}),
        _priority:row.priority,_served:history,_weight:weight,
      });
    } else if (typeof price==="number" && price>0 && Number.isFinite(price)) {
      priced.push({
        consumer:row.key,
        kind:row.capability,
        wanted:row.wanted,
        priority:row.priority,
        served:history,
        weight,
      });
    } else if (price===null) {
      unknown.push({...row,served:history,weight});
    } else {
      throw new TypeError(`cost for ${row.capability} must be non-negative, null for unknown, or absent`);
    }
  }
  const shared=priced.length
    ? shareAllowance({available,costs,demands:priced})
    : Object.freeze({grants:Object.freeze([]),allocated:0,unallocated:available});
  const byKey=new Map(frontier.map(row=>[row.key,row]));
  const grants=shared.grants.map(grant=>{
    const row=byKey.get(grant.consumer);
    return Object.freeze({
      mediaNeed:row.need,consumer:row.consumer,capability:row.capability,purpose:row.purpose,
      draws:grant.draws,units:grant.units,...(row.destination?{destination:row.destination}:{})
    });
  });
  free.sort((a,b)=>b._priority-a._priority || a._served/a._weight-b._served/b._weight || a.consumer.localeCompare(b.consumer) || a.purpose.localeCompare(b.purpose));
  const freeGrants=free.map(({_priority:_p,_served:_s,_weight:_w,...grant})=>Object.freeze(grant));
  let probe=null;
  if (allowProbe && available>0 && unknown.length) {
    unknown.sort((a,b)=>b.priority-a.priority || a.served/a.weight-b.served/b.weight || a.key.localeCompare(b.key));
    const row=unknown[0];
    probe=Object.freeze({
      mediaNeed:row.need,consumer:row.consumer,capability:row.capability,purpose:row.purpose,
      reason:"unknown-price-probe",...(row.destination?{destination:row.destination}:{})
    });
  }
  return Object.freeze({
    frontier,
    grants:Object.freeze(grants),
    free:Object.freeze(freeGrants),
    probe,
    allocated:shared.allocated,
    unallocated:shared.unallocated,
    blocked:Object.freeze(frontier.filter(row=>row.state!=="admissible")),
    unknown:Object.freeze(unknown.map(({served:_s,weight:_w,...row})=>Object.freeze(row))),
    unsupported:Object.freeze(unsupported),
  });
}
