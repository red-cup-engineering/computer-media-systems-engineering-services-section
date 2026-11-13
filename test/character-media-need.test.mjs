import assert from 'node:assert/strict';
import test from 'node:test';
import { proposeCharacterMediaNeed } from '../src/character-media-need.mjs';

const scene = {
  kind: 'rehearsal-candidate', publicationAuthorized: false, externalEffects: [],
  actorId: 'urn:561:actor:yanagi', observationId: 'fixture-rehearsal',
  sceneId: 'sha256:abc123', sourceObservation: { evidence: ['source:fixture'] },
  continuity: [{ id: 'witnessed-callback' }], visualReceivingRequired: true,
  suggestedMedia: ['one-panel-cartoon', 'short-animation', 'conversation'],
};
const commission = {
  actorId: scene.actorId, sceneId: scene.sceneId,
  consumer: 'causeway-services/public-yanagi-services-section', reviewer: 'causeway-public-media',
  objective: 'One candidate cartoon panel for independent receiving', openedAt: '2026-10-22T20:00:00Z',
  outputs: [{ medium: 'one-panel-cartoon', purpose: 'yanagi-cheek-metric-panel', destination: 'source-owned-review-queue' }],
};

test('character-specific production commissions use existing shared MediaNeed and stay held', () => {
  const p = proposeCharacterMediaNeed({ scene, commission });
  assert.equal(p.status, 'PROPOSED_NOT_ADMITTED');
  assert.equal(p.mediaNeedCandidate.type, 'MediaNeed');
  assert.equal(p.mediaNeedCandidate.artifacts[0].capability, 'image-generation');
  assert.equal(p.mediaNeedCandidate.artifacts[0].disposition, 'hold');
  assert.equal(p.mediaNeedCandidate.intake.characterApproval, 'not-granted');
  assert.equal(p.mediaNeedCandidate.source.actorId, scene.actorId);
  assert.deepEqual(p.mediaNeedCandidate.source.continuityIds, ['witnessed-callback']);
  assert.deepEqual(p.externalEffects, []);
});

test('animation and conversation can request separate outputs with distinct purposes', () => {
  const p = proposeCharacterMediaNeed({ scene, commission: { ...commission, outputs: [
    { medium: 'short-animation', purpose: 'animation-provisional', destination: 'editorial-review' },
    { medium: 'conversation', purpose: 'dialogue-provisional', destination: 'editorial-review' },
  ] } });
  assert.deepEqual(p.mediaNeedCandidate.artifacts.map((a) => a.capability), ['video-generation', 'text-production']);
  assert.ok(p.mediaNeedCandidate.artifacts.every((a) => a.disposition === 'hold'));
});

test('foreign actor, unauthorized scene, arbitrary medium and ambiguous artifact purpose are refused', () => {
  assert.throws(() => proposeCharacterMediaNeed({ scene, commission: { ...commission, actorId: 'urn:561:actor:other' } }), /same character/);
  assert.throws(() => proposeCharacterMediaNeed({ scene: { ...scene, externalEffects: ['post'] }, commission }), /inert/);
  assert.throws(() => proposeCharacterMediaNeed({ scene, commission: { ...commission, outputs: [{ medium: 'unsupported-medium', purpose: 'example', destination: 'x' }] } }), /outside/);
  assert.throws(() => proposeCharacterMediaNeed({ scene, commission: { ...commission, outputs: [commission.outputs[0], commission.outputs[0]] } }), /duplicate artifact purpose/);
});
