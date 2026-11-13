import { createHash } from "node:crypto";
import { canonicalJson } from "@red-cup-engineering/json-engineering-services-section/canonical-json";
import { createSemanticRecordJournal } from "@red-cup-engineering/semiotic-eavt-services-section/record-semantic-record";
import { admitMediaNeed, mediaDemandFrontier, planMediaAllowance } from "./media-demand-market.mjs";
import { normalizeReadinessEvidence, aggregateReadinessEvidence, scopeMediaReadinessEvidence } from "./media-readiness-evidence.mjs";
import {measureMediaDemandConservation,mediaArtifactKey} from "./media-demand-conservation.mjs";
import {admitAcceptedMediaAsset} from "./media-accepted-asset-contract.mjs";

export const MEDIA_NEED_OBJECT_KIND = "media-need";
export const MEDIA_NEED_CATEGORY = "need";
export const MEDIA_READINESS_OBJECT_KIND = "media-readiness";
export const MEDIA_READINESS_CATEGORY = "readiness";
export const MEDIA_ALLOCATION_OBJECT_KIND = "media-allocation-state";
export const MEDIA_ALLOCATION_CATEGORY = "allocation";
export const MEDIA_ARTIFACT_REVIEW_OBJECT_KIND = "media-artifact-review";
export const MEDIA_ARTIFACT_REVIEW_CATEGORY = "review";

const ALLOCATION_STATES = new Set(["held", "generated", "delivered", "public-use", "released", "refused"]);
const LIVE_ALLOCATION_STATES = new Set(["held", "generated", "delivered"]);
const TERMINAL_ALLOCATION_STATES = new Set(["public-use", "released", "refused"]);
const NEXT = Object.freeze({
  held: new Set(["generated", "released", "refused"]),
  generated: new Set(["delivered", "released", "refused"]),
  delivered: new Set(["public-use", "released", "refused"]),
  "public-use": new Set(),
  released: new Set(),
  refused: new Set(),
});

const text = (value, label) => {
  if (typeof value !== "string" || !value.trim()) throw new TypeError(`${label} must be nonempty text`);
  return value.trim();
};
const instant = (value, label) => {
  const at = Date.parse(value);
  if (!Number.isFinite(at)) throw new TypeError(`${label} must be an instant`);
  return new Date(at).toISOString();
};
const contentId = (value) => `ni:///sha-256;${createHash("sha256").update(canonicalJson(value)).digest("base64url")}`;
const journal = (root, objectKind) => createSemanticRecordJournal({ root, objectKind });

export function createMediaNeed(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError("media need must be an object");
  const { id: supplied, ...body } = value;
  return admitMediaNeed({ ...body, id: supplied ?? contentId(body) });
}

export function recordMediaNeed({ root, need, origin } = {}) {
  const record = createMediaNeed(need);
  const receipt = journal(root, MEDIA_NEED_OBJECT_KIND).record({
    category: MEDIA_NEED_CATEGORY,
    record,
    recordedAt: record.openedAt,
    told: { for: true, against: false },
    origin: origin ?? `media-consumer:${record.consumer}`,
  });
  return Object.freeze({ ...receipt, mediaNeed: record.id, need: record });
}

export function recordMediaReadiness({
  root, mediaNeed, scope = "receiver", purpose, ready, evidence, authority, basis, at, destination, origin,
} = {}) {
  const need = text(mediaNeed, "mediaNeed");
  if (!["receiver", "artifact"].includes(scope)) throw new TypeError("scope must be receiver or artifact");
  if (scope === "artifact") purpose = text(purpose, "artifact purpose");
  else if (purpose !== undefined) throw new TypeError("receiver readiness does not name an artifact purpose");
  const told = normalizeReadinessEvidence({ ready, evidence });
  const projectedReady = told.for && !told.against;
  const recordedAt = instant(at, "readiness at");
  const record = Object.freeze({
    type: "MediaReadiness", version: 1, mediaNeed: need, scope,
    ...(scope === "artifact" ? { purpose } : {}),
    ready: projectedReady,
    evidence: told,
    authority: text(authority, "readiness authority"),
    basis: text(basis, "readiness basis"),
    recordedAt,
    ...(destination === undefined ? {} : { destination: text(destination, "readiness destination") }),
  });
  return journal(root, MEDIA_READINESS_OBJECT_KIND).record({
    category: MEDIA_READINESS_CATEGORY,
    record,
    recordedAt,
    told,
    origin: origin ?? record.authority,
  });
}

function allocationRows(root) {
  return journal(root, MEDIA_ALLOCATION_OBJECT_KIND).query({ category: MEDIA_ALLOCATION_CATEGORY });
}

function latestAllocationStates(root) {
  const latest = new Map();
  for (const row of allocationRows(root)) {
    const prior=latest.get(row.record.allocation);
    if(!prior || prior.recordedAt.localeCompare(row.record.recordedAt)<=0) latest.set(row.record.allocation,row.record);
  }
  return latest;
}

export function recordMediaAllocationState({
  root, allocation, mediaNeed, purpose, count = 1, state, provider, at, receipt, bid, awardRef, origin,
} = {}) {
  const id = text(allocation, "allocation");
  const need = text(mediaNeed, "mediaNeed");
  const artifactPurpose = text(purpose, "purpose");
  if (!Number.isSafeInteger(count) || count < 1) throw new TypeError("allocation count must be a positive integer");
  if (!ALLOCATION_STATES.has(state)) throw new TypeError("allocation state is not admitted");
  const recordedAt = instant(at, "allocation at");
  const current = latestAllocationStates(root).get(id);
  // Optional provider/customer contract references travel with the existing
  // allocation lifecycle, never as a parallel allocation or a self-award.
  if ((bid === undefined) !== (awardRef === undefined)) throw new Error("bid and awardRef must be supplied together");
  if (current !== undefined && bid !== undefined &&
      (current.bid !== bid || current.awardRef !== awardRef)) {
    throw new Error("allocation bid/award binding cannot change");
  }
  if (current !== undefined && current.bid === undefined && bid !== undefined) {
    throw new Error("cannot retrofit a bid to an existing allocation");
  }
  const awarded = current?.bid === undefined
    ? (bid === undefined ? {} : { bid: text(bid, "bid"), awardRef: text(awardRef, "awardRef") })
    : { bid: current.bid, awardRef: current.awardRef };
  if (current === undefined && state !== "held") throw new Error("a media allocation starts held");
  if (current !== undefined) {
    if (current.mediaNeed !== need || current.purpose !== artifactPurpose || current.count !== count || current.provider !== provider) {
      throw new Error("media allocation identity cannot change across transitions");
    }
    if (TERMINAL_ALLOCATION_STATES.has(current.state)) throw new Error(`media allocation ${id} is terminal at ${current.state}`);
    if (!NEXT[current.state].has(state)) throw new Error(`media allocation cannot move ${current.state} -> ${state}`);
    if (Date.parse(recordedAt) < Date.parse(current.recordedAt)) throw new Error("media allocation transition cannot move backward in time");
  }
  const record = Object.freeze({
    type: "MediaAllocationState", version: 1, allocation: id, mediaNeed: need,
    purpose: artifactPurpose, count, state, provider: text(provider, "provider"), recordedAt,
    ...awarded,
    ...(receipt === undefined ? {} : { receipt: text(receipt, "receipt") }),
  });
  return journal(root, MEDIA_ALLOCATION_OBJECT_KIND).record({
    category: MEDIA_ALLOCATION_CATEGORY,
    record,
    recordedAt,
    told: { for: true, against: false },
    origin: origin ?? record.provider,
  });
}


export function readMediaAllocationStates({ root, state } = {}) {
  const rows = [...latestAllocationStates(root).values()];
  return Object.freeze((state === undefined ? rows : rows.filter((row) => row.state === state))
    .sort((a, b) => a.recordedAt.localeCompare(b.recordedAt) || a.allocation.localeCompare(b.allocation)));
}

export function recordMediaArtifactReview({
  root, allocation, completionId, accepted, authority, basis, at, asset, distribution, origin,
} = {}) {
  const id = text(allocation, "allocation");
  const current = latestAllocationStates(root).get(id);
  if (!current || !["generated", "delivered"].includes(current.state)) {
    throw new Error("artifact review requires a generated or delivered media allocation");
  }
  if (typeof accepted !== "boolean") throw new TypeError("accepted must be boolean");
  const recordedAt = instant(at, "review at");
  if (Date.parse(recordedAt) < Date.parse(current.recordedAt)) throw new Error("artifact review cannot predate its current allocation state");
  let acceptedAsset, release;
  if(accepted){
    const admitted=admitAcceptedMediaAsset({asset,distribution});
    acceptedAsset=admitted.asset;
    release=admitted.distribution;
  }
  const record = Object.freeze({
    type: "MediaArtifactReview", version: 1, allocation: id,
    mediaNeed: current.mediaNeed, purpose: current.purpose, provider: current.provider,
    completionId: text(completionId, "completionId"), accepted,
    authority: text(authority, "review authority"), basis: text(basis, "review basis"), recordedAt,
    ...(accepted ? { asset: acceptedAsset, ...(release ? { distribution: release } : {}) } : {}),
  });
  return journal(root, MEDIA_ARTIFACT_REVIEW_OBJECT_KIND).record({
    category: MEDIA_ARTIFACT_REVIEW_CATEGORY,
    record, recordedAt, told: { for: accepted, against: !accepted }, origin: origin ?? record.authority,
  });
}

export function readMediaArtifactReviews({ root, accepted } = {}) {
  const latest = new Map();
  for (const row of journal(root, MEDIA_ARTIFACT_REVIEW_OBJECT_KIND).query({ category: MEDIA_ARTIFACT_REVIEW_CATEGORY })) {
    const prior=latest.get(row.record.allocation);
    if(!prior || prior.recordedAt.localeCompare(row.record.recordedAt)<=0) latest.set(row.record.allocation,row.record);
  }
  const rows = [...latest.values()].filter((row) => accepted === undefined || row.accepted === accepted);
  return Object.freeze(rows.sort((a, b) => a.recordedAt.localeCompare(b.recordedAt) || a.allocation.localeCompare(b.allocation)));
}

function latestReadiness(root) {
  return aggregateReadinessEvidence(journal(root, MEDIA_READINESS_OBJECT_KIND)
    .query({ category: MEDIA_READINESS_CATEGORY }).map(row => row.record));
}

export function readMediaDemandInbox({ root, consumer, now = new Date() } = {}) {
  const needsById = new Map();
  for (const row of journal(root, MEDIA_NEED_OBJECT_KIND).query({ category: MEDIA_NEED_CATEGORY })) {
    const need = admitMediaNeed(row.record);
    if (consumer === undefined || need.consumer === consumer) needsById.set(need.id, need);
  }
  const { receiver, artifact } = scopeMediaReadinessEvidence(latestReadiness(root), [...needsById.values()]);
  const allocations = [...latestAllocationStates(root).values()];
  // A scoped consumer may not learn unrelated allocations through this read.
  const visibleAllocations=consumer===undefined?allocations:allocations.filter(state=>needsById.has(state.mediaNeed));
  const conservation=measureMediaDemandConservation({
    needs:[...needsById.values()],allocations:visibleAllocations
  });
  const remainingByKey=new Map(conservation.items.map(row=>[
    mediaArtifactKey(row.mediaNeed,row.purpose),row.remaining
  ]));
  const needs=[...needsById.values()].map(need=>Object.freeze({
    ...need,
    artifacts:Object.freeze(need.artifacts.map(item=>Object.freeze({
      ...item,wanted:remainingByKey.get(mediaArtifactKey(need.id,item.purpose))??0
    })))
  }));
  const receivers = Object.fromEntries([...receiver].map(([key, value]) => [key, value.ready]));
  const readiness = Object.fromEntries([...artifact].map(([key, value]) => [key, value.ready]));
  const frontier = mediaDemandFrontier(needs, { receivers, readiness, now });
  return Object.freeze({
    type: "MediaDemandInbox", observedAt: new Date(now).toISOString(),
    needs: Object.freeze(needs), frontier,
    readiness: Object.freeze({
      receivers, artifacts: readiness,
      evidence: Object.freeze({
        receivers: Object.fromEntries([...receiver].map(([key, value]) => [key, value.evidence])),
        artifacts: Object.fromEntries([...artifact].map(([key, value]) => [key, value.evidence])),
      }),
    }),
    allocations: Object.freeze(visibleAllocations),
    conservation,
    counts: Object.freeze({
      needs: needs.length,
      admissibleArtifacts: frontier.filter((row) => row.state === "admissible" && row.wanted > 0).length,
      blockedArtifacts: frontier.filter((row) => row.state !== "admissible" && row.wanted > 0).length,
      liveAllocations: visibleAllocations.filter((row) => LIVE_ALLOCATION_STATES.has(row.state)).length,
      fulfilledAllocations: visibleAllocations.filter((row) => row.state === "public-use").length,
      oversubscribedArtifacts: conservation.oversubscribed.length,
      orphanAllocations: conservation.orphanAllocations.length,
      invalidAllocationStates: conservation.invalidAllocationStates.length,
    }),
  });
}

export function planMediaDemandInbox({ root, available, costs, served, weights, allowProbe = false, now = new Date(), consumer } = {}) {
  const inbox = readMediaDemandInbox({ root, consumer, now });
  const plan = planMediaAllowance({
    available, costs, needs: inbox.needs,
    receivers: inbox.readiness.receivers, readiness: inbox.readiness.artifacts,
    served, weights, allowProbe, now,
  });
  return Object.freeze({ ...plan, inbox: Object.freeze({ counts: inbox.counts, observedAt: inbox.observedAt }) });
}
