/**
 * A composed contextual instruction is not an independently attested effective
 * provider request. Quality observations are not consumer acceptance either.
 */
export function composeImageBrief(brief) {
  if (!brief || typeof brief !== 'object') throw new TypeError('brief required');
  for (const key of ['consumer','subject','medium','purpose','composition','palette','aspectRatio'])
    if (typeof brief[key] !== 'string' || !brief[key].trim()) throw new TypeError(`missing ${key}`);
  if (!/^(1:1|3:2|2:3|16:9|9:16)$/.test(brief.aspectRatio)) throw new TypeError('unsupported aspect ratio');
  if (brief.forbidden !== undefined && (!Array.isArray(brief.forbidden) || brief.forbidden.some(x => typeof x !== 'string' || !x.trim()))) throw new TypeError('invalid exclusions');
  if (brief.geometry !== undefined && (typeof brief.geometry !== 'string' || !brief.geometry.trim())) throw new TypeError('invalid geometry');
  return `Create exactly one ${brief.aspectRatio} image for ${brief.consumer}, for ${brief.purpose}. Depict ${brief.subject}. Art medium: ${brief.medium}. Composition: ${brief.composition}. Palette: ${brief.palette}. ${brief.geometry ? `Required geometry: ${brief.geometry}. ` : ''}${brief.forbidden?.length ? `Do not depict: ${brief.forbidden.join('; ')}.` : ''} No written words, invented logos, or documentary evidence. This is private and requires consumer review.`;
}

/**
 * Fail closed on known visual mismatches regardless of missing provider
 * attestation. No image becomes a candidate before all scoped checks have
 * been made against that exact generated file, not an earlier example.
 */
export function assessImageRequest({brief, effectiveRequestEvidence, generatedFileId, visualReview} = {}) {
  composeImageBrief(brief);
  const attested = effectiveRequestEvidence?.kind === 'provider-attested-effective-image-request' &&
    effectiveRequestEvidence?.issuer === 'image-provider' &&
    typeof effectiveRequestEvidence?.requestId === 'string' && effectiveRequestEvidence.requestId.length > 0 &&
    effectiveRequestEvidence.subject === brief.subject && effectiveRequestEvidence.medium === brief.medium;
  const request = attested ? 'VERIFIED' : 'UNVERIFIED';
  if (!generatedFileId) return Object.freeze({state:'NOT_GENERATED', request, consumerAccepted:false});
  // An old or unrelated visual review cannot qualify this image.
  const reviewIsCurrent = visualReview?.generatedFileId === generatedFileId;
  const review = reviewIsCurrent ? visualReview : undefined;
  const reasons = [];
  if (review?.subjectMatches === false) reasons.push('subject-mismatch');
  if (review?.mediumMatches === false) reasons.push('medium-mismatch');
  if (review?.compositionMatches === false) reasons.push('composition-mismatch');
  if (review?.geometryMatches === false && brief.geometry) reasons.push('geometry-mismatch');
  if (review?.exclusionsAbsent === false || (Array.isArray(review?.observedForbidden) && review.observedForbidden.length > 0))
    reasons.push('forbidden-content-observed');
  if (reasons.length > 0)
    return Object.freeze({state:'QA_REJECTED', request, consumerAccepted:false, reasons:Object.freeze(reasons)});
  if (!attested) return Object.freeze({state:'GENERATED_REQUEST_UNVERIFIED',request:'UNVERIFIED',consumerAccepted:false});
  if (review?.subjectMatches !== true || review?.mediumMatches !== true || review?.compositionMatches !== true ||
      review?.exclusionsAbsent !== true || (brief.geometry && review?.geometryMatches !== true))
    return Object.freeze({state:'QA_UNASSESSED',request:'VERIFIED',consumerAccepted:false});
  return Object.freeze({state:'QA_CANDIDATE',request:'VERIFIED',consumerAccepted:false});
}

const distinctTokens = value => new Set(String(value ?? '').toLowerCase().match(/[\p{L}\p{N}]+/gu)?.filter(x => !['a','an','the','and','or','with','for','of','to','in','on','by','art','image','illustration'].includes(x)) ?? []);
const overlap = (a,b) => {
  const left=distinctTokens(a), right=distinctTokens(b);
  return left.size && right.size ? [...left].filter(word=>right.has(word)).length / Math.min(left.size,right.size) : 0;
};
/** Caller-side guard, not provider attestation. It can only validate a caller's text and known history. */
export function preflightImageDispatch({brief,immediatelyPrecedingMessage,recentBriefs=[]}={}) {
  const instruction=composeImageBrief(brief);
  if (!Array.isArray(recentBriefs)) throw new TypeError('recent briefs must be an array');
  if (typeof immediatelyPrecedingMessage !== 'string' || immediatelyPrecedingMessage.trim() !== instruction)
    return Object.freeze({state:'BLOCKED_MISSING_EXACT_BRIEF',comparisonCount:0});
  const compared=recentBriefs.slice(-12);
  for (const previous of compared) {
    if (!previous || typeof previous !== 'object') continue;
    const sameConsumer = String(previous.consumer??'').toLowerCase() === brief.consumer.toLowerCase();
    const subject = overlap(previous.subject,brief.subject);
    const medium = overlap(previous.medium,brief.medium);
    const composition = overlap(previous.composition,brief.composition);
    if ((sameConsumer && subject>=0.6) || (subject>=0.6 && medium>=0.5) || (medium>=0.75 && composition>=0.7))
      return Object.freeze({state:'BLOCKED_NEAR_DUPLICATE',comparisonCount:compared.length});
  }
  return Object.freeze({state:'READY_FOR_IMAGE_TOOL',comparisonCount:compared.length,instruction});
}
