/** Request-specific bids inhabit the EXISTING semantic-record substrate. */
import {canonicalJson} from "@red-cup-engineering/json-engineering-services-section/canonical-json";
import {createSemanticRecordJournal} from "@red-cup-engineering/semiotic-eavt-services-section/record-semantic-record";
import {readMediaDemandInbox} from "./media-demand-journal.mjs";
import {admitMediaProviderBid,prepareMediaAwardReservation} from "./media-provider-bid-contract.mjs";

export const MEDIA_BID_OBJECT_KIND="media-provider-bid";
const bids=root=>createSemanticRecordJournal({root,objectKind:MEDIA_BID_OBJECT_KIND});

export function readMediaProviderBids({root,mediaNeed,purpose}={}){
  const found=bids(root).query({category:"bid"}).map(row=>admitMediaProviderBid(row.record))
    .filter(row=>(mediaNeed===undefined||row.mediaNeed===mediaNeed)&&(purpose===undefined||row.purpose===purpose));
  const byId=new Map();
  for(const bid of found){
    const prior=byId.get(bid.id);
    if(prior&&canonicalJson(prior)!==canonicalJson(bid))throw new Error("conflicting immutable provider bid id: "+bid.id);
    byId.set(bid.id,bid);
  }
  return Object.freeze([...byId.values()].sort((a,b)=>a.createdAt.localeCompare(b.createdAt)||a.id.localeCompare(b.id)));
}

/** Record one provider's work-specific offer, not an award or execution authority. */
export function recordMediaProviderBid({root,bid,origin}={}){
  const value=admitMediaProviderBid(bid);
  const inbox=readMediaDemandInbox({root,now:new Date(value.createdAt)});
  const need=inbox.needs.find(n=>n.id===value.mediaNeed);
  const item=need?.artifacts.find(a=>a.purpose===value.purpose);
  if(!item||item.capability!==value.capability)throw new Error("bid does not bind an existing exact MediaNeed artifact");
  const conflict=readMediaProviderBids({root}).find(b=>b.id===value.id);
  if(conflict&&canonicalJson(conflict)!==canonicalJson(value))throw new Error("provider bid id already used for different terms");
  const receipt=bids(root).record({
    category:"bid",record:value,recordedAt:value.createdAt,
    told:{for:true,against:false},origin:origin??value.provider
  });
  return Object.freeze({...receipt,bid:value.id,status:"RECORDED_UNAWARDED"});
}

/**
 * Fail closed until the independently authenticated and sealed receiving
 * service is available. Booleans supplied by a caller are NOT provider/customer
 * authorizations; neither a journal read nor a follow-up append is an atomic
 * compare-and-swap across competing micro-enterprises.
 *
 * A consumer-controlled host can use prepareMediaAwardReservation to obtain a
 * pure exact contract, then invoke its own sealed CAS and read back the receipt.
 * This package must not append a misleading "held" event first.
 */
export function recordAwardedMediaBid({root,award,now=new Date()}={}){
  if(!root||typeof root!=="string")
    return Object.freeze({status:"REFUSED",reasons:["authenticated-journal-root-required"]});
  const bidId=award?.bid;
  const bid=readMediaProviderBids({root}).find(row=>row.id===bidId);
  if(!bid)
    return Object.freeze({status:"REFUSED",reasons:["bid-not-in-shared-journal"]});
  const pre=prepareMediaAwardReservation({
    inbox:readMediaDemandInbox({root,now}),bid,award,now
  });
  return Object.freeze({
    status:"REFUSED",
    reasons:Object.freeze(pre.eligible?["sealed-reservation-and-independent-actor-verification-required"]:pre.reasons),
    ...(pre.eligible?{claim:pre.claim}:{}),
    reservationWritten:false
  });
}
