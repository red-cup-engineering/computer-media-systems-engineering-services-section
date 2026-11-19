/**
 * Provider-neutral projection of the EXISTING allocation + consumer + binary
 * custody evidence into an independent receiving queue. It does not decide
 * editorial acceptance, publish, or accept provider-authored success claims.
 */
const clean=(x)=>x!==null&&typeof x==="object"&&!Array.isArray(x);

export function projectMediaArtifactReviewQueue({
  allocations,needs,reviews=[],artifacts=[],now=new Date()
}={}){
  if(![allocations,needs,reviews,artifacts].every(Array.isArray))
    throw new TypeError("review queue requires observed allocation, need, review and artifact arrays");
  const needById=new Map(needs.map(n=>[n.id,n]));
  const reviewed=new Set(reviews.map(r=>r.allocation));
  const byAllocation=new Map(),ambiguous=new Set();
  for(const a of artifacts){
    if(!clean(a)||typeof a.allocation!=="string"||!a.allocation.trim())
      throw new TypeError("custody artifact needs allocation identity");
    if(byAllocation.has(a.allocation))ambiguous.add(a.allocation);
    else byAllocation.set(a.allocation,a);
  }
  const items=[],blocked=[];
  for(const row of allocations){
    if(!["generated","delivered"].includes(row.state)||reviewed.has(row.allocation))continue;
    if(ambiguous.has(row.allocation)){
      blocked.push({allocation:row.allocation,reason:"ambiguous-provider-custody"});
      continue;
    }
    const artifact=byAllocation.get(row.allocation);
    if(!artifact){
      blocked.push({allocation:row.allocation,reason:"provider-custody-not-observed"});
      continue;
    }
    const need=needById.get(row.mediaNeed);
    const demand=need?.artifacts?.find(a=>a.purpose===row.purpose);
    if(!need||!demand){
      blocked.push({allocation:row.allocation,reason:"source-need-or-artifact-missing"});
      continue;
    }
    if(artifact.mediaNeed!==row.mediaNeed||artifact.purpose!==row.purpose||
       (artifact.provider!==undefined&&artifact.provider!==row.provider)){
      blocked.push({allocation:row.allocation,reason:"provider-custody-lineage-mismatch"});
      continue;
    }
    if(typeof artifact.completionId!=="string"||!artifact.completionId.trim()||
       typeof artifact.storedPath!=="string"||!artifact.storedPath.trim()){
      blocked.push({allocation:row.allocation,reason:"provider-completion-bytes-not-retained"});
      continue;
    }
    items.push(Object.freeze({
      allocation:row.allocation,mediaNeed:row.mediaNeed,purpose:row.purpose,consumer:need.consumer,
      provider:row.provider,...(row.bid?{bid:row.bid,awardRef:row.awardRef}:{}),
      completionId:artifact.completionId,output:artifact.output??null,
      providerArtifactId:artifact.providerArtifactId??null,
      providerStoredPath:artifact.storedPath,mimeType:artifact.mimeType??null,
      generatedAt:artifact.generatedAt??null,
      destination:artifact.intendedDestination??demand.destination??null,
      source:need.source??null,objective:need.objective,
      generation:demand.generation??null,distribution:demand.distribution??null,
      visualBrief:demand.visualBrief??null,expectedFeedback:need.expectedFeedback??null,
      acceptanceCriteria:demand.acceptanceCriteria??need.intake?.acceptanceCriteria??null,
      reviewInstruction:"Inspect actual bytes, provenance and rights; assay exact source and requested recipient, accessibility, and artifact-specific acceptance. Record an independent decision; generated media is never public-use by itself."
    }));
  }
  return Object.freeze({
    type:"MediaArtifactReviewQueue",status:"complete",
    observedAt:now instanceof Date?now.toISOString():new Date(now).toISOString(),
    items:Object.freeze(items),count:items.length,
    blocked:Object.freeze(blocked),blockedCount:blocked.length
  });
}
