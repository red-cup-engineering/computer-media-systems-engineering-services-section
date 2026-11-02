# @red-cup-engineering/computer-media-systems-engineering-services-section

<!-- 561-group-standards:badges:start -->
[![Red Cup Engineering](https://img.shields.io/badge/561%20Group-Red%20Cup%20Engineering-c0392b)](https://github.com/red-cup-engineering)
[![License: MIT](https://img.shields.io/badge/license-MIT-c0392b)](LICENSE)
[![Indigenous data: CARE](https://img.shields.io/badge/Indigenous%20data-CARE-4b6f44)](https://github.com/red-cup-engineering/.github/blob/main/GOVERNANCE.md)
[![Tips welcome](https://img.shields.io/badge/tips-welcome-d4a017)](https://github.com/561-group/.github/blob/main/TIPS.md)
<!-- 561-group-standards:badges:end -->

Service boundary for representing, transforming, and observing computer media content. Also Causeway Public Media demand, allowance allocation, performance evidence, artifact review, channel formation and public distribution (received from red-cup-engineering/media-engineering-services-section).

Owns capabilities whose primary nouns are computer media content, including
audio, images, and video.


## Web raster candidates — first Green Web customer

The original Media owner now exposes an opt-in `./raster/web-variants`
producer, `encodeWebRasterVariants(bytes,{source,width,height,formats,allowLossyPreview})`.
This is **real file encoding**, not a declarative sustainability score:
- It uses the original machine's locally installed ffprobe/ffmpeg tools, with
  bounded source bytes, pixel dimensions, output bytes, subprocess time and
  one-process-at-a-time candidate generation. The actual provider runtime
  **must** supply audited, supported codecs and the usual ffmpeg sandboxing;
  this source alone does not establish safe remote untrusted-image processing.
- It admits PNG/JPEG source bytes and caller-asserted licensed derivative
  authority; computes original/output SHA-256, exact byte sizes and local
  encode wall time; supplies AVIF and WebP candidates or explicit grayscale
  dithered PNG previews. Dithering must be explicitly requested with
  `allowLossyPreview: true`.
- It returns output Buffers and provenance **without installing, publishing,
  selecting a winner or fetching anything**. Actual publication, rights
  validation, original-image fallback, human-visible information fidelity,
  accessibility, browser decoding and customer acceptance are separate
  receiving obligations. In particular, a dithered chart is only a preview,
  **not** a qualified substitute for an information-bearing color graph.
- Its `electricity` and `greenhouseGases` fields are null, not guessed
  from transfer bytes or encoding wall time. No source variant is called
  eco-superior before a matched functional-task study.
- Run `npm test` under Node 22+ with local ffmpeg/ffprobe and AVIF/WebP/PNG
  encoders; native tests fabricate their own rights-declared categorical
  image and assert successful real codecs, refusal cases and unknown impact.
  These tests are not an energy meter or in-browser comparison.

Owner/receivers: [Computer Media issue #3](https://github.com/red-cup-engineering/computer-media-engineering-services-section/issues/3),
[Lenticule Science preregistration](https://github.com/lenticule-science/science-services-section/pull/284),
[TUFTE original rendering consumer](https://github.com/red-cup-engineering/web-page-tiling-engine/issues/23),
[Causeway original build evidence](https://github.com/causeway-services/public-web-services-section/pull/24), and
[Causeway original buyer](https://github.com/causeway-services/public-services-section/pull/93).
The feature is source-stage pending independent native packaging, deployed
consumer and actually measured customer outcomes.
## Source-bound OpenTimelineIO rendering

The `./otio-render` export owns one bounded, **actual** computer-media
transformation: an existing OpenTimelineIO `Timeline.1` with a single video
`Track.1` and ordered `Clip.2` source ranges is cut and rendered to a new
H.264/AAC MP4 using FFmpeg. It accepts source-relative milliseconds via
`RationalTime.1`, verifies each original file's RFC 6920 SHA-256 `ni:`
identity, probes original video/audio streams with FFprobe, refuses unsupported
effects, and observes the completed movie's duration and content identity.

The original edited `.otio` is upstream and remains editable. The returned
`SourceBoundOtioRenderedVideo` receipt identifies the concrete output bytes
and exact upstream source NIs, **not** film approval. The caller still owns
rights, visual-argument review, independent editorial receiving, closed captions,
cost receipts, delivery, and public-platform readback. Use
`renderOtioVideoCuts({editPath, sourceMedia, outputPath})`, with each sourceMedia
entry carrying `filePath`, `mediaType`, and `sourceVideoNi`. There is no
hidden video generation, network I/O, new editing JSON format, or SignCell
replacement.

Current supported profile: 2–32 flat, video-only OTIO clips in one Video
track, source-relative exact-millisecond ranges, 24/25/30/60 fps, normalized
video and stereo audio; transitions, time warps and extra tracks *refuse* rather
than silently disappear. This is not a complete NLE or animation studio. The
native source suite uses real generated red/blue test-video bytes to prove
that output edits show actual changed footage rather than six renamed markers.

## Causeway Public Media


Received 2026-10-24 from causeway-services/public-media-services-section@2ae1a23ce9b2331e89bdfac7ce7505da0983bb9b

Executable code moved here verbatim, at the same relative paths, from the section repository above
(custody rule `science-engineering-operations-parameterize-in-order`: Red Cup Engineering holds all
executable code; the section keeps its instance data).

Where code read the section's own data by relative path, that root is now a parameter
(environment variable named in the code; default is the current working directory). Run the code
with the section checkout as cwd, or set the variable to the section checkout.


Tests: `npm test` (dependencies are private/workspace packages and may not install; CI is non-blocking).
