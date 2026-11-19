import { createEvidenceJournal } from "@red-cup-engineering/semantic-record-journal-service";

export const MEDIA_PERFORMANCE_OBJECT_KIND = "media-performance-observation";
export const YOUTUBE_PERFORMANCE_CATEGORY = "youtube";
export const YOUTUBE_MEDIA_PERFORMANCE_VERSION = 2;

/**
 * One actual provider identity, two retained generations of the JSONL carrier.
 * Never mutate old journal events, conflate a YouTube ID with a generic media
 * ID, or silently choose between contradictory old/new aliases.
 */
export function youtubeVideoIdOf(observation) {
  const version=observation?.version;
  if(version!==1&&version!==YOUTUBE_MEDIA_PERFORMANCE_VERSION)
    throw new TypeError("YouTube media performance needs a known source version");
  const legacy=observation?.videoId,named=observation?.youtubeVideoId;
  if(legacy!==undefined&&named!==undefined&&legacy!==named)
    throw new TypeError("YouTube videoId conflicts with youtubeVideoId");
  if(version===YOUTUBE_MEDIA_PERFORMANCE_VERSION&&legacy!==undefined)
    throw new TypeError("Version 2 must use youtubeVideoId, not generic videoId");
  const id=version===1?legacy:named;
  if(typeof id!=="string"||!/^[A-Za-z0-9_-]{11}$/u.test(id))
    throw new TypeError("Source YouTube video identity must be exactly eleven provider characters");
  return id;
}
export function parentYouTubeVideoIdOf(observation) {
  const original=observation?.parentVideoId,named=observation?.parentYouTubeVideoId;
  if(original!==undefined&&named!==undefined&&original!==named)
    throw new TypeError("YouTube parentVideoId conflicts with parentYouTubeVideoId");
  if(observation?.version===YOUTUBE_MEDIA_PERFORMANCE_VERSION&&original!==undefined)
    throw new TypeError("Version 2 must use parentYouTubeVideoId, not generic parentVideoId");
  const id=observation?.version===1?original:named;
  if(id!==undefined&&(typeof id!=="string"||!/^[A-Za-z0-9_-]{11}$/u.test(id)))
    throw new TypeError("Source YouTube parent video ID must be valid");
  return id??null;
}

function requiredText(value, label) {
  if (typeof value !== "string" || !value.trim()) throw new TypeError(`${label} must be nonempty text`);
  return value.trim();
}

function validatedObservation(value) {
  if (!value || value.type !== "MediaPerformanceObservation") throw new TypeError("media performance observation type must be MediaPerformanceObservation");
  const observedAt = requiredText(value.observedAt, "observedAt");
  if (!Number.isFinite(Date.parse(observedAt))) throw new TypeError("observedAt must be an instant");
  const provider = requiredText(value.provider, "provider");
  const channel = requiredText(value.channel, "channel");
  if (provider !== "youtube") throw new TypeError("media performance journal currently admits YouTube observations only");
  const youtubeVideoId=youtubeVideoIdOf(value);
  const parentYouTubeVideoId=parentYouTubeVideoIdOf(value);
  const mediaKind = requiredText(value.mediaKind, "mediaKind");
  if(!["long-form","short"].includes(mediaKind)||
    typeof value.youtubeChannelId!=="string"||!value.youtubeChannelId.trim()||
    (value.version===YOUTUBE_MEDIA_PERFORMANCE_VERSION&&!/^UC[A-Za-z0-9_-]{22}$/u.test(value.youtubeChannelId))||
    typeof value.lessonId!=="string"||!value.lessonId.trim())
    throw new TypeError("Media performance requires YouTube channel, lesson and declared film kind");
  if(parentYouTubeVideoId!==null&&mediaKind!=="short")
    throw new TypeError("Only actual YouTube Shorts can claim a parent video");
  // Existing v1 carriers remain byte-content-equivalent across replay. The
  // named identity is projected on READ, not rewritten into another event.
  return Object.freeze(structuredClone({ ...value, observedAt: new Date(observedAt).toISOString(), provider, channel, mediaKind }));
}

/**
 * Project one intact channel-local observation into the Group semantic record journal.
 *
 * The record itself is not re-shaped: the source adapter's raw snapshot/report facets remain
 * available for later analyses. Content identity + the original observedAt make replay idempotent.
 */
export function recordMediaPerformanceObservation({ root, observation, origin } = {}) {
  const record = validatedObservation(observation);
  const log = createEvidenceJournal({ root, objectKind: MEDIA_PERFORMANCE_OBJECT_KIND });
  return log.record({
    category: YOUTUBE_PERFORMANCE_CATEGORY,
    record,
    recordedAt: record.observedAt,
    told: { for: true, against: false },
    origin: origin ?? `youtube-channel:${record.channel}`,
  });
}

/** Project a batch and report how many new journal events were appended. */
export function recordMediaPerformanceObservations({ root, observations, origin } = {}) {
  if (!Array.isArray(observations)) throw new TypeError("observations must be a list");
  const records = observations.map((observation) => recordMediaPerformanceObservation({ root, observation, origin }));
  return Object.freeze({
    type: "MediaPerformanceProjectionReceipt",
    objectKind: MEDIA_PERFORMANCE_OBJECT_KIND,
    observations: records.length,
    appended: records.reduce((sum, receipt) => sum + receipt.appended, 0),
    receipts: Object.freeze(records),
  });
}

/**
 * Query intact shared observations. Filters are projections only; no raw evidence is discarded.
 */
export function readMediaPerformanceObservations({
  root,
  channel,
  youtubeVideoId,
  videoId, // caller compatibility only; new source records never use this field
  mediaKind,
  since,
  until,
} = {}) {
  const parseBound = (value, label) => {
    if (value === undefined) return null;
    const parsed = Date.parse(value);
    if (!Number.isFinite(parsed)) throw new TypeError(`${label} must be an instant`);
    return parsed;
  };
  const from = parseBound(since, "since"), through = parseBound(until, "until");
  if (from !== null && through !== null && from > through) throw new TypeError("since must not be after until");
  if(youtubeVideoId!==undefined&&videoId!==undefined&&youtubeVideoId!==videoId)
    throw new TypeError("Conflicting YouTube video filters");
  const selectedVideoId=youtubeVideoId??videoId;
  if(selectedVideoId!==undefined&&!/^[A-Za-z0-9_-]{11}$/u.test(selectedVideoId))
    throw new TypeError("YouTube video filter requires exact provider identity");
  const rows = createEvidenceJournal({ root, objectKind: MEDIA_PERFORMANCE_OBJECT_KIND })
    .query({ category: YOUTUBE_PERFORMANCE_CATEGORY })
    .map(({ record, id, recordedAt, told, event, origin }) => Object.freeze({ id, recordedAt, told, event, origin, observation: structuredClone(record) }))
    .filter(({ observation }) =>
      (channel === undefined || observation.channel === channel)
      && (selectedVideoId === undefined || youtubeVideoIdOf(observation) === selectedVideoId)
      && (mediaKind === undefined || observation.mediaKind === mediaKind)
      && (from === null || Date.parse(observation.observedAt) >= from)
      && (through === null || Date.parse(observation.observedAt) <= through));

  return Object.freeze(rows);
}

/** Latest observation per provider video, useful for portfolio readouts without losing the history. */
export function latestMediaPerformanceByVideo(input = {}) {
  const latest = new Map();
  for (const row of readMediaPerformanceObservations(input)) {
    const key = `${row.observation.provider}\0${youtubeVideoIdOf(row.observation)}`;
    const previous = latest.get(key);
    if (!previous || String(previous.observation.observedAt).localeCompare(String(row.observation.observedAt)) < 0) latest.set(key, row);
  }
  return Object.freeze([...latest.values()].sort((a, b) =>
    a.observation.channel.localeCompare(b.observation.channel)
    || youtubeVideoIdOf(a.observation).localeCompare(youtubeVideoIdOf(b.observation))));
}
