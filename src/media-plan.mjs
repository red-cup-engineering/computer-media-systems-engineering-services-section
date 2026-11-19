/**
 * Media plan: the one upstream contract a script -> scenes -> shots -> assets ->
 * captions -> audio -> render target -> publication metadata plan travels in, so
 * that Google Flow generation and the deterministic (procedural) renderer consume
 * the same plan. Pure: no I/O, no clock, no network, no randomness.
 *
 * This module is the DATA half: the schema's executable admission (precondition),
 * canonical identity, and small derivations both consumers share. The compilers
 * (plan -> Flow queue orders, plan -> deterministic render job, plan -> publication
 * metadata) live in ./media-plan-compile.mjs. The JSON Schema is
 * data/schema/media-plan.schema.json; admission here is the stricter, cross-field
 * check that a schema cannot express (references resolve, timing is conserved).
 *
 * Admission never throws for plan content. It answers every refusal at once, each
 * with a stable code and a path, so a caller (or a bazaar contract) can act on codes.
 */
import { createHash } from 'node:crypto';
import { isMediaInertSvg } from './media-inert-svg.mjs';

export const MEDIA_PLAN_KIND = 'MediaPlan';
export const MEDIA_PLAN_VERSION = 1;

const SLUG = /^[a-z0-9][a-z0-9-]{0,79}$/u;
const NI = /^ni:\/\/\/sha-256;[A-Za-z0-9_-]{43}$/u;
const SOURCE_REVISION = /^(?:sha256:[a-f0-9]{64}|git:[a-f0-9]{40}|ni:\/\/\/sha-256;[A-Za-z0-9_-]{43})$/u;
const DOI = /^10\.\d{4,9}\/[^\s<>"]+$/u;
const LANGUAGE = /^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/u;
const URL_HTTPS = /^https:\/\/[^\s<>"]+$/u;
const isNi = (value) => typeof value === 'string' && NI.test(value);
const whenAbsent = (value, fallback) => value === undefined ? fallback : value;

export const ASPECTS = Object.freeze(['9:16', '16:9']);
export const LINK_RELS = Object.freeze(['paper', 'source', 'dataset', 'series', 'other']);
export const VISUAL_MODES = Object.freeze(['generative', 'deterministic', 'either']);
export const TARGETS = Object.freeze(['flow', 'deterministic']);
export const STYLES = Object.freeze(['abstract', 'abyssal-glass', 'abyssal-psychedelic']);
export const MOTIONS = Object.freeze(['still', 'character-bob', 'kinetic-rig']);
export const MUSIC_PROFILES = Object.freeze(['none', 'harmonic', 'psychedelic']);
export const VOICES = Object.freeze(['none', 'rehearsal']);
export const ASSET_ROLES = Object.freeze(['frame', 'overlay']);
export const PRIVACY = Object.freeze(['private', 'unlisted', 'public']);

/** Stable stringification: object keys sorted, no whitespace. Identity is taken over this. */
export function canonicalJson(value) {
  if (value === null || typeof value !== 'object') {
    if (value === undefined) throw new TypeError('undefined has no canonical form');
    if (typeof value === 'number' && !Number.isFinite(value)) throw new TypeError('non-finite number has no canonical form');
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  return `{${Object.keys(value).filter((k) => value[k] !== undefined).sort().map((k) => `${JSON.stringify(k)}:${canonicalJson(value[k])}`).join(',')}}`;
}

export const sha256Hex = (data) => createHash('sha256').update(data).digest('hex');
/** The content address (RFC 6920 NI, as the Group writes it) of some bytes or text. */
export const niOf = (data) => `ni:///sha-256;${createHash('sha256').update(data).digest('base64url')}`;
export const niFromHex = (hex) => `ni:///sha-256;${Buffer.from(hex, 'hex').toString('base64url')}`;
export const hexFromNi = (ni) => (isNi(ni) ? Buffer.from(ni.slice('ni:///sha-256;'.length), 'base64url').toString('hex') : null);

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const deepFreeze = (v) => {
  if (v && typeof v === 'object' && !Object.isFrozen(v)) {
    Object.freeze(v);
    for (const key of Object.keys(v)) deepFreeze(v[key]);
  }
  return v;
};

class Refusals {
  constructor() { this.list = []; }
  add(code, path, message) { this.list.push(Object.freeze({ code, path, message })); }
  closed(value, path, fields) {
    for (const key of Object.keys(value)) if (!fields.includes(key)) this.add('FIELD_UNKNOWN', path ? `${path}.${key}` : key, 'field is not declared by the MediaPlan schema');
  }
  text(value, path, { max = 20000, required = true } = {}) {
    if (value === undefined && !required) return undefined;
    if (typeof value !== 'string' || !value.trim() || value.length > max) {
      this.add('FIELD_TEXT', path, `needs nonempty text of at most ${max} characters`);
      return undefined;
    }
    return value;
  }
  slug(value, path, { required = true } = {}) {
    if (value === undefined && !required) return undefined;
    if (typeof value !== 'string' || !SLUG.test(value)) {
      this.add('FIELD_SLUG', path, 'must be a lowercase slug ([a-z0-9-], at most 80 characters)');
      return undefined;
    }
    return value;
  }
  int(value, path, min, max, { required = true } = {}) {
    if (value === undefined && !required) return undefined;
    if (!Number.isSafeInteger(value) || value < min || value > max) {
      this.add('FIELD_INTEGER', path, `must be an integer in [${min}, ${max}]`);
      return undefined;
    }
    return value;
  }
  oneOf(value, path, allowed, code = 'FIELD_ENUM') {
    if (!allowed.includes(value)) {
      this.add(code, path, `must be one of ${allowed.join(', ')}`);
      return undefined;
    }
    return value;
  }
}

/** True establishes media-inert-svg/1, not general XML validity or arbitrary SVG safety. */
export function svgIsSelfContained(svg) {
  return isMediaInertSvg(svg);
}

function admitLocator(r, value, path, { requireOne = true } = {}) {
  const out = {};
  if (value.identity !== undefined) { if (isNi(value.identity)) out.identity = value.identity; else r.add('LOCATOR_IDENTITY', `${path}.identity`, 'identity must be an exact sha-256 NI (ni:///sha-256;...)'); }
  if (value.url !== undefined) { if (typeof value.url === 'string' && URL_HTTPS.test(value.url) && value.url.length <= 2000) out.url = value.url; else r.add('LOCATOR_URL', `${path}.url`, 'url must be an https URL'); }
  if (value.doi !== undefined) { if (typeof value.doi === 'string' && DOI.test(value.doi)) out.doi = value.doi; else r.add('LOCATOR_DOI', `${path}.doi`, 'doi must look like 10.<registrant>/<suffix>, without a resolver prefix'); }
  if (requireOne && !out.identity && !out.url && !out.doi) r.add('LOCATOR_MISSING', path, 'needs at least one of identity (NI), url or doi');
  return out;
}

function admitCues(r, cues, path, frames, cast, { speaker }) {
  if (cues === undefined) return [];
  if (!Array.isArray(cues) || cues.length > 64) { r.add('FIELD_ARRAY', path, 'must be an array of at most 64 cues'); return []; }
  return cues.map((cue, i) => {
    const p = `${path}[${i}]`;
    if (!isObject(cue)) { r.add('FIELD_OBJECT', p, 'must be an object'); return null; }
    r.closed(cue, p, ['speakerId', 'startFrame', 'endFrame', 'text']);
    const out = {};
    if (speaker) {
      out.speakerId = r.slug(cue.speakerId, `${p}.speakerId`);
      if (out.speakerId && cast && !cast.includes(out.speakerId)) r.add('SPEAKER_NOT_IN_CAST', `${p}.speakerId`, `speaker ${out.speakerId} is not in the shot's characterIds`);
    } else if (cue.speakerId !== undefined) out.speakerId = r.slug(cue.speakerId, `${p}.speakerId`);
    const start = r.int(cue.startFrame, `${p}.startFrame`, 0, Math.max(0, frames - 1));
    const end = r.int(cue.endFrame, `${p}.endFrame`, (start ?? 0) + 1, frames);
    if ((Number.isSafeInteger(cue.startFrame) && cue.startFrame >= frames) || (Number.isSafeInteger(cue.endFrame) && cue.endFrame > frames)) r.add('CUE_OUTSIDE_SHOT', p, `cue lies outside the shot's ${frames} frames`);
    out.startFrame = start; out.endFrame = end;
    out.text = r.text(cue.text, `${p}.text`, { max: 2000 });
    return out;
  }).filter(Boolean);
}

function admitShot(r, raw, path, ctx) {
  if (!isObject(raw)) { r.add('FIELD_OBJECT', path, 'shot must be an object'); return null; }
  r.closed(raw, path, ['id', 'beatId', 'locationId', 'frames', 'characterIds', 'camera', 'action', 'claim', 'ambience', 'dialogue', 'captions', 'visual']);
  const shot = {};
  shot.id = r.slug(raw.id, `${path}.id`);
  if (shot.id) { if (ctx.shotIds.has(shot.id)) r.add('DUPLICATE_ID', `${path}.id`, `shot ${shot.id} is repeated`); ctx.shotIds.add(shot.id); }
  if (raw.beatId !== undefined) {
    shot.beatId = r.slug(raw.beatId, `${path}.beatId`);
    if (shot.beatId && ctx.beatIds.size && !ctx.beatIds.has(shot.beatId)) r.add('UNKNOWN_BEAT', `${path}.beatId`, `beat ${shot.beatId} is not declared in beats`);
  }
  shot.frames = r.int(raw.frames, `${path}.frames`, 1, 36000);
  if (raw.locationId !== undefined) {
    shot.locationId = r.slug(raw.locationId, `${path}.locationId`);
    if (shot.locationId && ctx.locationIds.size && !ctx.locationIds.has(shot.locationId)) r.add('UNKNOWN_LOCATION', `${path}.locationId`, `location ${shot.locationId} is not declared in locations`);
  }
  const cast = Array.isArray(raw.characterIds) ? raw.characterIds : [];
  if (raw.characterIds !== undefined && !Array.isArray(raw.characterIds)) r.add('FIELD_ARRAY', `${path}.characterIds`, 'must be an array');
  shot.characterIds = cast.slice(0, 8).map((c, i) => {
    const id = r.slug(c, `${path}.characterIds[${i}]`);
    if (id && ctx.characterIds.size && !ctx.characterIds.has(id)) r.add('UNKNOWN_CHARACTER', `${path}.characterIds[${i}]`, `character ${id} is not declared in characters`);
    return id;
  }).filter(Boolean);
  if (new Set(shot.characterIds).size !== shot.characterIds.length) r.add('DUPLICATE_ID', `${path}.characterIds`, 'a character appears twice in one shot');
  if (cast.length > 8) r.add('FIELD_ARRAY', `${path}.characterIds`, 'at most 8 characters per shot');
  if (raw.camera !== undefined) shot.camera = r.text(raw.camera, `${path}.camera`, { max: 1000 });
  shot.action = r.text(raw.action, `${path}.action`, { max: 4000 });
  if (raw.claim !== undefined) shot.claim = r.text(raw.claim, `${path}.claim`, { max: 4000 });
  shot.dialogue = admitCues(r, raw.dialogue, `${path}.dialogue`, shot.frames ?? 1, shot.characterIds, { speaker: true });
  shot.captions = admitCues(r, raw.captions, `${path}.captions`, shot.frames ?? 1, null, { speaker: false });
  if (raw.ambience !== undefined) shot.ambience = r.text(raw.ambience, `${path}.ambience`, { max: 1000 });

  const v = raw.visual === undefined ? {} : raw.visual;
  if (!isObject(v)) { r.add('FIELD_OBJECT', `${path}.visual`, 'must be an object'); return shot; }
  r.closed(v, `${path}.visual`, ['mode', 'prompt', 'minSeconds', 'referenceImages', 'generated', 'assets']);
  const visual = { mode: v.mode === undefined ? 'either' : r.oneOf(v.mode, `${path}.visual.mode`, VISUAL_MODES), assets: [] };
  if (v.prompt !== undefined) visual.prompt = r.text(v.prompt, `${path}.visual.prompt`, { max: 6000 });
  if (v.minSeconds !== undefined) visual.minSeconds = r.int(v.minSeconds, `${path}.visual.minSeconds`, 1, 60);
  if (v.referenceImages !== undefined) {
    if (!Array.isArray(v.referenceImages) || v.referenceImages.length < 1 || v.referenceImages.length > 3) r.add('FIELD_ARRAY', `${path}.visual.referenceImages`, '1 to 3 reference images');
    else {
      const labels = new Set();
      visual.referenceImages = v.referenceImages.map((img, i) => {
        const p = `${path}.visual.referenceImages[${i}]`;
        if (!isObject(img)) { r.add('FIELD_OBJECT', p, 'must be an object'); return null; }
        r.closed(img, p, ['label', 'kind', 'identity']);
        const label = r.slug(img.label, `${p}.label`);
        if (label && labels.has(label)) r.add('DUPLICATE_ID', `${p}.label`, 'reference labels are unique');
        labels.add(label);
        const kind = r.oneOf(img.kind, `${p}.kind`, ['character', 'environment', 'object']);
        if (!isNi(img.identity)) r.add('LOCATOR_IDENTITY', `${p}.identity`, 'reference image identity must be an exact sha-256 NI');
        return { label, kind, identity: img.identity };
      }).filter(Boolean);
    }
  }
  if (v.generated !== undefined) {
    if (!Array.isArray(v.generated) || v.generated.length > 16) r.add('FIELD_ARRAY', `${path}.visual.generated`, 'at most 16 accepted generations');
    else visual.generated = v.generated.map((g, i) => {
      const p = `${path}.visual.generated[${i}]`;
      if (!isObject(g)) { r.add('FIELD_OBJECT', p, 'must be an object'); return null; }
      r.closed(g, p, ['completion', 'output', 'prompt', 'mimeType', 'bytes']);
      for (const f of ['completion', 'output']) if (!isNi(g[f])) r.add('LOCATOR_IDENTITY', `${p}.${f}`, `${f} must be an exact sha-256 NI`);
      const out = { completion: g.completion, output: g.output };
      if (g.prompt !== undefined) { if (isNi(g.prompt)) out.prompt = g.prompt; else r.add('LOCATOR_IDENTITY', `${p}.prompt`, 'prompt must be an exact sha-256 NI'); }
      if (g.mimeType !== undefined) out.mimeType = r.text(g.mimeType, `${p}.mimeType`, { max: 100 });
      if (g.bytes !== undefined) out.bytes = r.int(g.bytes, `${p}.bytes`, 0, Number.MAX_SAFE_INTEGER);
      return out;
    }).filter(Boolean);
  }
  const assets = v.assets === undefined ? [] : v.assets;
  if (!Array.isArray(assets) || assets.length > 16) r.add('FIELD_ARRAY', `${path}.visual.assets`, 'at most 16 assets per shot');
  else {
    visual.assets = assets.map((a, i) => {
      const p = `${path}.visual.assets[${i}]`;
      if (!isObject(a)) { r.add('FIELD_OBJECT', p, 'must be an object'); return null; }
      r.closed(a, p, ['id', 'role', 'mediaType', 'svg', 'identity', 'producer']);
      const out = { id: r.slug(a.id, `${p}.id`), role: r.oneOf(a.role, `${p}.role`, ASSET_ROLES), mediaType: r.oneOf(whenAbsent(a.mediaType, 'image/svg+xml'), `${p}.mediaType`, ['image/svg+xml']) };
      if (out.id) { const key = `${shot.id}/${out.id}`; if (ctx.assetIds.has(key)) r.add('DUPLICATE_ID', `${p}.id`, `asset ${out.id} is repeated in shot`); ctx.assetIds.add(key); }
      if (a.svg !== undefined) {
        if (typeof a.svg === 'string' && a.svg.length <= 400000 && svgIsSelfContained(a.svg)) out.svg = a.svg;
        else r.add('SVG_NOT_SELF_CONTAINED', `${p}.svg`, 'inline asset does not establish the supported media-inert-svg/1 profile (data/schema/media-inert-svg-profile.md); unsupported syntax is not repaired');
      }
      if (a.identity !== undefined) { if (isNi(a.identity)) out.identity = a.identity; else r.add('LOCATOR_IDENTITY', `${p}.identity`, 'identity must be an exact sha-256 NI'); }
      if (out.svg === undefined && out.identity === undefined) r.add('ASSET_UNADDRESSED', p, 'an asset needs inline svg or a content-addressed identity');
      if (out.svg !== undefined && out.identity !== undefined && niOf(out.svg) !== out.identity) r.add('ASSET_IDENTITY_MISMATCH', p, 'identity is not the SHA-256 NI of the inline svg');
      if (a.producer !== undefined) {
        if (isObject(a.producer)) { r.closed(a.producer, `${p}.producer`, ['service', 'spec']); out.producer = { service: r.text(a.producer.service, `${p}.producer.service`, { max: 200 }), ...(a.producer.spec !== undefined ? { spec: r.text(a.producer.spec, `${p}.producer.spec`, { max: 2000 }) } : {}) }; }
        else r.add('FIELD_OBJECT', `${p}.producer`, 'must be an object');
      }
      return out;
    }).filter(Boolean);
  }
  shot.visual = visual;
  return shot;
}

/**
 * PRECONDITION. Admit a media plan.
 * Answers {ok:true, plan} with a frozen, default-filled plan, or {ok:false, refusals}.
 */
export function admitMediaPlan(input) {
  const r = new Refusals();
  if (!isObject(input)) return Object.freeze({ ok: false, refusals: Object.freeze([Object.freeze({ code: 'PLAN_NOT_OBJECT', path: '', message: 'a media plan is a JSON object' })]) });
  r.closed(input, '', ['kind', 'version', 'id', 'title', 'language', 'consumer', 'purpose', 'destination', 'promptRevision', 'aspect', 'fps', 'source', 'links', 'characters', 'locations', 'beats', 'scenes', 'audio', 'captions', 'endCard', 'render', 'publication']);
  if (input.kind !== MEDIA_PLAN_KIND) r.add('PLAN_KIND', 'kind', `kind must be ${MEDIA_PLAN_KIND}`);
  if (input.version !== MEDIA_PLAN_VERSION) r.add('PLAN_VERSION', 'version', `version must be ${MEDIA_PLAN_VERSION}`);
  const plan = { kind: MEDIA_PLAN_KIND, version: MEDIA_PLAN_VERSION };
  plan.id = r.slug(input.id, 'id');
  plan.title = r.text(input.title, 'title', { max: 200 });
  plan.language = input.language === undefined ? 'en' : (typeof input.language === 'string' && LANGUAGE.test(input.language) ? input.language : (r.add('FIELD_LANGUAGE', 'language', 'must be a BCP 47 tag'), undefined));
  plan.consumer = r.text(input.consumer, 'consumer', { max: 200 });
  if (plan.consumer && !/^[A-Za-z0-9][A-Za-z0-9._-]*$/u.test(plan.consumer)) r.add('FIELD_CONSUMER', 'consumer', 'consumer is a stable name ([A-Za-z0-9._-]) as Flow journals it');
  for (const f of ['purpose', 'destination', 'promptRevision']) if (input[f] !== undefined) plan[f] = r.text(input[f], f, { max: 500 });
  plan.aspect = r.oneOf(whenAbsent(input.aspect, '9:16'), 'aspect', ASPECTS);
  plan.fps = r.int(whenAbsent(input.fps, 30), 'fps', 1, 120);

  // Provenance of the plan's own source documents.
  const src = isObject(input.source) ? input.source : (r.add('FIELD_OBJECT', 'source', 'source provenance is required'), {});
  r.closed(src, 'source', ['sourceRevision', 'originRef', 'documents']);
  plan.source = {};
  if (typeof src.sourceRevision === 'string' && SOURCE_REVISION.test(src.sourceRevision)) plan.source.sourceRevision = src.sourceRevision;
  else r.add('SOURCE_REVISION_INEXACT', 'source.sourceRevision', 'needs an exact sha256:<hex>, git:<40 hex> or sha-256 NI source revision');
  if (src.originRef !== undefined) plan.source.originRef = r.text(src.originRef, 'source.originRef', { max: 1000 });
  const docIds = new Set();
  const docs = Array.isArray(src.documents) ? src.documents : (r.add('FIELD_ARRAY', 'source.documents', 'at least one source document is required'), []);
  if (docs.length < 1 || docs.length > 32) r.add('FIELD_ARRAY', 'source.documents', '1 to 32 source documents');
  plan.source.documents = docs.slice(0, 32).map((d, i) => {
    const p = `source.documents[${i}]`;
    if (!isObject(d)) { r.add('FIELD_OBJECT', p, 'must be an object'); return null; }
    r.closed(d, p, ['id', 'role', 'title', 'rightsRef', 'citation', 'identity', 'url', 'doi']);
    const out = { id: r.slug(d.id, `${p}.id`), role: r.slug(d.role, `${p}.role`) };
    if (out.id) { if (docIds.has(out.id)) r.add('DUPLICATE_ID', `${p}.id`, `document ${out.id} is repeated`); docIds.add(out.id); }
    const loc = admitLocator(r, d, p);
    if (!loc.identity && !loc.url && !loc.doi) r.list.splice(r.list.findIndex((x) => x.path === p && x.code === 'LOCATOR_MISSING'), 1, Object.freeze({ code: 'SOURCE_DOCUMENT_UNADDRESSED', path: p, message: 'a source document needs identity (NI), url or doi so the plan can be traced to it' }));
    Object.assign(out, loc);
    for (const f of ['title', 'rightsRef', 'citation']) if (d[f] !== undefined) out[f] = r.text(d[f], `${p}.${f}`, { max: 1000 });
    return out;
  }).filter(Boolean);

  // Links the viewer is sent to (the paper a video is made from, above all).
  const links = input.links === undefined ? [] : input.links;
  if (!Array.isArray(links) || links.length > 16) r.add('FIELD_ARRAY', 'links', 'at most 16 links');
  plan.links = (Array.isArray(links) ? links : []).slice(0, 16).map((l, i) => {
    const p = `links[${i}]`;
    if (!isObject(l)) { r.add('FIELD_OBJECT', p, 'must be an object'); return null; }
    r.closed(l, p, ['rel', 'documentId', 'label', 'identity', 'url', 'doi']);
    const out = { rel: r.oneOf(l.rel, `${p}.rel`, LINK_RELS) };
    if (l.documentId !== undefined) {
      out.documentId = r.slug(l.documentId, `${p}.documentId`);
      if (out.documentId && !docIds.has(out.documentId)) r.add('UNKNOWN_DOCUMENT', `${p}.documentId`, `document ${out.documentId} is not in source.documents`);
    }
    Object.assign(out, admitLocator(r, l, p, { requireOne: out.documentId === undefined }));
    if (l.label !== undefined) out.label = r.text(l.label, `${p}.label`, { max: 200 });
    return out;
  }).filter(Boolean);

  // Cast, places, causal beats.
  const characters = input.characters === undefined ? [] : input.characters;
  const ctx = { shotIds: new Set(), beatIds: new Set(), characterIds: new Set(), locationIds: new Set(), assetIds: new Set() };
  if (!Array.isArray(characters) || characters.length > 32) r.add('FIELD_ARRAY', 'characters', 'at most 32 characters');
  plan.characters = (Array.isArray(characters) ? characters : []).slice(0, 32).map((c, i) => {
    const p = `characters[${i}]`;
    if (!isObject(c)) { r.add('FIELD_OBJECT', p, 'must be an object'); return null; }
    r.closed(c, p, ['id', 'name', 'synthetic', 'visualRef', 'voiceRef']);
    const out = { id: r.slug(c.id, `${p}.id`) };
    if (out.id) { if (ctx.characterIds.has(out.id)) r.add('DUPLICATE_ID', `${p}.id`, `character ${out.id} is repeated`); ctx.characterIds.add(out.id); }
    for (const f of ['name', 'visualRef', 'voiceRef']) if (c[f] !== undefined) out[f] = r.text(c[f], `${p}.${f}`, { max: 500 });
    if (c.synthetic !== undefined) { if (typeof c.synthetic === 'boolean') out.synthetic = c.synthetic; else r.add('FIELD_BOOLEAN', `${p}.synthetic`, 'must be boolean'); }
    return out;
  }).filter(Boolean);
  const locations = input.locations === undefined ? [] : input.locations;
  if (!Array.isArray(locations) || locations.length > 64) r.add('FIELD_ARRAY', 'locations', 'at most 64 locations');
  plan.locations = (Array.isArray(locations) ? locations : []).slice(0, 64).map((l, i) => {
    const p = `locations[${i}]`;
    if (!isObject(l)) { r.add('FIELD_OBJECT', p, 'must be an object'); return null; }
    r.closed(l, p, ['id', 'name']);
    const out = { id: r.slug(l.id, `${p}.id`) };
    if (out.id) { if (ctx.locationIds.has(out.id)) r.add('DUPLICATE_ID', `${p}.id`, `location ${out.id} is repeated`); ctx.locationIds.add(out.id); }
    if (l.name !== undefined) out.name = r.text(l.name, `${p}.name`, { max: 200 });
    return out;
  }).filter(Boolean);
  const beats = input.beats === undefined ? [] : input.beats;
  if (!Array.isArray(beats) || beats.length > 100) r.add('FIELD_ARRAY', 'beats', 'at most 100 beats');
  plan.beats = (Array.isArray(beats) ? beats : []).slice(0, 100).map((b, i) => {
    const p = `beats[${i}]`;
    if (!isObject(b)) { r.add('FIELD_OBJECT', p, 'must be an object'); return null; }
    r.closed(b, p, ['id', 'causeBeatId', 'action', 'consequence', 'kind', 'question']);
    const out = { id: r.slug(b.id, `${p}.id`), causeBeatId: r.slug(b.causeBeatId, `${p}.causeBeatId`), action: r.text(b.action, `${p}.action`, { max: 2000 }), consequence: r.text(b.consequence, `${p}.consequence`, { max: 2000 }) };
    if (out.id && out.causeBeatId) {
      if (ctx.beatIds.has(out.id) || out.id === out.causeBeatId) r.add('DUPLICATE_ID', `${p}.id`, `beat ${out.id} is repeated or self-caused`);
      if (out.causeBeatId !== 'seed' && !ctx.beatIds.has(out.causeBeatId)) r.add('BEAT_CAUSE_UNRESOLVED', `${p}.causeBeatId`, `cause ${out.causeBeatId} is not an earlier beat`);
    }
    if (out.id) ctx.beatIds.add(out.id);
    for (const f of ['kind', 'question']) if (b[f] !== undefined) out[f] = r.text(b[f], `${p}.${f}`, { max: 1000 });
    return out;
  }).filter(Boolean);

  // Scenes and shots.
  const scenes = Array.isArray(input.scenes) ? input.scenes : (r.add('FIELD_ARRAY', 'scenes', 'at least one scene is required'), []);
  if (scenes.length < 1 || scenes.length > 50) r.add('FIELD_ARRAY', 'scenes', '1 to 50 scenes');
  const sceneIds = new Set();
  plan.scenes = scenes.slice(0, 50).map((s, i) => {
    const p = `scenes[${i}]`;
    if (!isObject(s)) { r.add('FIELD_OBJECT', p, 'must be an object'); return null; }
    r.closed(s, p, ['id', 'title', 'shots']);
    const out = { id: r.slug(s.id, `${p}.id`) };
    if (out.id) { if (sceneIds.has(out.id)) r.add('DUPLICATE_ID', `${p}.id`, `scene ${out.id} is repeated`); sceneIds.add(out.id); }
    if (s.title !== undefined) out.title = r.text(s.title, `${p}.title`, { max: 200 });
    const shots = Array.isArray(s.shots) ? s.shots : (r.add('FIELD_ARRAY', `${p}.shots`, 'a scene needs shots'), []);
    if (shots.length < 1 || shots.length > 100) r.add('FIELD_ARRAY', `${p}.shots`, '1 to 100 shots per scene');
    out.shots = shots.slice(0, 100).map((shot, j) => admitShot(r, shot, `${p}.shots[${j}]`, ctx)).filter(Boolean);
    return out;
  }).filter(Boolean);

  // Audio, captions, end card, render, publication.
  const a = input.audio === undefined ? {} : input.audio;
  if (!isObject(a)) r.add('FIELD_OBJECT', 'audio', 'must be an object');
  else r.closed(a, 'audio', ['music', 'dialogue']);
  for (const [field, fields] of [['music', ['profile']], ['dialogue', ['voice']]]) {
    if (a?.[field] !== undefined) {
      if (!isObject(a[field])) r.add('FIELD_OBJECT', `audio.${field}`, 'must be an object');
      else r.closed(a[field], `audio.${field}`, fields);
    }
  }
  plan.audio = {
    music: { profile: r.oneOf(whenAbsent(a?.music?.profile, 'harmonic'), 'audio.music.profile', MUSIC_PROFILES) },
    dialogue: { voice: r.oneOf(whenAbsent(a?.dialogue?.voice, 'none'), 'audio.dialogue.voice', VOICES) },
  };
  const c = input.captions === undefined ? {} : input.captions;
  if (!isObject(c)) r.add('FIELD_OBJECT', 'captions', 'must be an object');
  else r.closed(c, 'captions', ['derive', 'burnedIn']);
  plan.captions = {
    derive: r.oneOf(whenAbsent(c?.derive, 'auto'), 'captions.derive', ['auto', 'dialogue', 'explicit']),
    burnedIn: c?.burnedIn === undefined ? true : (typeof c.burnedIn === 'boolean' ? c.burnedIn : (r.add('FIELD_BOOLEAN', 'captions.burnedIn', 'must be boolean'), true)),
  };
  if (input.endCard !== undefined) {
    const e = input.endCard;
    if (!isObject(e)) r.add('FIELD_OBJECT', 'endCard', 'must be an object');
    else {
      r.closed(e, 'endCard', ['seconds', 'headline', 'text', 'linkRel']);
      plan.endCard = { seconds: r.int(whenAbsent(e.seconds, 3), 'endCard.seconds', 1, 10), linkRel: r.oneOf(whenAbsent(e.linkRel, 'paper'), 'endCard.linkRel', LINK_RELS) };
      for (const f of ['headline', 'text']) if (e[f] !== undefined) plan.endCard[f] = r.text(e[f], `endCard.${f}`, { max: 300 });
    }
  }
  const rd = input.render === undefined ? {} : input.render;
  if (!isObject(rd)) r.add('FIELD_OBJECT', 'render', 'must be an object');
  else r.closed(rd, 'render', ['targets', 'width', 'outputFps', 'style', 'motion']);
  const targets = whenAbsent(rd?.targets, [...TARGETS]);
  // Refusal does not make invalid values safe to normalize: sorting would coerce
  // arbitrary JSON object members. Only a validated target subset may be sorted.
  const validTargets = Array.isArray(targets) && targets.length > 0 && targets.every((t) => TARGETS.includes(t)) && new Set(targets).size === targets.length;
  if (!validTargets) r.add('UNKNOWN_TARGET', 'render.targets', `targets are a nonempty subset of ${TARGETS.join(', ')}`);
  plan.render = {
    targets: validTargets ? [...targets].sort() : [],
    width: r.int(whenAbsent(rd?.width, 360), 'render.width', 180, 1080),
    outputFps: r.int(whenAbsent(rd?.outputFps, 18), 'render.outputFps', 8, 30),
    style: r.oneOf(whenAbsent(rd?.style, 'abstract'), 'render.style', STYLES),
    motion: r.oneOf(whenAbsent(rd?.motion, 'still'), 'render.motion', MOTIONS),
  };
  if (Number.isSafeInteger(plan.render.width) && plan.render.width % 18 !== 0) r.add('GEOMETRY_NOT_9_16', 'render.width', 'width must be a multiple of 18 for exact 9:16 geometry');
  if (plan.render.motion !== 'still' && plan.render.style === 'abstract') r.add('MOTION_NEEDS_ABYSSAL_STAGE', 'render.motion', 'character motion requires an abyssal-glass or abyssal-psychedelic stage');

  const pub = input.publication === undefined ? {} : input.publication;
  if (!isObject(pub)) r.add('FIELD_OBJECT', 'publication', 'must be an object');
  else r.closed(pub, 'publication', ['title', 'description', 'tags', 'privacy', 'requirePaperLink', 'parentVideoId', 'categoryId', 'madeForKids', 'aiDisclosure']);
  plan.publication = {
    title: pub?.title === undefined ? plan.title : r.text(pub.title, 'publication.title', { max: 100 }),
    privacy: r.oneOf(whenAbsent(pub?.privacy, 'private'), 'publication.privacy', PRIVACY),
    requirePaperLink: pub?.requirePaperLink === undefined ? false : (typeof pub.requirePaperLink === 'boolean' ? pub.requirePaperLink : (r.add('FIELD_BOOLEAN', 'publication.requirePaperLink', 'must be boolean'), false)),
    tags: [],
  };
  if (typeof plan.publication.title === 'string' && plan.publication.title.length > 100) r.add('FIELD_TEXT', 'publication.title', 'publication title is at most 100 characters');
  if (pub?.description !== undefined) {
    plan.publication.description = r.text(pub.description, 'publication.description', { max: 4000 });
    if (typeof plan.publication.description === 'string' && /[<>]/u.test(plan.publication.description)) r.add('DESCRIPTION_ANGLE_BRACKETS', 'publication.description', 'YouTube-style descriptions cannot contain < or >');
  }
  if (pub?.tags !== undefined) {
    if (!Array.isArray(pub.tags) || pub.tags.length > 30 || pub.tags.some((t) => typeof t !== 'string' || !t.trim() || /[<>,]/u.test(t))) r.add('FIELD_ARRAY', 'publication.tags', 'at most 30 plain tags without < > or commas');
    else plan.publication.tags = [...pub.tags];
    if (plan.publication.tags.join(',').length > 500) r.add('FIELD_ARRAY', 'publication.tags', 'tags total at most 500 characters');
  }
  for (const f of ['parentVideoId', 'aiDisclosure', 'categoryId']) if (pub?.[f] !== undefined) plan.publication[f] = r.text(pub[f], `publication.${f}`, { max: 1000 });
  if (pub?.madeForKids !== undefined) { if (typeof pub.madeForKids === 'boolean') plan.publication.madeForKids = pub.madeForKids; else r.add('FIELD_BOOLEAN', 'publication.madeForKids', 'must be boolean'); }

  // Cross-field checks a schema cannot say.
  const hasLocator = (l) => l.url || l.doi || l.identity || (l.documentId && plan.source.documents.some((d) => d.id === l.documentId));
  if (plan.publication.requirePaperLink && !plan.links.some((l) => l.rel === 'paper' && hasLocator(l))) r.add('PAPER_LINK_MISSING', 'links', 'publication.requirePaperLink is set but no link with rel "paper" resolves to a url, doi or content address');
  if (plan.endCard && !plan.links.some((l) => l.rel === plan.endCard.linkRel && hasLocator(l))) r.add('ENDCARD_LINK_MISSING', 'endCard.linkRel', `the end card points at rel "${plan.endCard.linkRel}" but no such link resolves`);

  if (r.list.length) return Object.freeze({ ok: false, refusals: Object.freeze(r.list) });
  return Object.freeze({ ok: true, plan: deepFreeze(plan) });
}

/** The plan's content address: SHA-256 NI over its canonical, default-filled form. */
export const mediaPlanId = (plan) => niOf(canonicalJson(plan));

/** Every shot of the plan, in order, with its scene id. */
export function planShots(plan) {
  return plan.scenes.flatMap((scene) => scene.shots.map((shot) => ({ ...shot, sceneId: scene.id })));
}

/** Resolve a link against its source document: the locators the viewer will actually see. */
export function resolveLink(plan, link) {
  const doc = link.documentId ? plan.source.documents.find((d) => d.id === link.documentId) : null;
  return Object.freeze({
    rel: link.rel,
    url: link.url ?? doc?.url ?? null,
    doi: link.doi ?? doc?.doi ?? null,
    identity: link.identity ?? doc?.identity ?? null,
    label: link.label ?? doc?.title ?? null,
    citation: doc?.citation ?? null,
  });
}

/** The visible URL for a resolved link: its URL, else its DOI resolver, else null. */
export const linkHref = (resolved) => resolved.url ?? (resolved.doi ? `https://doi.org/${resolved.doi}` : null);
