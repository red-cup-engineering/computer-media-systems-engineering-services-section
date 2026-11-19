import { admitMediaNeed } from './media-need-contract.mjs';

const mediumCapability = Object.freeze({
  'one-panel-cartoon': 'image-generation',
  'short-animation': 'video-generation',
  'site-story': 'document-production',
  'conversation': 'text-production',
  'research-comedy-field-note': 'document-production',
});
const text = (value, name) => {
  if (typeof value !== 'string' || !value.trim()) throw new TypeError(`${name} is required`);
  return value.trim();
};

/**
 * Connect character narrative intent to the ORIGINAL shared MediaNeed contract.
 * The projection deliberately holds every production artifact. Independent
 * character/art/rights review and provider dispatch remain separate effects.
 */
export function proposeCharacterMediaNeed({ scene, commission } = {}) {
  if (!['editorial-candidate', 'rehearsal-candidate'].includes(scene?.kind) ||
    scene?.publicationAuthorized !== false || scene?.externalEffects?.length) {
    throw new TypeError('only inert source-derived character scenes can request media');
  }
  const actorId = text(scene.actorId, 'scene actor');
  const sceneId = text(scene.sceneId, 'scene identity');
  if (!commission || commission.actorId !== actorId || commission.sceneId !== sceneId) {
    throw new TypeError('media commission must address the same character and scene');
  }
  const consumer = text(commission.consumer, 'source-owning character consumer');
  const objective = text(commission.objective, 'specific media outcome');
  const reviewer = text(commission.reviewer, 'independent editorial receiver');
  const openedAt = text(commission.openedAt, 'source-qualified request time');
  if (!Array.isArray(commission.outputs) || !commission.outputs.length) throw new TypeError('specific output requests required');
  const media = new Set(scene.suggestedMedia ?? []);
  const artifacts = commission.outputs.map(({ medium, purpose, destination }) => {
    if (!media.has(medium) || !mediumCapability[medium]) throw new TypeError('requested medium is outside the character scene');
    return {
      capability: mediumCapability[medium], purpose: text(purpose, 'media artifact purpose'),
      destination: text(destination, 'actual consumer destination'), wanted: 1, priority: 0,
      disposition: 'hold', condition: 'Independent editorial, visual canon, rights and provider receiving required',
      character: { actorId, sceneId, medium, observationId: scene.observationId },
    };
  });
  const need = admitMediaNeed({
    type: 'MediaNeed', version: 1, id: `character-scene:${sceneId}`,
    consumer, objective, openedAt,
    source: { actorId, sceneId, observationId: scene.observationId,
      observationEvidence: scene.sourceObservation?.evidence ?? [],
      continuityIds: (scene.continuity ?? []).map((r) => r.id),
      authority: 'source-derived-inert-proposal' },
    intake: { state: 'proposed-unverified', reviewer,
      visualReceivingRequired: scene.visualReceivingRequired !== false,
      characterApproval: 'not-granted', publicPublication: 'not-granted' },
    artifacts,
  });
  return Object.freeze({ type: 'CharacterMediaProjection', status: 'PROPOSED_NOT_ADMITTED',
    actorId, sceneId, mediaNeedCandidate: need, externalEffects: Object.freeze([]) });
}
