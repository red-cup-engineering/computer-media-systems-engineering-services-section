/** Customer-specific bid refinement of an existing MediaNeed, not a provider registry. */
const obj=x=>x!==null&&typeof x==="object"&&!Array.isArray(x);
const name=(x,k)=>{if(typeof x!=="string"||!x.trim())throw new TypeError(k+" must be nonempty");return x.trim()};
const instant=(x,k)=>{const t=Date.parse(name(x,k));if(!Number.isFinite(t))throw new TypeError(k+" must be an instant");return new Date(t).toISOString()};
const amount=(x,k)=>{if(!Number.isSafeInteger(x)||x<1)throw new TypeError(k+" must be positive integer");return x};
const COST=new Set(["no-charge","quoted","unknown"]);

/** Bid binds exactly one consumer demand, via a provider-owned Capability Market offerRef. */
export function admitMediaProviderBid(x){
  if(!obj(x)||x.type!=="MediaProviderBid"||x.version!==1)throw new TypeError("expected MediaProviderBid v1");
  const createdAt=instant(x.createdAt,"bid createdAt"),expiresAt=instant(x.expiresAt,"bid expiresAt");
  if(expiresAt<=createdAt)throw new TypeError("bid expiresAt must follow createdAt");
  if(!obj(x.consideration)||!COST.has(x.consideration.state))throw new TypeError("consideration state must be no-charge, quoted or unknown");
  if(x.consideration.state==="quoted")name(x.consideration.termsRef,"termsRef");
  if(x.consideration.state!=="quoted"&&x.consideration.termsRef!==undefined)throw new TypeError("unsettled or no-charge bid cannot carry priced termsRef");
  return Object.freeze({
    type:"MediaProviderBid",version:1,id:name(x.id,"bid id"),provider:name(x.provider,"provider actor"),
    offerRef:name(x.offerRef,"external provider offerRef"),mediaNeed:name(x.mediaNeed,"MediaNeed"),
    purpose:name(x.purpose,"purpose"),capability:name(x.capability,"capability"),
    quantity:amount(x.quantity,"bid quantity"),createdAt,expiresAt,
    consideration:Object.freeze({...x.consideration}),deliverable:name(x.deliverable,"deliverable contract")
  });
}

/** Only a consumer can issue an award, separately from a provider offer. */
export function admitMediaCustomerAward(x){
  if(!obj(x)||x.type!=="MediaCustomerAward"||x.version!==1)throw new TypeError("expected MediaCustomerAward v1");
  return Object.freeze({
    type:"MediaCustomerAward",version:1,bid:name(x.bid,"selected bid"),
    mediaNeed:name(x.mediaNeed,"MediaNeed"),purpose:name(x.purpose,"purpose"),
    customer:name(x.customer,"customer"),provider:name(x.provider,"provider"),
    quantity:amount(x.quantity,"award quantity"),decidedAt:instant(x.decidedAt,"award decidedAt"),
    decisionRef:name(x.decisionRef,"customer decision evidence"),
    offerWitnessRef:name(x.offerWitnessRef,"independently checked provider offer"),
    ...(x.termsAcceptanceRef===undefined?{}:{termsAcceptanceRef:name(x.termsAcceptanceRef,"terms acceptance")})
  });
}

/**
 * Hoare precondition for {P} award-and-hold {Q}:
 * P: admissible read-back frontier; unreserved demand; exact current bid;
 * customer decision; witnessed offer; known, accepted consideration.
 * Q, IF an independent reservation write later succeeds: a held allocation.
 * Neither an eligible evaluation nor a hold is editorial acceptance/publication.
 */
export function evaluateMediaAward({inbox,bid:rawBid,award:rawAward,now=new Date()}={}){
  const bid=admitMediaProviderBid(rawBid),award=admitMediaCustomerAward(rawAward);
  const at=now instanceof Date?now:new Date(now);
  if(!Number.isFinite(at.getTime()))throw new TypeError("now must be an instant");
  if(!obj(inbox)||!Array.isArray(inbox.needs)||!Array.isArray(inbox.frontier)||!Array.isArray(inbox.allocations))
    return Object.freeze({eligible:false,reasons:Object.freeze(["demand-inbox-not-observed"]),bid,award});
  const reasons=[];
  const need=inbox.needs.find(n=>n.id===bid.mediaNeed);
  const art=need?.artifacts?.find(a=>a.purpose===bid.purpose);
  const frontier=inbox.frontier.find(f=>f.need===bid.mediaNeed&&f.purpose===bid.purpose);
  if(!need||!art||!frontier)reasons.push("need-or-purpose-not-in-observed-frontier");
  if(award.bid!==bid.id||award.mediaNeed!==bid.mediaNeed||award.purpose!==bid.purpose||award.provider!==bid.provider)reasons.push("award-bid-binding-mismatch");
  if(need&&award.customer!==need.consumer)reasons.push("award-not-from-consuming-enterprise");
  if(art&&bid.capability!==art.capability)reasons.push("bid-capability-mismatch");
  if(frontier&&frontier.state!=="admissible")reasons.push("frontier-"+frontier.state);
  if(frontier&&award.quantity>frontier.wanted)reasons.push("quantity-exceeds-unreserved-demand");
  if(award.quantity>bid.quantity)reasons.push("quantity-exceeds-bid");
  if(Date.parse(bid.expiresAt)<=at.getTime())reasons.push("bid-expired");
  if(Date.parse(bid.createdAt)>Date.parse(award.decidedAt)||Date.parse(award.decidedAt)>at.getTime())reasons.push("award-time-invalid");
  if(Date.parse(award.decidedAt)>=Date.parse(bid.expiresAt))reasons.push("award-after-bid-expiration");
  if(bid.consideration.state==="unknown")reasons.push("consideration-unknown");
  if(bid.consideration.state==="quoted"&&award.termsAcceptanceRef!==bid.consideration.termsRef)reasons.push("terms-not-accepted-exactly");
  if(bid.consideration.state==="no-charge"&&award.termsAcceptanceRef!==undefined)reasons.push("unrequested-terms-acceptance");
  if(inbox.allocations.some(a=>a.bid===bid.id&&!["released","refused"].includes(a.state)))reasons.push("bid-already-reserved-or-fulfilled");
  return Object.freeze({eligible:reasons.length===0,reasons:Object.freeze(reasons),bid,award,
    precondition:"receiver readiness + unreserved MediaNeed + exact provider bid + customer award + known consideration",
    postcondition:"provider-bound held allocation, never automatic acceptance or publication"});
}

/**
 * Pure Hoare preflight, never an allocation effect. The ACTUAL reservation
 * owner must authenticate the customer and offer, and compare-and-swap the
 * authoritative MediaNeed/allocation revision while writing the held event.
 *
 * This function exists for multiple independent providers to prepare bids
 * without misrepresenting stale read-then-write sequences as atomic claims.
 */
export function prepareMediaAwardReservation({inbox,bid,award,now=new Date()}={}){
  const pre=evaluateMediaAward({inbox,bid,award,now});
  if(!pre.eligible)return Object.freeze({
    status:"REFUSED_PRECONDITION",eligible:false,reasons:pre.reasons
  });
  const item=inbox.frontier.find(row=>row.need===pre.bid.mediaNeed&&row.purpose===pre.bid.purpose);
  const claim=Object.freeze({
    type:"MediaSealedReservationRequest",version:1,
    mediaNeed:pre.bid.mediaNeed,purpose:pre.bid.purpose,capability:pre.bid.capability,
    provider:pre.bid.provider,customer:pre.award.customer,
    bid:pre.bid.id,offerRef:pre.bid.offerRef,offerWitnessRef:pre.award.offerWitnessRef,
    customerDecisionRef:pre.award.decisionRef,count:pre.award.quantity,
    observedAt:inbox.observedAt??null,
    observedUnreserved:item.wanted,
    ...(pre.award.termsAcceptanceRef===undefined?{}:{termsAcceptanceRef:pre.award.termsAcceptanceRef})
  });
  return Object.freeze({
    status:"PREPARED_NOT_RESERVED",eligible:true,claim,
    requiredExternalWitnesses:Object.freeze([
      "authenticated-consumer-decision","independently-verified-provider-offer",
      "sealed-compare-and-swap-against-current-demand-and-allocation-state",
      "authoritative-held-allocation-readback"
    ]),
    guarantee:"No allocation or consumer acceptance was written by this pure function."
  });
}
