/**
 * Pure conservation law for work claimed by competing media micro-enterprises.
 * The original MediaNeed demand is the finite supply of work; provider bids are
 * not reservations. Only HELD/GENERATED/DELIVERED reservations and completed
 * PUBLIC-USE consume it. No scalar "value" or counterfeit provider capacity.
 */
const ACTIVE=new Set(["held","generated","delivered"]);
const DONE="public-use";
const RELEASED=new Set(["released","refused"]);
const record=x=>x!==null&&typeof x==="object"&&!Array.isArray(x);
export const mediaArtifactKey=(need,purpose)=>JSON.stringify([need,purpose]);

export function measureMediaDemandConservation({needs,allocations}={}){
  if(!Array.isArray(needs)||!Array.isArray(allocations))
    throw new TypeError("needs and latest allocation states must be arrays");
  const objects=new Map();
  for(const need of needs){
    if(!record(need)||typeof need.id!=="string"||!Array.isArray(need.artifacts))
      throw new TypeError("invalid MediaNeed");
    for(const artifact of need.artifacts){
      const key=mediaArtifactKey(need.id,artifact.purpose);
      if(objects.has(key))throw new Error("duplicate MediaNeed artifact key");
      const original=artifact.wanted;
      if(!Number.isSafeInteger(original)||original<0)throw new TypeError("original wanted must be a nonnegative integer");
      objects.set(key,{mediaNeed:need.id,purpose:artifact.purpose,
        original,reserved:0,fulfilled:0,remaining:original,overbooked:0});
    }
  }
  const seen=new Set(),orphans=[],invalid=[];
  for(const allocation of allocations){
    if(!record(allocation)||typeof allocation.allocation!=="string"||
      !Number.isSafeInteger(allocation.count)||allocation.count<1)
      throw new TypeError("latest allocation needs exact identity and positive count");
    if(seen.has(allocation.allocation))throw new Error("duplicate latest allocation identity");
    seen.add(allocation.allocation);
    const item=objects.get(mediaArtifactKey(allocation.mediaNeed,allocation.purpose));
    if(!item){
      orphans.push(Object.freeze({allocation:allocation.allocation,mediaNeed:allocation.mediaNeed,purpose:allocation.purpose}));
      continue;
    }
    if(ACTIVE.has(allocation.state))item.reserved+=allocation.count;
    else if(allocation.state===DONE)item.fulfilled+=allocation.count;
    else if(!RELEASED.has(allocation.state))invalid.push(Object.freeze({allocation:allocation.allocation,state:allocation.state}));
  }
  const rows=[...objects.values()].map(item=>{
    const total=item.reserved+item.fulfilled;
    return Object.freeze({...item,remaining:Math.max(0,item.original-total),
      overbooked:Math.max(0,total-item.original)});
  });
  const oversubscribed=rows.filter(row=>row.overbooked>0);
  return Object.freeze({
    type:"MediaDemandConservation",items:Object.freeze(rows),
    oversubscribed:Object.freeze(oversubscribed),
    orphanAllocations:Object.freeze(orphans),
    invalidAllocationStates:Object.freeze(invalid),
    conserved:oversubscribed.length===0&&orphans.length===0&&invalid.length===0
  });
}
