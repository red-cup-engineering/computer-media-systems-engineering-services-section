import assert from "node:assert/strict";
import test from "node:test";
import { admitAudioplayCast, admitSoundScore, createAudioplayProductionManifest } from "../src/audioplay-model.mjs";

const scoreValue = (line = "The lake answered.") => ["score", { type: "SoundScore", version: 1, id: "fixture", title: "Fixture Play", language: "en-US", seed: 561 }, ["scene", "ice", ["par",
  ["bed", { id: "wind", generator: "resonator/game", seed: "wind-561", durationSeconds: 4, params: { mood: "winter" } }],
  ["duck", { under: "speech", reductionDb: -9, attackSeconds: 0.08, releaseSeconds: 0.3 }, ["seq",
    ["narrate", { id: "line-1", speakerId: "june", text: line, anchor: { chapter: "01.md", paragraph: 1, sentence: 0 }, delivery: { style: "dry" } }],
    ["silence", { durationSeconds: 0.25 }],
    ["cue", { id: "door", generator: "resonator/game", seed: "door-561", durationSeconds: 0.5, params: { cue: "impact" } }],
  ]]],
]];

test("audioplay score, cast, and manifest are immutable digest-bound data", () => {
  const score = admitSoundScore(scoreValue());
  const again = admitSoundScore(scoreValue());
  assert.equal(score.digest, again.digest);
  assert.equal(Object.isFrozen(score.score), true);
  assert.deepEqual(score.primitiveAddresses.map(({ tag }) => tag), ["bed", "narrate", "silence", "cue"]);
  const cast = admitAudioplayCast({ type: "AudioplayCast", version: 1, members: [{ speakerId: "june", characterId: "june", voice: { adapter: "fixture-tts", voice: "june-1", style: "dry" } }] }, score);
  const manifest = createAudioplayProductionManifest({ score, cast, pronunciationLexicon: [{ term: "jook", respelling: "dzook" }], soundDesign: { stems: ["speech", "ambience", "sfx", "music"] }, renderer: { id: "sound-score-renderer", version: 1 }, projections: ["chapter-wav", "chapter-mp3", "m4b", "podcast-rss"] });
  assert.match(manifest.digest, /^ni:\/\/\/sha-256;/u);
  assert.equal(manifest.scoreDigest, score.digest);
  assert.equal(manifest.extensions.livePlayer.status, "designed");
});

test("editing one line changes that primitive and score, but not unrelated primitives", () => {
  const before = admitSoundScore(scoreValue());
  const after = admitSoundScore(scoreValue("The ice answered."));
  const map = (score) => new Map(score.primitiveAddresses.map((entry) => [entry.id, entry.address]));
  assert.notEqual(before.digest, after.digest);
  assert.notEqual(map(before).get("line-1"), map(after).get("line-1"));
  assert.equal(map(before).get("wind"), map(after).get("wind"));
  assert.equal(map(before).get("door"), map(after).get("door"));
});

test("cast admission refuses speakers without stable voice assignments", () => {
  const score = admitSoundScore(scoreValue());
  assert.throws(() => admitAudioplayCast({ type: "AudioplayCast", version: 1, members: [] }, score), /missing voice assignments for june/u);
});

