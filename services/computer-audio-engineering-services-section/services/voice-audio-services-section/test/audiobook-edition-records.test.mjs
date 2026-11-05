import assert from "node:assert/strict";
import test from "node:test";
import { audiobookEditionSpecification, audiobookMasteringSpecification, describeAudiobookEditionSource, wordErrorRate } from "../src/audiobook-edition.mjs";

const narrationLayer = { type: "SoundScoreNarrationLayer", version: 1, slug: "fixture", title: "Fixture", author: "Writer", digest: `ni:///sha-256;${"A".repeat(43)}`, chapters: [] };
const source = { narrationLayer, storyBible: { type: "StoryBible", version: 1 }, voiceSettings: {}, synthesizer: { provenanceDigest: `ni:///sha-256;${"B".repeat(43)}` } };

test("voice audio constructs deterministic edition records without effects", () => {
  assert.deepEqual(describeAudiobookEditionSource(source), describeAudiobookEditionSource(source));
  assert.equal(audiobookEditionSpecification(source).type, "ArtifactFabricationSpecificationCandidate");
  assert.equal(audiobookMasteringSpecification.sampleRate, 44100);
  assert.equal(wordErrorRate("one two", "one too"), 0.5);
});
