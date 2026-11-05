/**
 * Pure data admission for authored and derived sound scores.
 *
 * A score is a frozen JSON S-expression.  These forms are a domain grammar,
 * not additions to SEN's core calculus; the code layer compiles them through
 * the injective JSON-to-SEN bridge.
 */
import { canonicalJson } from "@red-cup-engineering/json-services-section/canonical-json";
import { freezeJson } from "@red-cup-engineering/json-services-section/freeze-json";
import { makeNiUri, isNiUri } from "@red-cup-engineering/uri-services-section/ni-uri";

const object = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const finite = (value) => typeof value === "number" && Number.isFinite(value);
const nonnegative = (value) => finite(value) && value >= 0;
const utf8 = new TextEncoder();

export const contentDigest = (value) => makeNiUri(utf8.encode(canonicalJson(value)));
const immutable = (value) => freezeJson(structuredClone(value));

function fail(path, message) {
  const error = new TypeError(`${path}: ${message}`);
  error.code = "INVALID_SOUND_SCORE";
  throw error;
}

function fields(value, path) {
  if (!object(value)) fail(path, "must be a record");
  return value;
}

function duration(value, path, { optional = false } = {}) {
  if (optional && value === undefined) return;
  if (!nonnegative(value)) fail(path, "must be a finite non-negative number of seconds");
}

const expressionTags = Object.freeze(new Set([
  "narrate", "music", "bed", "cue", "silence", "room-tone",
  "seq", "par", "scene", "gain", "fade", "position", "space", "duck", "tempo",
]));

function admitExpression(candidate, path, addresses) {
  if (!Array.isArray(candidate) || typeof candidate[0] !== "string" || !expressionTags.has(candidate[0])) fail(path, "must be a known tagged score expression");
  const [tag, ...args] = candidate;
  if (tag === "seq" || tag === "par") {
    if (args.length === 0) fail(path, `${tag} needs at least one child`);
    return Object.freeze([tag, ...args.map((child, index) => admitExpression(child, `${path}/${index + 1}`, addresses))]);
  }
  if (tag === "scene") {
    if (args.length !== 2 || typeof args[0] !== "string" || !args[0]) fail(path, "scene needs a nonempty id and one child expression");
    return Object.freeze([tag, args[0], admitExpression(args[1], `${path}/2`, addresses)]);
  }
  if (["gain", "fade", "position", "space", "duck", "tempo"].includes(tag)) {
    if (args.length !== 2) fail(path, `${tag} needs an options record and one child expression`);
    const options = immutable(fields(args[0], `${path}/1`));
    if (tag === "gain" && !finite(options.db)) fail(`${path}/1/db`, "must be finite dB");
    if (tag === "fade" && (!nonnegative(options.inSeconds ?? 0) || !nonnegative(options.outSeconds ?? 0))) fail(`${path}/1`, "fade times must be non-negative");
    if (tag === "position" && ["azimuth", "elevation", "distance"].some((key) => options[key] !== undefined && !finite(options[key]))) fail(`${path}/1`, "position coordinates must be finite");
    if (tag === "tempo" && (!finite(options.factor) || options.factor <= 0)) fail(`${path}/1/factor`, "must be positive");
    return Object.freeze([tag, options, admitExpression(args[1], `${path}/2`, addresses)]);
  }
  if (args.length !== 1) fail(path, `${tag} needs exactly one options record`);
  const options = immutable(fields(args[0], `${path}/1`));
  if (tag === "narrate") {
    if (typeof options.id !== "string" || !options.id || typeof options.speakerId !== "string" || !options.speakerId || typeof options.text !== "string" || !options.text.trim()) fail(path, "narrate needs id, speakerId, and nonempty text");
    const anchor = fields(options.anchor, `${path}/1/anchor`);
    if (typeof anchor.chapter !== "string" || !Number.isInteger(anchor.paragraph) || !Number.isInteger(anchor.sentence)) fail(`${path}/1/anchor`, "needs chapter, paragraph, and sentence manuscript coordinates");
  } else if (tag === "silence" || tag === "room-tone") {
    duration(options.durationSeconds, `${path}/1/durationSeconds`);
  } else {
    if (typeof options.id !== "string" || !options.id) fail(path, `${tag} needs an id`);
    duration(options.durationSeconds, `${path}/1/durationSeconds`, { optional: tag === "music" });
    if (options.seed === undefined) fail(`${path}/1/seed`, `${tag} must declare a deterministic seed`);
    if (tag === "music" && typeof options.engine !== "string") fail(`${path}/1/engine`, "music must name its existing engine");
    if ((tag === "bed" || tag === "cue") && typeof options.generator !== "string") fail(`${path}/1/generator`, `${tag} must name its existing generator`);
  }
  const primitive = Object.freeze([tag, options]);
  addresses.push(Object.freeze({ tag, id: options.id ?? `${tag}:${path}`, address: contentDigest(primitive) }));
  return primitive;
}

/** Admit a SoundScore version 1 and bind both the score and every primitive. */
export function admitSoundScore(candidate) {
  if (!Array.isArray(candidate) || candidate[0] !== "score" || candidate.length !== 3) fail("/", "score must be [score, metadata, expression]");
  const metadata = immutable(fields(candidate[1], "/1"));
  if (metadata.type !== "SoundScore" || metadata.version !== 1 || typeof metadata.id !== "string" || !metadata.id || typeof metadata.title !== "string" || !metadata.title || typeof metadata.language !== "string" || !metadata.language) fail("/1", "metadata needs SoundScore type/version, id, title, and language");
  if (!Number.isInteger(metadata.seed)) fail("/1/seed", "must be an integer so stochastic renderers are reproducible");
  const primitiveAddresses = [];
  const expression = admitExpression(candidate[2], "/2", primitiveAddresses);
  const body = Object.freeze(["score", metadata, expression]);
  return Object.freeze({ type: "AdmittedSoundScore", version: 1, score: body, digest: contentDigest(body), primitiveAddresses: Object.freeze(primitiveAddresses) });
}

function voice(value, path) {
  const candidate = immutable(fields(value, path));
  if (typeof candidate.adapter !== "string" || !candidate.adapter || typeof candidate.voice !== "string" || !candidate.voice) fail(path, "voice needs adapter and voice identifiers");
  return candidate;
}

export function admitAudioplayCast(candidate, admittedScore) {
  if (!object(candidate) || candidate.type !== "AudioplayCast" || candidate.version !== 1 || !Array.isArray(candidate.members)) fail("/cast", "cast must be AudioplayCast version 1 with members");
  const members = candidate.members.map((member, index) => {
    const row = fields(member, `/cast/members/${index}`);
    if (typeof row.speakerId !== "string" || !row.speakerId) fail(`/cast/members/${index}/speakerId`, "must be nonempty");
    return immutable({ ...row, voice: voice(row.voice, `/cast/members/${index}/voice`) });
  });
  const ids = members.map(({ speakerId }) => speakerId);
  if (new Set(ids).size !== ids.length) fail("/cast/members", "speaker assignments must be unique");
  if (admittedScore) {
    const speakers = new Set(admittedScore.primitiveAddresses.filter(({ tag }) => tag === "narrate").map(({ id }) => {
      const find = (expr) => expr[0] === "narrate" && expr[1].id === id ? expr[1].speakerId : ["seq", "par"].includes(expr[0]) ? expr.slice(1).map(find).find(Boolean) : expr[0] === "scene" ? find(expr[2]) : ["gain", "fade", "position", "space", "duck", "tempo"].includes(expr[0]) ? find(expr[2]) : null;
      return find(admittedScore.score[2]);
    }));
    const missing = [...speakers].filter((speakerId) => !ids.includes(speakerId));
    if (missing.length) fail("/cast/members", `missing voice assignments for ${missing.join(", ")}`);
  }
  const body = immutable({ type: "AudioplayCast", version: 1, members });
  return Object.freeze({ ...body, digest: contentDigest(body) });
}

export function createAudioplayProductionManifest({ score, cast, pronunciationLexicon = [], soundDesign = {}, renderer, projections = [], extensions = {} }) {
  if (score?.type !== "AdmittedSoundScore" || cast?.type !== "AudioplayCast") fail("/manifest", "manifest needs an admitted score and cast");
  const render = immutable(fields(renderer, "/manifest/renderer"));
  if (typeof render.id !== "string" || typeof render.version !== "number") fail("/manifest/renderer", "needs id and numeric version");
  const body = immutable({
    type: "AudioplayProductionManifest", version: 1,
    scoreDigest: score.digest, castDigest: cast.digest,
    pronunciationLexicon, soundDesign, renderer: render, projections,
    extensions: {
      objectAudio: extensions.objectAudio ?? { status: "designed", standard: "ITU-R BS.2076 ADM", renderer: null },
      readAlong: extensions.readAlong ?? { status: "designed", anchors: "chapter/paragraph/sentence", format: null },
      livePlayer: extensions.livePlayer ?? { status: "designed", sceneSwitching: true, stateAnchors: [] },
    },
  });
  return Object.freeze({ ...body, digest: contentDigest(body) });
}

/** Lift the existing stable narration layer into the first complete score. */
export function scoreFromNarrationLayer(layer, { seed = 561 } = {}) {
  if (layer?.type !== "SoundScoreNarrationLayer" || !Array.isArray(layer.chapters)) fail("/layer", "needs a SoundScoreNarrationLayer");
  const chapterExpressions = layer.chapters.map((chapter) => ["scene", `chapter-${chapter.index}`, ["seq", ...chapter.events.map((event) => {
    if (event.type === "narrate") return ["narrate", { id: event.id, speakerId: event.speakerId, text: event.text, anchor: event.anchor, delivery: { style: event.style ?? "narration", markers: event.markers ?? [] } }];
    if (event.cue === "room-tone") return ["room-tone", { durationSeconds: event.durationSeconds, seed: `${seed}:room:${event.id}` }];
    if (event.text) return ["narrate", { id: event.id, speakerId: event.speakerId ?? "narrator", text: event.text, anchor: { chapter: chapter.path, paragraph: -1, sentence: -1, contentDigest: contentDigest(event.text) }, delivery: { style: event.style ?? "credit" } }];
    return ["silence", { durationSeconds: event.durationSeconds ?? 0 }];
  })]]);
  return admitSoundScore(["score", { type: "SoundScore", version: 1, id: layer.slug, title: layer.title, author: layer.author, language: layer.language, seed, source: { kind: "derived-narration-layer", digest: layer.digest } }, ["seq", ...chapterExpressions]]);
}

export const isNiDigest = isNiUri;

