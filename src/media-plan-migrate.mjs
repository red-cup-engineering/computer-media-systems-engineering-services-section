/**
 * Migration of the pre-plan shapes into the media plan, so no existing capability is lost:
 *   - a Public Fiction narrative episode (the procedural previs renderer's input: episode.shots,
 *     beats, dialogue) -> mediaPlanFromNarrativeEpisode
 *   - a queued Google Flow order line (the JSONL flow-generate admits, as the education-short
 *     producer writes it) -> mediaPlanFromFlowOrderLine
 * Pure. The result is a plan *candidate*: pass it to admitMediaPlan / compileMediaPlan.
 */
import { canonicalJson, niFromHex, niOf } from './media-plan.mjs';

const slugify = (value, fallback = 'plan') => {
  const s = String(value).toLowerCase().replace(/[^a-z0-9]+/gu, '-').replace(/^-+|-+$/gu, '').slice(0, 80).replace(/-+$/u, '');
  return s || fallback;
};
const uniqueInOrder = (values) => [...new Set(values)];

/**
 * A narrative episode as the procedural previs renderer reads it
 * ({episode:{id,fps,beats,shots}, source}) becomes a media plan: one scene per run of shots
 * sharing a beat, cast and places collected from the shots, the episode JSON itself named as
 * the source document by content address.
 */
export function mediaPlanFromNarrativeEpisode(raw, { consumer, title, links = [], endCard, publication = {}, render = {}, audio } = {}) {
  const input = structuredClone(raw); // the candidate never aliases the caller's episode
  const { episode, source } = input;
  const sourceRevision = source?.paracosm?.sourceRevision ?? source?.sourceRevision;
  const scenes = [];
  const reservedBases = new Set(episode.shots.map((shot) => slugify(shot.beatId)));
  const usedSceneIds = new Set();
  let previousBeat;
  const sceneId = (beat) => {
    const base = slugify(beat);
    if (!usedSceneIds.has(base)) { usedSceneIds.add(base); return base; }
    for (let run = 2; ; run += 1) {
      const suffix = `-run-${run}`;
      const candidate = `${base.slice(0, 80 - suffix.length).replace(/-+$/u, '')}${suffix}`;
      if (!usedSceneIds.has(candidate) && !reservedBases.has(candidate)) { usedSceneIds.add(candidate); return candidate; }
    }
  };
  for (const shot of episode.shots) {
    const last = scenes.at(-1);
    const planShot = {
      id: shot.id, beatId: shot.beatId, frames: shot.frames, locationId: shot.locationId, characterIds: shot.characterIds,
      ...(shot.camera ? { camera: shot.camera } : {}), action: shot.action, dialogue: shot.dialogue,
      visual: { mode: 'either' },
    };
    if (last && previousBeat === shot.beatId) last.shots.push(planShot);
    else scenes.push({ id: sceneId(shot.beatId), title: shot.beatId.replace(/-/gu, ' '), shots: [planShot] });
    previousBeat = shot.beatId;
  }
  return {
    kind: 'MediaPlan', version: 1,
    id: slugify(episode.id), title: title ?? episode.id.replace(/-/gu, ' '),
    consumer: consumer ?? slugify(source?.id ?? episode.id),
    aspect: '9:16', fps: episode.fps,
    source: {
      sourceRevision,
      ...(source?.originRef ? { originRef: source.originRef } : {}),
      documents: [{
        id: 'episode-source', role: 'narrative-source', identity: niOf(canonicalJson(input)),
        ...(source?.premise ? { title: source.premise.slice(0, 300) } : {}),
      }],
    },
    links,
    characters: uniqueInOrder(episode.shots.flatMap((s) => s.characterIds)).map((id) => ({ id, synthetic: true })),
    locations: uniqueInOrder(episode.shots.map((s) => s.locationId)).map((id) => ({ id })),
    beats: episode.beats ?? [],
    scenes,
    ...(audio ? { audio } : {}),
    ...(endCard ? { endCard } : {}),
    render: { targets: ['deterministic', 'flow'], ...render },
    publication: { title: title ?? episode.id.replace(/-/gu, ' '), ...publication },
  };
}

/**
 * One queued Flow order line becomes a single-shot plan whose explicit prompt is the line's
 * prompt, verbatim, so that compiling it back reproduces the executable fields of the line.
 */
export function mediaPlanFromFlowOrderLine(line, { fps = 30, clipSeconds = 8, links = [], title, id } = {}) {
  const assembly = line.promptAssembly ?? {};
  const revisionFromReport = /^[a-f0-9]{64}$/u.test(assembly.reportSha256 ?? '') ? `sha256:${assembly.reportSha256}` : null;
  // With no lesson report or source on the line, the order's own prompt is the only source there is.
  const sourceRevision = revisionFromReport ?? line.sources?.[0]?.identity ?? niOf(line.prompt);
  const documents = (line.sources ?? []).map((s, i) => ({ id: `${slugify(s.role ?? 'source')}-${i + 1}`, role: slugify(s.role ?? 'source'), identity: s.identity }));
  const topic = /about (.+?)\.(?: Teaching angle| |$)/u.exec(line.prompt)?.[1];
  const planTitle = title ?? topic ?? line.consumer;
  return {
    kind: 'MediaPlan', version: 1,
    id: id ?? slugify(line.consumer), title: planTitle.slice(0, 200), consumer: line.consumer,
    ...(line.purpose ? { purpose: line.purpose } : {}),
    ...(line.destination ? { destination: line.destination } : {}),
    ...(assembly.revision ? { promptRevision: assembly.revision } : {}),
    aspect: line.aspect, fps,
    source: { sourceRevision, documents: documents.length ? documents : [{ id: 'order-prompt', role: 'prompt', identity: niOf(line.prompt) }] },
    links,
    scenes: [{
      id: 'scene-1',
      shots: [{
        id: 'clip', frames: clipSeconds * fps, action: (assembly.claim ?? line.prompt).slice(0, 400),
        ...(assembly.claim ? { claim: assembly.claim } : {}),
        visual: { mode: 'generative', prompt: line.prompt },
      }],
    }],
    render: { targets: ['flow'] },
    publication: { title: planTitle.slice(0, 100), ...(line.parentVideoId ? { parentVideoId: line.parentVideoId } : {}) },
  };
}

export { niFromHex };
