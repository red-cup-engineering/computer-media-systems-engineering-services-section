# Media-plan renderer receiving contract

## Required world relationship and owner

One admitted shared MediaPlan must drive the existing deterministic procedural
renderer, with frame count, geometry, duration, captions, assets and music
preserved from its compile receipt. This is a development-only previsualization,
not accepted artwork, a rights grant, publication or audience receiving.

The governing requirement is
[one-media-plan-drives-every-renderer](https://github.com/red-cup-engineering/computer-media-engineering-services-section/blob/a5989571a6588d2838ba21c2e231352d0350c6cb/lib/agency/requirements/one-media-plan-drives-every-renderer.json).
The existing `render-media-plan/1` adapter and procedural renderer remain the
implementation owners; no new renderer, package or controller is introduced.

Executable custody is **Red Cup Engineering**:
- RedCup receipt commit `26ef1a36e4051632c4938779cc159f859bd01eef` received the
  executable source from Causeway `2ae1a23ce9b2331e89bdfac7ce7505da0983bb9b`.
- Causeway commit `81f2c74a274bd291d9322c286f2cdeab6d7c24ba` removed those
  executable files under the custody rule. At observed Causeway main
  `624bc323ab6e08e7e4c39f427ec0cb216f4703e3`, the former renderer path is absent,
  and Public Fiction's README points to this RedCup checkout's source paths.
- The Group's `science-engineering-operations-parameterize-in-order` rule
  (blob `6938e689d5b11a4607f6bdb16fb24216877599d6`) assigns executable
  implementations to Engineering and situated creative/customer data to Public.

Causeway retains originating stories, creative/editorial acceptance, rights and
public delivery. The root manifest's existing private
`@causeway-services/public-media-services-section` package name is retained;
repository custody migration is not authority to rename a published package.
There is no separately declared renderer child package.

## Refinement and distinguishing checks

| Required guarantee | Realization | Receiving evidence |
|---|---|---|
| Compiled music is independent of visual style | Forward `job.options.music` to the existing score composer; preserve legacy visual-derived default for direct callers | Compare emitted WAV bytes to the score owner's selected profile for harmonic/psychedelic cross-style cases; receipt checks music profile |
| Empty captions are valid | Write the exact compiled SRT; do not invoke libass on an empty track | Empty-caption real MP4 and exact SRT equality |
| Frame replaces scene; overlays are last, in order | Frame suppresses procedural actor motion; moving-scene overlays are a final compositing plane; scene masters include assets | Decode every pixel of opaque frame/overlay fixtures for character-bob and kinetic-rig, and inspect exact embedded SVG assets |
| Known unsupported jobs refuse before writes | Reuse the score, animated-master and rehearsal pure suppliers in renderer preflight | Compiler-admitted boundary fixtures assert the particular supplier failure, coded renderer refusal and absent destination |
| Scratch effects stay under the requested destination | Private render scratch beneath outDir, nested rehearsal scratch, finally cleanup | Zero-cue actual PCM/scratch path and invalid-root refusal; apostrophe/space output-path fixture |
| Existing renderer behavior remains usable | Existing implementation and legacy defaults retained | Original plan tests and byte-identical rebuild regression |

Preflight preserves the actual suppliers' limits rather than weakening them:
score duration at most 300 seconds and at most 5,000 score events; abyssal
animated shot duration at most 120 seconds; rehearsal text at most 300
characters, cue duration at least 180 ms, and at most 120 cues in total.
Other pure supplier refusals are carried as `RENDERER_UNSUPPORTED`.
Actual synthesis/codec failures remain runtime errors, not manufactured successes.

Music `none` remains a documented coded refusal. Voiced rehearsal requires a
real installed eSpeak; zero-cue scratch qualification is not voiced-synthesis
receiving. Byte identity is qualified within the observed toolchain, not promised
between different codecs, fonts or hosts.

## Source-owned test enrollment

`npm run test:media-plan-render` enrolls the original plan-render tests,
the existing microdrama-previsualization regressions, the independent
media-plan-receiving regressions, and the existing abyssal, psychedelic and
development-screenplay compatibility suites. File concurrency is explicitly one. The root `npm test` now also enrolls these
six files alongside its unchanged top-level tests. Required native renderer
tests do not silently skip missing FFmpeg/ffprobe.

The renderer's direct importer closure consists of this adapter, the existing
procedural/abyssal/score/optics/rehearsal modules, Node builtins and published
`@red-cup-engineering/computer-media-engineering-services-section@0.2.0`.
The source-path entrypoint is
`services/public-fiction-media-services-section/apps/render-media-plan.mjs`.
No production fixture, Google request, inference, paid rendering or publication
is part of this test contract.

## Received supplier and stage boundaries

The supplier was natively published at gitHead
`a5989571a6588d2838ba21c2e231352d0350c6cb`.
Its registry archive SHA-256 is
`6f4b0537f2060877689ae1567f978dd3a972571264d1b7a12469ad696a7c5aa0`;
integrity is
`sha512-SOGfHKVh5eSdWrINlUFn5FO/Vk/z4jREWr5GYHAE3Sycvmddtb4WN8r00s2akdg+iFLsEeONfbJlroGzba0mNg==`.
All 48 archive files were received against that exact source. It declares no
dependencies or install lifecycle hooks. Renderer qualification installs that
exact received archive offline with npm, scripts/audit/funding disabled, into an
isolated fixture closure and verifies resolution from the actual adapter.
This is not a canonical full-root install, registry publication of this private
root package, or evidence of any live Causeway consumer using the revision.

The broader root package has genuine additional receiving contracts:
- `json-services-section@1.0.0`: canonical immutable demand/allocation/bid IDs.
- `json-schema-engineering-services-section@0.3.0`: exported retained-stock-screen validation.
- `public-education-services-section@0.0.0`: Education channel/short-service and
  education-media-turn CLI.

All three exact versions returned registry HTTP 404 on 2026-10-25; they are not
unused declarations and are not silently repinned here. They are outside the
standalone renderer's importer closure but block a canonical aggregate
installation/lock and broader service receiving. Full root tests and live
consumer uptake remain unreceived.

The inherited private GitHub workflow is non-blocking and its observed job had
zero executed steps despite an overall success result. This work does not
misrepresent that as native CI receiving, handwrite a generated workflow, apply
the dependency-free no-install profile to a dependency-bearing renderer, or
claim private hosted runner eligibility. A generated registry/toolchain-aware
CI path belongs to the existing packaging and continuous-delivery owners.


Before this source integration, the native GitHub publisher was inspected at
`f7abb30bd00be18ba1815084f99d8918b2273c71`; its unchanged landing-selection
implementation is blob `3bc5cb1502d3a1d461592187c10117a7829b59fb`.
It excludes `private:true` manifests and `lib/legacy` archives. This tree has
exactly five package manifests: the unchanged private root0.1.0 and four legacy
archives. None is eligible for that publisher. The sole repository workflow is
the existing test workflow; this PR adds no release, dispatch or deployment
route. This is source selection evidence, not a claim to have observed a live
publisher invocation or installed consumer after landing.

## Native decoder resource correction

The existing 12-second psychedelic kinetic fixture initially failed on this
FFmpeg 7.1.5 receiver. Diagnostic readback established SIGKILL, not a Node timeout
or an assertion. The unchanged PR1 baseline also failed identically; sampled
FFmpeg RSS reached 5,443,944 KiB with 88 threads. The motion graph bounded filter
and output threads but left each looped PNG decoder automatic.

The existing renderer now places `-threads 1` before every kinetic input `-i`,
retaining the graph, 216 frames, fps, output codec and filter/output limits. The
[FFmpeg option contract](https://ffmpeg.org/ffmpeg.html) makes these per-file
options; an output option does not govern preceding inputs. The same fixture
then passed with sampled peak RSS 683,464 KiB and 20 total threads. These are
observations, not a universal hard memory bound. Timeouts remain unchanged.
Native failures now retain `MediaRendererProcessFailure` cause fields
(tool, exitStatus, signal, spawnCode), including empty-stderr termination.
