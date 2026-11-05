/** Pure audiobook edition records and mastering policy. Effects live in systems publishing. */
import { createHash } from "node:crypto";

const ni = (bytes) => `ni:///sha-256;${createHash("sha256").update(bytes).digest("base64url")}`;
const semanticId = (value) => ni(Buffer.from(JSON.stringify(value)));

export const audiobookMasteringSpecification = Object.freeze({
  type: "AudiobookMasteringSpecification",
  version: 1,
  id: "audiobook-master-v1",
  sampleRate: 44100,
  channels: 1,
  chapterMp3Bitrate: 192000,
  rmsDb: Object.freeze({ minimum: -23, maximum: -18 }),
  peakDbMaximum: -3,
  noiseFloorDbMaximum: -60,
});

export function describeAudiobookEditionSource({ narrationLayer, narrationScript, storyBible, voiceSettings, synthesizer, soundScore }) {
  const layer = narrationLayer ?? narrationScript;
  if (layer?.type !== "SoundScoreNarrationLayer" || storyBible?.type !== "StoryBible") throw new TypeError("an audiobook source needs a sound-score narration layer and StoryBible");
  if (!synthesizer?.provenanceDigest?.startsWith("ni:///sha-256;")) throw new TypeError("synthesizer.provenanceDigest must be an ni SHA-256 URI");
  if (soundScore && (soundScore.type !== "AdmittedSoundScore" || soundScore.score?.[1]?.source?.digest !== layer.digest)) throw new TypeError("sound score must derive from this narration layer");
  const bindings = Object.freeze({ narrationLayer: layer.digest, ...(soundScore ? { soundScore: soundScore.digest } : {}), storyBible: semanticId(storyBible), voiceSettings: semanticId(voiceSettings ?? {}), synthesizerProvenance: synthesizer.provenanceDigest, mastering: semanticId(audiobookMasteringSpecification) });
  return Object.freeze({ type: "AudiobookEditionSourceDescription", version: 1, bindings, editionInputDigest: semanticId(bindings) });
}

/** Construct the pure candidate; the systems renderer admits its realization. */
export function audiobookEditionSpecification(source, { requestDigest = (source.narrationLayer ?? source.narrationScript).digest } = {}) {
  const layer = source.narrationLayer ?? source.narrationScript;
  const described = describeAudiobookEditionSource(source);
  const span = { type: "ArtifactFabricationSourceSpan", startLine: 1, endLine: 1 };
  const artifact = (value) => ({ type: value, version: 1 });
  return Object.freeze({
    ...artifact("ArtifactFabricationSpecificationCandidate"),
    source: { ...artifact("ArtifactFabricationSource"), identity: { type: "ArtifactFabricationSourceIdentity", id: layer.slug }, provenance: { type: "ArtifactFabricationSourceProvenance", locator: requestDigest, digest: `sha256:${Buffer.from(requestDigest.split(";").at(-1), "base64url").toString("hex")}`, sourceSpan: span } },
    artifact: { ...artifact("FabricatedArtifactIdentity"), id: `${layer.slug}-audiobook-edition`, kind: "audiobook-edition" },
    requirements: [{ ...artifact("ArtifactFabricationRequirement"), id: "edition", statement: `${layer.title} as chapter MP3 files and a chapter-marked M4B.`, sourceSpan: span }],
    prohibitions: [], openQuestions: [],
    constraints: [
      { ...artifact("ArtifactFabricationConstraint"), id: "source-binding", kind: "law", authority: "SHA-256", revision: "FIPS 180-4", locator: "fips-180-4", applicability: "audiobook edition source", statement: "The input digest binds the narration layer, story bible, voice settings, synthesizer provenance, and mastering specification.", sourceSpan: span },
      { ...artifact("ArtifactFabricationConstraint"), id: "audio-master", kind: "standard", authority: "561 Group", revision: audiobookMasteringSpecification.id, locator: "voice-audio-services-section", applicability: "audio projections", statement: "44.1 kHz mono; RMS -23 to -18 dB; peaks at or below -3 dB; noise floor at or below -60 dB; 192 kbps CBR chapter MP3 files.", sourceSpan: span },
    ],
    projections: ["chapter-mp3", "m4b"].map((id) => ({ ...artifact("ArtifactFabricationProjection"), id, target: id, configuration: { profile: audiobookMasteringSpecification.id, editionInputDigest: described.editionInputDigest, bindings: described.bindings }, sourceSpan: span })),
    acceptanceObligations: [{ ...artifact("ArtifactFabricationAcceptanceObligation"), id: "independent-listening-proof", kind: "review", statement: "A listener other than the producing agent hears the exact fabricated files; automated transcription findings are a first pass and do not close this obligation.", sourceSpan: span }],
    traceability: [{ ...artifact("ArtifactFabricationTrace"), requirementId: "edition", constraintIds: ["source-binding", "audio-master"], projectionIds: ["chapter-mp3", "m4b"], acceptanceObligationIds: ["independent-listening-proof"] }],
  });
}

const words = (text) => String(text).toLocaleLowerCase("en-US").replace(/^\[\d\d:\d\d:\d\d\]\s*/gmu, "").match(/[\p{L}\p{N}']+/gu) ?? [];
export function wordErrorRate(reference, hypothesis) {
  const a = words(reference), b = words(hypothesis);
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) { let diagonal = row[0]; row[0] = i; for (let j = 1; j <= b.length; j++) { const above = row[j]; row[j] = Math.min(row[j] + 1, row[j - 1] + 1, diagonal + (a[i - 1] === b[j - 1] ? 0 : 1)); diagonal = above; } }
  return a.length ? row[b.length] / a.length : (b.length ? 1 : 0);
}

export function acceptAudiobookEdition(fabrication, proof, { now = new Date().toISOString() } = {}) {
  const refuse = (code, message) => Object.freeze({ type: "AudiobookEditionAcceptance", version: 1, status: "refused", code, message });
  if (fabrication?.type !== "AudiobookEditionFabricationResult" || fabrication.status !== "fabricated-awaiting-acceptance") return refuse("NOT_AWAITING_ACCEPTANCE", "Only a fabricated audiobook can be accepted.");
  if (proof?.type !== "AudiobookEditionProof" || proof.version !== 1) return refuse("NOT_A_PROOF", "An AudiobookEditionProof is required.");
  if (proof.automated) return refuse("INDEPENDENT_LISTENER_REQUIRED", "Automated transcription is a first pass; an independent listener must submit the accepting proof.");
  if (!proof.proofer || proof.proofer === proof.producer) return refuse("PROOFER_IS_PRODUCER", "The listener must be independent of the producing agent.");
  const expected = { chapterMp3s: fabrication.artifacts.chapterMp3s.map(({ sha256 }) => sha256), m4b: fabrication.artifacts.m4b.sha256 };
  if (proof.editionInputDigest !== fabrication.specification.projections[0].configuration.editionInputDigest || JSON.stringify(proof.artifacts) !== JSON.stringify(expected)) return refuse("PROOF_OF_OTHER_EDITION", "The proof does not name these input and artifact digests.");
  const severities = new Set(["error", "correction", "note"]), resolutions = new Set(["fixed", "declined", "open"]);
  if (!proof.method || !proof.provedAt || !Array.isArray(proof.findings) || proof.findings.some((finding) => !severities.has(finding?.severity) || !resolutions.has(finding?.resolution))) return refuse("MALFORMED_PROOF", "The proof needs a method, date, and findings with admitted severities and resolutions.");
  const blocking = proof.findings.filter((finding) => finding.severity !== "note" && (finding.resolution === "open" || (finding.resolution === "fixed" && !finding.fix) || (finding.resolution === "declined" && !finding.reason)));
  if (blocking.length) return refuse("FINDINGS_UNRESOLVED", "Every listening error or correction must be fixed with a description or declined with a reason.");
  return Object.freeze({ type: "AudiobookEditionAcceptance", version: 1, status: "accepted", editionInputDigest: proof.editionInputDigest, artifacts: fabrication.artifacts, closedObligationIds: ["independent-listening-proof"], pendingAcceptanceObligationIds: [], proof: { digest: semanticId(proof), proofer: proof.proofer, provedAt: proof.provedAt, method: proof.method, automatedFirstPass: proof.automatedFirstPass ?? null }, acceptedAt: now });
}
