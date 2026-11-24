/** Provider-neutral, read-only opportunity projection over EXISTING MediaNeed state. */
const nonempty=(v,name)=>{if(typeof v!=="string"||!v.trim())throw new TypeError(name+" must be nonempty");return v.trim()};
const allowlist=(xs,name)=>{if(!Array.isArray(xs)||!xs.length)throw new TypeError(name+" must be a nonempty explicit array");return new Set(xs.map(v=>nonempty(v,name)))};

/**
 * Supply an EXPLICIT authorized consumer scope. This function is not an ACL:
 * admission to the shared journal still belongs to the provider's host.
 * Nothing here can mint demand, imply a bid, grant capacity or award work.
 */
export function projectMediaBidOpportunities({inbox,bids=[],consumers,capabilities}={}){
  const scope=allowlist(consumers,"consumers");
  const kinds=allowlist(capabilities,"capabilities");
  if(!inbox||!Array.isArray(inbox.needs)||!Array.isArray(inbox.frontier)||!Array.isArray(inbox.allocations))
    throw new TypeError("live MediaDemandInbox observation required");
  if(!Array.isArray(bids))throw new TypeError("observed provider bids array required");
  const needById=new Map(inbox.needs.map(n=>[n.id,n]));
  const items=[];
  for(const row of inbox.frontier){
    if(row.state!=="admissible"||!(row.wanted>0)||!scope.has(row.consumer)||!kinds.has(row.capability))continue;
    const need=needById.get(row.need);
    if(!need||need.intake?.state==="proposed-unverified")continue;
    const artifact=need.artifacts.find(a=>a.purpose===row.purpose);
    if(!artifact||artifact.capability!==row.capability)continue;
    const offers=bids.filter(b=>b.mediaNeed===row.need&&b.purpose===row.purpose);
    items.push(Object.freeze({
      mediaNeed:row.need,consumer:row.consumer,purpose:row.purpose,capability:row.capability,
      wanted:row.wanted,priority:row.priority,destination:artifact.destination??null,
      source:need.source??null,objective:need.objective,
      acceptanceCriteria:artifact.acceptanceCriteria??need.intake?.acceptanceCriteria??null,
      observedBidCount:offers.length,
      // This is a view of independent offers, not a bid recommendation.
      existingProviders:Object.freeze([...new Set(offers.map(b=>b.provider))].sort()),
      state:"OPEN_TO_PROVIDER_OFFERS_NOT_AWARDED"
    }));
  }
  items.sort((a,b)=>b.priority-a.priority||a.consumer.localeCompare(b.consumer)||a.mediaNeed.localeCompare(b.mediaNeed)||a.purpose.localeCompare(b.purpose));
  return Object.freeze({type:"MediaProviderOpportunityFrontier",status:"OBSERVED_NOT_RESERVED",
    consumers:Object.freeze([...scope].sort()),capabilities:Object.freeze([...kinds].sort()),
    opportunities:Object.freeze(items)});
}

/** Reads only authenticated host-local journal; it is not a public listing. */
export async function readMediaBidOpportunities({root,consumers,capabilities,now=new Date()}={}){
  if(typeof root!=="string"||!root)throw new TypeError("authenticated shared journal root is required");
  const [{readMediaDemandInbox},{readMediaProviderBids}]=await Promise.all([
    import("./media-demand-journal.mjs"),import("./media-provider-bid-journal.mjs")
  ]);
  return projectMediaBidOpportunities({
    inbox:readMediaDemandInbox({root,now}),bids:readMediaProviderBids({root}),consumers,capabilities
  });
}
