// One source-owned boundary between a provider's authenticated createRecord
// acknowledgment and evidence that the public app-view actually serves it.
// No social effects, credentials, engagement collection, or invented accounts.
const TID = /^[234567abcdefghij][234567abcdefghijklmnopqrstuvwxyz]{12}$/u;
const hold = reason => Object.freeze({ ok: false, reason });

export function qualifyMediaSocialDistributor(provider) {
  if (provider?.BLUESKY_DETERMINISTIC_RKEY !== true
    || typeof provider.postBluesky !== 'function') {
    return hold('retry-safe-bluesky-media-upgrade-not-released');
  }
  if (typeof provider.observeBlueskyPost !== 'function') {
    return hold('public-bluesky-readback-adapter-not-released');
  }
  return Object.freeze({ ok: true });
}

/** The returning provider observation must bind the authenticated account DID,
 * original deterministic TID, strong CID and public-record URI together.
 * A successful createRecord status or an unrelated URI is not public use. */
export function qualifyMediaSocialReadback({ receipt, observation, rkey } = {}) {
  if (typeof rkey !== 'string' || !TID.test(rkey)) return hold('invalid-distribution-intent-rkey');
  const did = receipt?.did;
  const uri = receipt?.uri;
  const cid = receipt?.cid;
  if (receipt?.status !== 'ok' || typeof did !== 'string' || !did.startsWith('did:')
    || typeof cid !== 'string' || !cid.trim()
    || uri !== 'at://' + did + '/app.bsky.feed.post/' + rkey) {
    return hold('authenticated-strong-provider-receipt-required');
  }
  if (observation?.status !== 'verified'
    || observation.uri !== uri || observation.cid !== cid || observation.did !== did
    || observation.source !== 'bluesky-appview-public-getPostThread') {
    return hold('independent-public-readback-not-received');
  }
  return Object.freeze({ ok: true, uri, cid, did, source: observation.source });
}
