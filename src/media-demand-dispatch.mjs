import { createHash } from "node:crypto";
import { canonicalJson } from "@red-cup-engineering/json-engineering-services-section/canonical-json";
import * as googleFlow from "@red-cup-engineering/google-flow-computer-inference-system-engineering-services-section/flow-generate";
import { planMediaDemandInbox, readMediaDemandInbox, recordMediaAllocationState } from "./media-demand-journal.mjs";

const allocationId = (value) => `ni:///sha-256;${createHash("sha256").update(canonicalJson(value)).digest("base64url")}`;

function generationOf(need, purpose) {
  const artifact = need.artifacts.find((item) => item.purpose === purpose);
  if (!artifact) throw new Error(`MediaNeed ${need.id} has no artifact ${purpose}`);
  const prompt = artifact.generation?.prompt;
  if (typeof prompt !== "string" || !prompt.trim()) return null;
  if (typeof artifact.destination !== "string" || !artifact.destination.trim()) return null;
  return { artifact, prompt: prompt.trim(), destination: artifact.destination.trim() };
}

function attemptNumber(inbox, mediaNeed, purpose, provider) {
  return 1 + inbox.allocations.filter((row) =>
    row.mediaNeed === mediaNeed && row.purpose === purpose && row.provider === provider).length;
}

function supportedAspect(artifact, offer) {
  const supported = new Set(offer.supportedAspects ?? []);
  for (const aspect of artifact.preferredAspects ?? []) if (supported.has(aspect)) return aspect;
  return offer.supportedAspects?.[0] ?? "1:1";
}

/**
 * Dispatch only receiver-ready, zero-credit image demand into Flow.
 *
 * No paid/unknown-price work is dispatched here. A stable allocation identity is put on the Flow
 * order before the shared inbox records its hold. If the process dies after queueing but before
 * recording the hold, queueFlowOrderOnce sees the same allocation on retry and the inbox can heal.
 */
export async function dispatchFreeFlowMediaDemand({
  root,
  flow = googleFlow,
  now = new Date(),
  maxGenerations = 2,
} = {}) {
  if (!Number.isSafeInteger(maxGenerations) || maxGenerations < 1 || maxGenerations > 20) {
    throw new TypeError("maxGenerations must be an integer from 1 to 20");
  }
  if (typeof flow.flowMediaOffer !== "function" || typeof flow.queueFlowOrderOnce !== "function") {
    return Object.freeze({
      type: "MediaDemandDispatch",
      status: "blocked",
      reason: "google-flow-custody-upgrade-not-released",
      dispatched: Object.freeze([]),
    });
  }

  const offer = await flow.flowMediaOffer();
  const image = offer.capabilities?.["image-generation"];
  if (!image || image.units !== 0) {
    return Object.freeze({
      type: "MediaDemandDispatch",
      status: "complete",
      provider: offer.provider,
      reason: "no-current-zero-credit-image-offer",
      dispatched: Object.freeze([]),
    });
  }

  const inbox = readMediaDemandInbox({ root, now });
  const plan = planMediaDemandInbox({
    root,
    available: Number.isFinite(offer.balance) ? offer.balance : 0,
    costs: { "image-generation": 0 },
    allowProbe: false,
    now,
  });
  const needs = new Map(inbox.needs.map((need) => [need.id, need]));
  const dispatched = [], skipped = [];
  let slots = maxGenerations;

  for (const grant of plan.free) {
    if (slots <= 0) break;
    if (grant.capability !== "image-generation") continue;
    const need = needs.get(grant.mediaNeed);
    const generation = need ? generationOf(need, grant.purpose) : null;
    if (!need || !generation) {
      skipped.push({ mediaNeed: grant.mediaNeed, purpose: grant.purpose, reason: "consumer-generation-brief-or-destination-missing" });
      continue;
    }
    const units = Math.min(grant.draws, slots);
    const prior = attemptNumber(inbox, grant.mediaNeed, grant.purpose, offer.provider) - 1;
    for (let offset = 0; offset < units; offset += 1) {
      const attempt = prior + offset + 1;
      const allocation = allocationId({
        type: "MediaAllocation", mediaNeed: grant.mediaNeed, purpose: grant.purpose,
        provider: offer.provider, attempt, count: 1,
      });
      const line = {
        consumer: grant.consumer,
        mediaNeed: grant.mediaNeed,
        destination: generation.destination,
        allocation,
        purpose: grant.purpose,
        medium: "image",
        prompt: generation.prompt,
        model: image.model,
        aspect: supportedAspect(generation.artifact, image),
        count: 1,
      };
      const queued = flow.queueFlowOrderOnce([line], { name: `cmo-${grant.purpose}`, now });
      const present = queued.queued > 0 || queued.duplicates?.includes(allocation);
      if (!present) {
        skipped.push({ mediaNeed: grant.mediaNeed, purpose: grant.purpose, reason: "provider-did-not-queue-allocation" });
        continue;
      }
      recordMediaAllocationState({
        root, allocation, mediaNeed: grant.mediaNeed, purpose: grant.purpose, count: 1,
        state: "held", provider: offer.provider, at: now.toISOString(),
        receipt: queued.path ?? `provider-queue:${allocation}`,
        origin: "@causeway-services/public-media-services-section",
      });
      slots -= 1;
      dispatched.push(Object.freeze({
        allocation, mediaNeed: grant.mediaNeed, consumer: grant.consumer, purpose: grant.purpose,
        provider: offer.provider, model: image.model, aspect: line.aspect, count: 1, queue: queued.path,
        recoveredExistingQueue: queued.queued === 0,
      }));
      if (slots <= 0) break;
    }
  }
  return Object.freeze({
    type: "MediaDemandDispatch", status: "complete", observedAt: now.toISOString(), provider: offer.provider,
    offer, inbox: inbox.counts, dispatched: Object.freeze(dispatched), skipped: Object.freeze(skipped),
  });
}
