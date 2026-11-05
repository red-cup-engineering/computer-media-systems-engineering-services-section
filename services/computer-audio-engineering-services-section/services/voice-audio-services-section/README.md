# Voice Audio Services Section

Owns pure data and policy specialized to speech-bearing audio. Provider calls,
process execution, filesystem fabrication, mastering, muxing, and transcription
are systems effects and do not live in this data-layer package.

## Audiobook edition records

`src/audiobook-edition.mjs` describes an edition source by content address,
constructs the generic artifact-fabrication specification candidate, defines
the immutable `audiobook-master-v1` mastering record, computes word error rate,
and admits an independent listener's proof. The source binds the ebook owner's
`SoundScoreNarrationLayer`, StoryBible, voice settings, synthesizer provenance,
and mastering specification.

The mastering record requires mono 44.1 kHz audio, 192 kbps CBR chapter MP3s,
RMS from -23 through -18 dBFS, peaks no higher than -3 dBFS, and a noise floor
no higher than -60 dBFS. These values are data interpreted by the publishing
renderer; this package does not invoke ffmpeg or a speech provider.

The effectful interpreter is
`@red-cup-engineering/computer-systems-publishing-engineering-services-section/audiobook-production`.
It groups stable sentence primitives at the provider boundary, renders score
cues, caches synthesis requests by content address, masters chapter files,
muxes the M4B and runs the injected transcription proof. Automated proof is
only a first pass; `acceptAudiobookEdition()` still requires a separate human
or listening agent and exact artifact and edition-input digests.
