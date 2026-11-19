/**
 * Media plan compilers. Pure functions from an admitted media plan (./media-plan.mjs) to:
 *   (a) Google Flow queue orders        -> compileFlowOrders
 *   (b) a deterministic render job      -> compileDeterministicRenderJob
 *   (c) publication metadata + tracks   -> compilePublication
 * and the Hoare-contracted entry point every consumer goes through:
 *   compileMediaPlan(plan, options) : PRE admitMediaPlan, POST receipt checks, no effects.
 *
 * Nothing here submits an order, spends credits, renders a frame, writes a file or reads
 * the network. A queue, a renderer or a publisher is a separate, later adapter that takes
 * these outputs as data.
 */
import {
  admitMediaPlan, canonicalJson, hexFromNi, linkHref, mediaPlanId, niOf, planShots, resolveLink, sha256Hex, svgIsSelfContained,
} from './media-plan.mjs';

export const MEDIA_PLAN_CONTRACT_ID = 'compile-media-plan/1';
export const DEFAULT_FLOW_MODEL = 'veo_3_1_t2v_lite';
export const DEFAULT_MAX_CLIP_SECONDS = 8;
export const DETERMINISTIC_RENDERER = 'procedural-previs/1';

/**
 * The contract stated as data, for consumers (and a bazaar listing) to read:
 * what must hold before, what holds after, what is refused, what the call may touch.
 */
export const MEDIA_PLAN_CONTRACT = Object.freeze({
  id: MEDIA_PLAN_CONTRACT_ID,
  input: 'data/schema/media-plan.schema.json',
  output: 'data/schema/media-plan-compilation-receipt.schema.json',
  requires: Object.freeze([
    'plan is a MediaPlan v1 that admitMediaPlan accepts (schema + cross-field checks)',
    'every source document is addressed by NI, https URL or DOI; the source revision is exact',
    'every cue lies inside its shot; every speaker is in the shot cast; every inline SVG establishes the closed media-inert-svg/1 profile',
    'for target flow: no shot asks for reference/frame/video conditioning (the wire client is text-to-video only) and no generative shot exceeds the clip length',
    'for target deterministic: every shot is representable at the output frame rate without drift and every asset is resolvable inline',
    'procedural-previs/1 accepts only 9:16, at most 100 shots including the end card, 5 cast and 12 dialogue lines per shot, and one frame asset per shot',
    'when publication.requirePaperLink is set: a rel "paper" link resolves to a URL, DOI or content address',
    'a rendered end card carries the complete selected locator in four bounded visible lines; when a paper exists the selected locator is that paper locator',
  ]),
  ensures: Object.freeze([
    'effects: none - no order queued, no credit held, no frame rendered, no file or network touched',
    'the receipt names the plan by content address and the outputs by content address; compiling twice gives identical bytes',
    'every plan shot is accounted for exactly once: ordered for Flow, satisfied by an accepted generation on file, or deterministic-only',
    'every Flow order is a single text-to-video clip for the plan aspect, with source documents carried as content-addressed sources',
    'every dialogue line is present in the caption track (unless captions.derive is explicit)',
    'deterministic job frame total equals the sum of the plan shots plus the end card',
    'when a paper link exists its complete locator appears in the description and on a rendered end card; NI-only locators are never abbreviated',
  ]),
  refusals: Object.freeze([
    'PLAN_NOT_OBJECT', 'PLAN_KIND', 'PLAN_VERSION', 'FIELD_*', 'DUPLICATE_ID', 'UNKNOWN_*', 'SOURCE_REVISION_INEXACT',
    'SOURCE_DOCUMENT_UNADDRESSED', 'LOCATOR_*', 'SPEAKER_NOT_IN_CAST', 'CUE_OUTSIDE_SHOT', 'SVG_NOT_SELF_CONTAINED',
    'ASSET_UNADDRESSED', 'ASSET_IDENTITY_MISMATCH', 'ASSET_UNRESOLVED', 'PAPER_LINK_MISSING', 'ENDCARD_LINK_MISSING',
    'REFERENCE_CONDITIONING_UNSUPPORTED', 'SHOT_EXCEEDS_CLIP_LENGTH', 'TIMING_DRIFT', 'TARGET_NOT_PLANNED',
    'NOTHING_TO_ORDER', 'ENDCARD_LINK_TOO_LONG', 'ENDCARD_PAPER_LINK_MISMATCH', 'DESCRIPTION_TOO_LONG', 'POSTCONDITION_FAILED', 'RENDERER_UNSUPPORTED',
  ]),
  effects: 'none',
});

const END_CARD_LINK_WIDTH = 34;
const END_CARD_LINK_LINES = 4;
const frozen = (v) => Object.freeze(v);
const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const refusal = (code, path, message) => frozen({ code, path, message });
const esc = (value) => String(value).replace(/[&<>"']/gu, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[ch]);
const frameMs = (frame, fps) => Math.round((frame * 1000) / fps);
const wrap = (text, max, lines) => {
  const words = String(text).split(/\s+/u).filter(Boolean);
  const out = []; let line = '';
  for (const word of words) {
    let w = word;
    while (w.length > max) { if (line) { out.push(line); line = ''; } out.push(w.slice(0, max)); w = w.slice(max); }
    if (line && line.length + w.length + 1 > max) { out.push(line); line = ''; }
    line += (line ? ' ' : '') + w;
  }
  if (line) out.push(line);
  return out.slice(0, lines);
};

// ---------------------------------------------------------------- captions

const speakerLabel = (plan, id) => {
  const c = plan.characters.find((x) => x.id === id);
  return (c?.name ?? id.replace(/-/gu, ' ')).toUpperCase();
};

/** The caption cues over the whole plan timeline (ms), in order. */
export function captionCues(plan, { includeEndCard = false } = {}) {
  const cues = []; let offset = 0;
  for (const shot of planShots(plan)) {
    const explicit = shot.captions;
    const useExplicit = plan.captions.derive === 'explicit' || (plan.captions.derive === 'auto' && explicit.length > 0);
    const source = useExplicit ? explicit.map((c) => ({ ...c, kind: 'caption' })) : shot.dialogue.map((d) => ({ ...d, kind: 'dialogue' }));
    for (const cue of source) {
      cues.push(frozen({
        shotId: shot.id, kind: cue.kind, ...(cue.speakerId ? { speakerId: cue.speakerId } : {}),
        startMs: frameMs(offset + cue.startFrame, plan.fps), endMs: frameMs(offset + cue.endFrame, plan.fps),
        text: cue.kind === 'dialogue' ? `${speakerLabel(plan, cue.speakerId)}: ${cue.text}` : cue.text,
      }));
    }
    offset += shot.frames;
  }
  if (includeEndCard && plan.endCard) offset += plan.endCard.seconds * plan.fps;
  return frozen(cues);
}

const pad = (n, w) => String(n).padStart(w, '0');
const timecode = (ms, sep) => `${pad(Math.floor(ms / 3600000), 2)}:${pad(Math.floor(ms / 60000) % 60, 2)}:${pad(Math.floor(ms / 1000) % 60, 2)}${sep}${pad(ms % 1000, 3)}`;
export const renderSrt = (cues) => (cues.length ? cues.map((c, i) => `${i + 1}\n${timecode(c.startMs, ',')} --> ${timecode(c.endMs, ',')}\n${c.text}\n`).join('\n') : '');
export const renderVtt = (cues) => `WEBVTT\n\n${cues.map((c) => `${timecode(c.startMs, '.')} --> ${timecode(c.endMs, '.')}\n${c.text}\n`).join('\n')}`;

// ---------------------------------------------------------------- end card

const visibleLocator = (link) => link ? linkHref(link) ?? link.identity : null;
const selectedCardLink = (plan) => plan.links.map((l) => resolveLink(plan, l)).find((l) => l.rel === plan.endCard.linkRel);
// Locators contain no whitespace. Split by Unicode scalar, before escaping, so
// concatenating visible lines recovers the complete locator without loss.
const locatorLines = (locator) => {
  const chars = Array.from(locator ?? ''), lines = [];
  for (let i = 0; i < chars.length; i += END_CARD_LINK_WIDTH) lines.push(chars.slice(i, i + END_CARD_LINK_WIDTH).join(''));
  return lines;
};

/** Deterministic 540x960 card; compileDeterministicRenderJob checks its layout preconditions. */
export function endCardSvg(plan) {
  const e = plan.endCard;
  const link = selectedCardLink(plan);
  const locator = visibleLocator(link);
  const headline = wrap(e.headline ?? 'Read the paper', 26, 2);
  const body = wrap(e.text ?? plan.title, 34, 3);
  const hrefLines = locatorLines(locator);
  const secondaryDoi = link?.doi && Array.from(`doi:${link.doi}`).length <= 60 ? `doi:${link.doi}` : null;
  const lines = (arr, x, y, size, fill, gap, fit = false) => arr.map((t, i) => `<text x="${x}" y="${y + i * gap}" text-anchor="middle" font-family="DejaVu Sans" font-size="${size}" fill="${fill}"${fit ? ` textLength="${Math.min(440, Array.from(t).length * 11)}" lengthAdjust="spacingAndGlyphs"` : ''}>${esc(t)}</text>`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="540" height="960" viewBox="0 0 540 960">
<defs><linearGradient id="bg" x1="0" y1="0" x2="0.55" y2="1"><stop stop-color="#070e17"/><stop offset=".57" stop-color="#132730"/><stop offset="1" stop-color="#090b15"/></linearGradient></defs>
<rect width="540" height="960" fill="url(#bg)"/>
<rect x="30" y="250" width="480" height="460" rx="10" fill="#06121d" fill-opacity=".85" stroke="#99d1be" stroke-opacity=".35"/>
${lines(headline, 270, 330, 34, '#f1eee9', 44)}
${lines(body, 270, 440, 20, '#acbcc6', 28)}
${locator ? `<text x="270" y="560" text-anchor="middle" font-family="DejaVu Sans" font-size="13" letter-spacing="2" fill="#99d1be">${esc((link.rel ?? 'link').toUpperCase())}</text>${lines(hrefLines, 270, 590, 19, '#f1eee9', 26, true)}` : ''}
${secondaryDoi ? `<text x="270" y="${590 + hrefLines.length * 26 + 14}" text-anchor="middle" font-family="DejaVu Sans" font-size="15" fill="#acbcc6" textLength="${Math.min(440, Array.from(secondaryDoi).length * 8)}" lengthAdjust="spacingAndGlyphs">${esc(secondaryDoi)}</text>` : ''}
</svg>`;
}

// ---------------------------------------------------------------- Flow

const NO_TEXT = 'Render the scene without on-screen text, lettering, captions, charts, logos or invented statistics; any text or graphic overlay is composited afterward from exact source data.';
const GENERATIVE_TEXT_REQUEST = /\blabell?ed\s+['"\u2018\u201C]|\b(?:text overlays?|overlay text|captions? appear|title card|lower third)\b|\b(?:text|words?) (?:appears?|reads?)\b|\bwith the (?:words?|text)\s+['"\u2018\u201C]/iu;

/** Assemble a text-to-video prompt from a shot, when the plan carries no explicit prompt. */
export function assembleFlowPrompt(plan, shot, seconds) {
  const place = plan.locations.find((l) => l.id === shot.locationId);
  const cast = shot.characterIds.map((id) => plan.characters.find((c) => c.id === id)?.name ?? id);
  const parts = [
    `Create one continuous ${seconds}-second ${plan.aspect === '9:16' ? 'vertical 9:16' : 'horizontal 16:9'} cinematic shot.`,
    shot.locationId ? `Setting: ${place?.name ?? shot.locationId.replace(/-/gu, ' ')}.` : null,
    shot.camera ? `Camera and framing: ${shot.camera}.` : null,
    `Action: ${shot.action}.`,
    cast.length ? `Characters on screen: ${cast.join(', ')}.` : null,
    shot.claim ? `Source statement for grounding only; do not render or speak these words:\n${shot.claim}\nShow only what that statement supports.` : null,
    NO_TEXT,
    shot.ambience ? `Ambient sound: ${shot.ambience}.` : 'Use appropriate ambient sound; no dialogue or narration (spoken lines are mixed in afterward).',
  ];
  return parts.filter(Boolean).join('\n');
}

// Journal rows are observations, not a shot author's explicit acceptance. Only
// compatible text-to-video evidence may suppress a new video order. This checks
// the carried evidence, not the existence/rights/editorial acceptance of bytes.
function compatibleVideoCompletion(c, aspect) {
  return c?.type === 'MediaArtifactWorkCompletion' && c.capability === 'text-to-video'
    && hexFromNi(c.id) !== null && hexFromNi(c.prompt) !== null
    && hexFromNi(c.output?.identity) !== null && c.output?.mimeType === 'video/mp4'
    && Number.isSafeInteger(c.output?.bytes) && c.output.bytes > 0
    && c.resource?.aspect === aspect
    && (c.promptText === undefined || (typeof c.promptText === 'string' && niOf(c.promptText) === c.prompt));
}

const shotSeconds = (plan, shot) => Math.max(shot.visual.minSeconds ?? 1, Math.ceil(shot.frames / plan.fps));

/**
 * Compile Flow queue orders (the JSON lines flow-generate's queue admits).
 *   options.model            Flow model key; the Flow adapter picks it from the live catalog.
 *   options.completions      journal lines (MediaArtifactWorkCompletion) already on file; a
 *                            shot whose exact prompt was already generated is satisfied, not re-ordered.
 *   options.maxClipSeconds   longest clip the model makes (8 for Veo 3.1).
 */
export function compileFlowOrders(plan, { model = DEFAULT_FLOW_MODEL, completions = [], maxClipSeconds = DEFAULT_MAX_CLIP_SECONDS } = {}) {
  const refusals = []; const orders = []; const satisfied = []; const deterministicOnly = []; const warnings = [];
  const sources = plan.source.documents.filter((d) => d.identity).map((d) => frozen({ identity: d.identity, role: d.role }));
  const onFile = new Map();
  for (const c of completions) {
    if (compatibleVideoCompletion(c, plan.aspect)) {
      if (!onFile.has(c.prompt)) onFile.set(c.prompt, []);
      onFile.get(c.prompt).push(c);
    }
  }
  for (const shot of planShots(plan)) {
    const path = `scenes[${plan.scenes.findIndex((s) => s.id === shot.sceneId)}].shots[${plan.scenes.find((s) => s.id === shot.sceneId).shots.findIndex((s) => s.id === shot.id)}]`;
    if (shot.visual.mode === 'deterministic') { deterministicOnly.push(shot.id); continue; }
    if (shot.visual.referenceImages?.length) {
      refusals.push(refusal('REFERENCE_CONDITIONING_UNSUPPORTED', `${path}.visual.referenceImages`, 'the Flow wire client is text-to-video only; reference images cannot be silently dropped. Mark the shot deterministic or remove the references.'));
      continue;
    }
    const seconds = shotSeconds(plan, shot);
    const prompt = shot.visual.prompt ?? assembleFlowPrompt(plan, shot, Math.max(seconds, maxClipSeconds));
    if (seconds > maxClipSeconds) {
      refusals.push(refusal('SHOT_EXCEEDS_CLIP_LENGTH', `${path}.frames`, `shot needs ${seconds}s but a Flow clip is at most ${maxClipSeconds}s; split the shot`));
      continue;
    }
    if (GENERATIVE_TEXT_REQUEST.test(prompt)) warnings.push(frozen({ code: 'GENERATIVE_TEXT_REQUEST', shotId: shot.id, message: 'the prompt asks the video model to draw text or labelled graphics; move them to a deterministic overlay asset (visual.assets, role overlay)' }));
    const promptNi = niOf(prompt);
    const filed = [...(shot.visual.generated ?? []).filter((g) => (!g.prompt || g.prompt === promptNi) && (g.mimeType === undefined || /^video\/[A-Za-z0-9.+-]+$/u.test(g.mimeType)) && (g.bytes === undefined || g.bytes > 0)).map((g) => ({ completion: g.completion, output: g.output })),
      ...(onFile.get(promptNi) ?? []).map((c) => ({ completion: c.id, output: c.output?.identity }))];
    if (filed.length) { satisfied.push(frozen({ shotId: shot.id, reason: 'ACCEPTED_GENERATION_ON_FILE', promptIdentity: promptNi, generations: frozen(filed.map(frozen)) })); continue; }
    const orderId = sha256Hex(canonicalJson({ planId: plan.id, shotId: shot.id, prompt, model, aspect: plan.aspect }));
    orders.push(frozen({
      consumer: plan.consumer, medium: 'video', model, aspect: plan.aspect, count: 1, prompt,
      ...(sources.length ? { sources } : {}),
      ...(plan.destination ? { destination: plan.destination } : {}),
      purpose: plan.purpose ?? shot.id,
      ...(plan.publication.parentVideoId ? { parentVideoId: plan.publication.parentVideoId } : {}),
      promptAssembly: frozen({
        revision: plan.promptRevision ?? 'media-plan/1', planId: plan.id, shotId: shot.id, sourceRevision: plan.source.sourceRevision,
        ...(shot.claim ? { claim: shot.claim } : {}), ...(shot.visual.prompt ? {} : { assembled: true }),
      }),
      orderId,
    }));
  }
  if (!refusals.length && orders.length + satisfied.length === 0) refusals.push(refusal('NOTHING_TO_ORDER', 'scenes', 'every shot is deterministic-only; there is nothing for Flow to generate'));
  return frozen({ orders: frozen(orders), satisfied: frozen(satisfied), deterministicOnly: frozen(deterministicOnly), warnings: frozen(warnings), refusals: frozen(refusals) });
}

// ---------------------------------------------------------------- deterministic

// Generated identity belongs to the compiler; author shot identities are never reserved or rewritten.
function endCardShotId(plan) {
  const ids = new Set(planShots(plan).map((shot) => shot.id));
  let id = 'end-card';
  for (let suffix = 2; ids.has(id); suffix += 1) id = `end-card-${suffix}`;
  return id;
}

/** Compile the render job the procedural renderer consumes. */
export function compileDeterministicRenderJob(plan) {
  const refusals = []; const assets = []; const shots = [];
  const { outputFps } = plan.render;
  if (plan.aspect !== '9:16') refusals.push(refusal('RENDERER_UNSUPPORTED', 'aspect', 'procedural-previs/1 only renders 9:16; a different aspect cannot be silently changed'));
  const shotCount = planShots(plan).length + (plan.endCard ? 1 : 0);
  if (shotCount > 100) refusals.push(refusal('RENDERER_UNSUPPORTED', 'scenes', 'procedural-previs/1 accepts at most 100 total shots including the end card'));
  for (const [si, scene] of plan.scenes.entries()) {
    for (const [hi, shot] of scene.shots.entries()) {
      const path = `scenes[${si}].shots[${hi}]`;
      if (shot.characterIds.length > 5) refusals.push(refusal('RENDERER_UNSUPPORTED', `${path}.characterIds`, 'procedural-previs/1 accepts at most 5 characters per shot'));
      if (shot.dialogue.length > 12) refusals.push(refusal('RENDERER_UNSUPPORTED', `${path}.dialogue`, 'procedural-previs/1 accepts at most 12 dialogue lines per shot'));
      if (shot.visual.assets.filter((a) => a.role === 'frame').length > 1) refusals.push(refusal('RENDERER_UNSUPPORTED', `${path}.visual.assets`, 'procedural-previs/1 consumes one frame asset per shot; additional frames cannot be silently discarded'));
      if ((shot.frames * outputFps) % plan.fps !== 0) refusals.push(refusal('TIMING_DRIFT', `${path}.frames`, `${shot.frames} frames at ${plan.fps} fps cannot be represented at ${outputFps} fps without drift`));
      shots.push({
        id: shot.id, beatId: shot.beatId ?? scene.id, frames: shot.frames, locationId: shot.locationId ?? 'unspecified',
        characterIds: [...shot.characterIds], ...(shot.camera ? { camera: shot.camera } : {}), action: shot.action,
        dialogue: shot.dialogue.map((d) => ({ speakerId: d.speakerId, startFrame: d.startFrame, endFrame: d.endFrame, text: d.text })),
      });
      for (const [ai, a] of shot.visual.assets.entries()) {
        if (!a.svg) { refusals.push(refusal('ASSET_UNRESOLVED', `${path}.visual.assets[${ai}]`, 'the deterministic renderer needs the SVG inline; resolve the content address to bytes before compiling')); continue; }
        assets.push(frozen({ shotId: shot.id, assetId: a.id, role: a.role, mediaType: a.mediaType, svg: a.svg, sha256: sha256Hex(a.svg), ...(a.producer ? { producer: a.producer } : {}) }));
      }
    }
  }
  if (plan.endCard) {
    const locator = visibleLocator(selectedCardLink(plan));
    const paper = plan.links.map((l) => resolveLink(plan, l)).find((l) => l.rel === 'paper');
    if (locatorLines(locator).length > END_CARD_LINK_LINES) refusals.push(refusal('ENDCARD_LINK_TOO_LONG', 'endCard.linkRel', `the complete locator does not fit the end card (${END_CARD_LINK_WIDTH * END_CARD_LINK_LINES} Unicode scalars); give the link a shorter complete URL or DOI`));
    if (paper && locator !== visibleLocator(paper)) refusals.push(refusal('ENDCARD_PAPER_LINK_MISMATCH', 'endCard.linkRel', 'the selected end-card locator differs from the required paper locator'));
    const svg = endCardSvg(plan);
    const frames = plan.endCard.seconds * plan.fps;
    const cardShotId = endCardShotId(plan);
    shots.push({ id: cardShotId, beatId: 'end-card', frames, locationId: 'end-card', characterIds: [], action: 'End card with the source link', dialogue: [] });
    assets.push(frozen({ shotId: cardShotId, assetId: 'end-card-frame', role: 'frame', mediaType: 'image/svg+xml', svg, sha256: sha256Hex(svg), producer: frozen({ service: 'media-plan/end-card' }) }));
  }
  if (refusals.length) return frozen({ job: null, refusals: frozen(refusals) });
  const cues = captionCues(plan, { includeEndCard: true });
  const totalFrames = shots.reduce((n, s) => n + s.frames, 0);
  const job = frozen({
    type: 'DeterministicRenderJob', version: 1, renderer: DETERMINISTIC_RENDERER, planId: mediaPlanId(plan),
    input: frozen({
      source: frozen({ type: 'MediaPlanSource', id: plan.id, planId: mediaPlanId(plan), sourceRevision: plan.source.sourceRevision, ...(plan.source.originRef ? { originRef: plan.source.originRef } : {}) }),
      episode: frozen({ id: plan.id, fps: plan.fps, ...(plan.beats.length ? { beats: plan.beats } : {}), shots: frozen(shots) }),
    }),
    options: frozen({ width: plan.render.width, fps: plan.render.outputFps, style: plan.render.style, motion: plan.render.motion, voice: plan.audio.dialogue.voice, music: plan.audio.music.profile }),
    captions: frozen({ burnedIn: plan.captions.burnedIn, cues, srt: renderSrt(cues), vtt: renderVtt(cues) }),
    assets: frozen(assets),
    totalFrames, totalSeconds: totalFrames / plan.fps,
    expectedOutputs: frozen(['preview.mp4', 'captions.srt', 'preview-manifest.json']),
  });
  return frozen({ job, refusals: frozen([]) });
}

// ---------------------------------------------------------------- publication

/** Compile publication metadata: description with the paper link, caption tracks, end-card link. */
export function compilePublication(plan) {
  const refusals = [];
  const links = plan.links.map((l) => resolveLink(plan, l));
  const lines = [];
  if (plan.publication.description) lines.push(plan.publication.description);
  for (const l of links.filter((x) => x.rel === 'paper')) {
    const href = linkHref(l);
    const block = [href ? `Read the paper: ${href}` : 'Read the paper:'];
    if (l.doi && !(href ?? '').includes(l.doi)) block.push(`DOI: https://doi.org/${l.doi}`);
    if (l.citation) block.push(l.citation);
    if (l.identity) block.push(`Content address: ${l.identity}`);
    lines.push(block.join('\n'));
  }
  const others = links.filter((x) => x.rel !== 'paper' && linkHref(x));
  if (others.length) lines.push(others.map((l) => `${l.label ?? l.rel}: ${linkHref(l)}`).join('\n'));
  if (plan.publication.aiDisclosure) lines.push(plan.publication.aiDisclosure);
  const description = lines.join('\n\n');
  if (Buffer.byteLength(description, 'utf8') > 5000) refusals.push(refusal('DESCRIPTION_TOO_LONG', 'publication.description', 'the composed description exceeds 5000 bytes'));
  const cues = captionCues(plan, { includeEndCard: true });
  const publication = frozen({
    title: plan.publication.title, description, tags: frozen([...plan.publication.tags]), privacy: plan.publication.privacy,
    language: plan.language,
    ...(plan.publication.parentVideoId ? { parentVideoId: plan.publication.parentVideoId } : {}),
    ...(plan.publication.categoryId ? { categoryId: plan.publication.categoryId } : {}),
    ...(plan.publication.madeForKids !== undefined ? { madeForKids: plan.publication.madeForKids } : {}),
    links: frozen(links),
    captionTracks: frozen(cues.length ? [frozen({ language: plan.language, format: 'vtt', sha256: sha256Hex(renderVtt(cues)) })] : []),
    ...(plan.endCard ? { endCard: frozen({ seconds: plan.endCard.seconds, linkRel: plan.endCard.linkRel }) } : {}),
  });
  return frozen({ publication, refusals: frozen(refusals) });
}

// ---------------------------------------------------------------- contract entry point

function postconditions(plan, outputs) {
  const checks = [];
  const check = (name, ok) => checks.push(frozen({ name, ok: Boolean(ok) }));
  const shots = planShots(plan);
  check('effects-none', true);
  if (outputs.flow) {
    const accounted = outputs.flow.orders.length + outputs.flow.satisfied.length + outputs.flow.deterministicOnly.length;
    check('every-shot-accounted-for-once', accounted === shots.length);
    check('flow-orders-are-single-text-to-video-clips', outputs.flow.orders.every((o) => o.medium === 'video' && o.count === 1 && o.aspect === plan.aspect
      && !['referenceImages', 'references', 'ingredients', 'firstFrame', 'lastFrame', 'inputImage', 'sourceVideo'].some((k) => k in o)));
    check('flow-sources-are-content-addressed', outputs.flow.orders.every((o) => (o.sources ?? []).every((s) => hexFromNi(s.identity))));
  }
  if (outputs.deterministic) {
    const job = outputs.deterministic;
    check('deterministic-assets-establish-inert-profile', job.assets.every((a) => svgIsSelfContained(a.svg)));
    check('frames-conserved', job.totalFrames === shots.reduce((n, s) => n + s.frames, 0) + (plan.endCard ? plan.endCard.seconds * plan.fps : 0));
    check('shot-ids-conserved', canonicalJson(job.input.episode.shots.map((s) => s.id)) === canonicalJson([...shots.map((s) => s.id), ...(plan.endCard ? [endCardShotId(plan)] : [])]));
    if (plan.captions.derive !== 'explicit') {
      const text = job.captions.cues.map((c) => c.text).join('\n');
      check('every-dialogue-line-captioned', shots.every((s) => s.dialogue.every((d) => text.includes(d.text))));
    }
    if (plan.endCard) {
      const card = job.assets.find((a) => a.shotId === endCardShotId(plan) && a.assetId === 'end-card-frame');
      const text = card ? [...card.svg.matchAll(/>([^<]*)<\/text>/gu)].map((m) => m[1]).join('') : '';
      const locator = visibleLocator(selectedCardLink(plan));
      check('selected-link-on-end-card', locator && text.includes(esc(locator)));
    }
  }
  const paper = outputs.publication.links.find((l) => l.rel === 'paper');
  if (paper) {
    const href = linkHref(paper);
    check('paper-link-in-description', (href && outputs.publication.description.includes(href)) || (paper.identity && outputs.publication.description.includes(paper.identity)));
    if (plan.endCard && outputs.deterministic) {
      const card = outputs.deterministic.assets.find((a) => a.shotId === endCardShotId(plan) && a.assetId === 'end-card-frame');
      const text = card ? [...card.svg.matchAll(/>([^<]*)<\/text>/gu)].map((m) => m[1]).join('') : '';
      const locator = visibleLocator(paper);
      check('paper-link-on-end-card', locator && text.includes(esc(locator)));
    }
  }
  return frozen(checks);
}

/**
 * The Hoare-contracted entry point. {ok:true, receipt} or {ok:false, refusals}. Never throws
 * for plan content; never has an effect.
 *   options.targets   defaults to plan.render.targets; each must be planned (render.targets).
 */
export function compileMediaPlan(input, options = {}) {
  const admitted = admitMediaPlan(input);
  if (!admitted.ok) return frozen({ ok: false, refusals: admitted.refusals });
  const plan = admitted.plan;
  const refusals = [];
  if (!isObject(options)) return frozen({ ok: false, refusals: frozen([refusal('FIELD_OBJECT', 'options', 'compile options must be an object')]) });
  const targets = options.targets === undefined ? plan.render.targets : options.targets;
  if (!Array.isArray(targets) || targets.length === 0 || new Set(targets).size !== targets.length || targets.some((t) => typeof t !== 'string')) refusals.push(refusal('FIELD_ARRAY', 'options.targets', 'targets must be a nonempty array of unique target names'));
  if (options.model !== undefined && (typeof options.model !== 'string' || !options.model.trim())) refusals.push(refusal('FIELD_TEXT', 'options.model', 'model must be nonempty text'));
  if (options.maxClipSeconds !== undefined && (!Number.isSafeInteger(options.maxClipSeconds) || options.maxClipSeconds < 1)) refusals.push(refusal('FIELD_INTEGER', 'options.maxClipSeconds', 'maxClipSeconds must be a positive safe integer'));
  if (options.completions !== undefined && !Array.isArray(options.completions)) refusals.push(refusal('FIELD_ARRAY', 'options.completions', 'completions must be an array of journal records'));
  if (refusals.length) return frozen({ ok: false, refusals: frozen(refusals) });
  for (const t of targets) if (!plan.render.targets.includes(t)) refusals.push(refusal('TARGET_NOT_PLANNED', 'render.targets', `target ${t} is not among the plan's render.targets`));
  if (refusals.length) return frozen({ ok: false, refusals: frozen(refusals) });
  const planIdentity = mediaPlanId(plan);
  const outputs = { flow: null, deterministic: null, publication: null };
  const warnings = [];
  if (targets.includes('flow')) {
    const flow = compileFlowOrders(plan, { model: options.model, completions: options.completions, maxClipSeconds: options.maxClipSeconds });
    refusals.push(...flow.refusals); warnings.push(...flow.warnings);
    outputs.flow = { orders: flow.orders, satisfied: flow.satisfied, deterministicOnly: flow.deterministicOnly };
  }
  if (targets.includes('deterministic')) {
    const det = compileDeterministicRenderJob(plan);
    refusals.push(...det.refusals); outputs.deterministic = det.job;
  }
  const pub = compilePublication(plan);
  refusals.push(...pub.refusals); outputs.publication = pub.publication;
  if (refusals.length) return frozen({ ok: false, refusals: frozen(refusals) });
  const checks = postconditions(plan, outputs);
  if (checks.some((c) => !c.ok)) return frozen({ ok: false, refusals: frozen([refusal('POSTCONDITION_FAILED', '', `postconditions failed: ${checks.filter((c) => !c.ok).map((c) => c.name).join(', ')}`)]) });
  const receipt = frozen({
    type: 'MediaPlanCompilationReceipt', version: 1, contract: MEDIA_PLAN_CONTRACT_ID, effects: 'none',
    planId: planIdentity, planSlug: plan.id, targets: frozen([...targets].sort()),
    options: frozen({ model: options.model ?? DEFAULT_FLOW_MODEL, maxClipSeconds: options.maxClipSeconds ?? DEFAULT_MAX_CLIP_SECONDS,
      completionsConsulted: frozen((options.completions ?? []).map((c) => c?.id).filter((id) => typeof id === 'string').sort()) }),
    checks, warnings: frozen(warnings),
    outputId: niOf(canonicalJson(outputs)),
    outputs: frozen(outputs),
  });
  return frozen({ ok: true, receipt });
}

/**
 * POSTCONDITION audit for a receiving party: recompile the plan under the receipt's own
 * options and show the receipt names exactly what the plan compiles to. Pure.
 */
export function verifyCompilationReceipt(input, receipt, { completions = [] } = {}) {
  if (!isObject(receipt) || receipt.type !== 'MediaPlanCompilationReceipt' || receipt.contract !== MEDIA_PLAN_CONTRACT_ID) return frozen({ ok: false, reason: 'not a compile-media-plan/1 receipt' });
  if (!isObject(receipt.options) || !Array.isArray(receipt.targets)
    || !Object.hasOwn(receipt.options, 'model') || !Object.hasOwn(receipt.options, 'maxClipSeconds')
    || !Array.isArray(receipt.options.completionsConsulted)) return frozen({ ok: false, reason: 'receipt options and targets are required' });
  const again = compileMediaPlan(input, { targets: receipt.targets, model: receipt.options.model, maxClipSeconds: receipt.options.maxClipSeconds, completions });
  if (!again.ok) return frozen({ ok: false, reason: 'plan no longer compiles', refusals: again.refusals });
  // Every carried field is authoritative to a receiver, including warnings and checks.
  // Canonical comparison tolerates key order, not omissions, changed metadata or extra fields.
  let ok = false;
  try { ok = canonicalJson(receipt) === canonicalJson(again.receipt); }
  catch { return frozen({ ok: false, reason: 'receipt must be canonical JSON data' }); }
  return frozen({ ok, reason: ok ? null : 'receipt does not match the complete recompilation (plan, options, checks, warnings or outputs differ)' });
}
