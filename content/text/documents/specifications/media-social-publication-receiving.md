# Media social publication: independent receiving before public-use

**Engineering source stage.** This record qualifies an existing social media delivery path; it is not an editorial release, an authenticated platform session, a publisher credential, a public post, a customer account, or evidence of measured engagement.

## Recovered original owners

The Group's source-owned operating demand is [Causeway Public Web2 #14](https://github.com/causeway-services/public-web2-services-section/issues/14): an accountable social-presence service across distinct communities, account faces, platforms and native verbs, with consent, policy admission and observation → authorization → execution → receipt → readback → settlement. The first real executable consumer already exists in Red Cup Media Engineering at `src/accepted-media-publication.mjs`. It selects accepted producer artifacts through the original `MediaNeed`, allocation, artifact-review, binary custody and Flow delivery register.

The original social adapter is News Property's `src/distribute.mjs`, selected through the published `@red-cup-engineering/news-property` dependency. Its branch candidate for deterministic Bluesky record keys and public readback is [News Property source branch](https://github.com/red-cup-engineering/news-property/tree/fix/bluesky-idempotent-public-receiving-20261027). Those changes are **not installed** until the original producer's native tests and release are received. Media Engineering presently selects `@red-cup-engineering/news-property@0.2.0`; this source branch does **not** change the package pin without a qualified upstream release.

## A two-stage public use contract

A generated image is not an article, and an accepted image is not authority to distribute. The existing source requires a rights-reviewed accepted asset, exact SHA-256 bytes, metadata sanitization, nonempty accessible image description, original consumer's source URL, compatible destination and an accepted original provider completion. That review must explicitly include a `distribution` packet with the authorized Bluesky handle, native text and canonical link before the social lane runs.

The critical additional distinction is that a PDS `createRecord` acknowledgement is not proof that the public post has actually become readable.

| Original allocation state | New required source evidence | Effect |
| --- | --- | --- |
| `generated` | Accepted media bytes, original media need and explicit distribution intent | May attempt a keyed post, but is not public use |
| `delivered` | Source-authenticated `at://DID/app.bsky.feed.post/TID` and CID from the selected provider record, persisted in the original semantic allocation journal | The original provider accepted one exact record; public discovery remains unknown |
| `public-use` | Separate unauthenticated AppView observation of matching DID, URI, CID, text, canonical link and image alt, followed by the original Flow delivery receipt | A provider-visible post was independently read back and the original delivery journal settled |
| `released` / `refused` | Original rejected review or legitimate refusal | No public post attempted merely because a media demand exists |

An unavailable or lagging public AppView leaves the allocation **delivered** and records an obstruction, rather than pretending public use or requiring another person to restate the original intent. The publisher's aggregate `status` is `held` when any original source or readback obstruction remains, even if the bounded scan finished; `complete` is reserved for scans with no such open obstruction. This is not a promise that all customer outcomes are settled. On a subsequent qualified attempt the same source review time and allocation yield the same original AT Protocol record key. The News Property adapter must reconcile the same DID/collection/key/content with its PDS, not create a second post because an earlier API result was lost. An inconsistent CID, wrong account, unexpected URI, missing alt, or unretrievable public post fails closed. This engineering stage cannot prove that followers received the post or benefited from it.

The `postBluesky` and `observeBlueskyPost` verbs are separate: the former performs credentialed effects under an authorized account; the latter performs independent public visibility observation, without leaking the account's credential into a public AppView request. Neither action infers an engagement outcome, direct-message consent or audience relationship.

## Native receiving and negative cases

Under the qualified original Media Engineering package run `npm run test:social-receiving` and the original complete `npm test`, using the installed News Property producer. The pure tests check that old providers without deterministic replay and independent readback are unavailable; an API acknowledgement alone refuses; and a different DID, record key, CID or public source refuses.

The original `test/accepted-media-publication.test.mjs` now tests the complete existing semantic allocation workflow: first API acknowledgement + AppView 404 leaves the allocation delivered, with no Flow public-use receipt; a second attempt uses the same deterministic key, recovers the same record, independently verifies it, advances the original journal to public-use, and stops further posting. Another test proves missing public-readback capability blocks before any provider effect. The native source-and-journal integration requires the actual dependency graph; a passing pure fixture is not installed acceptance.

The current implementation is intentionally Bluesky-only because that is the actual supported image-distribution consumer. Media-neutral demand, captions/transcripts for video, authenticated alternative platforms, private consent and service qualification remain at their existing owners. A generic platform scheduler that drops the distinctions between source work, accepted media, authorized action, provider record, public presence and human benefit would be a regression.

## Competitive target and operating discipline

Products such as [Buffer](https://buffer.com/resources/social-media-scheduling-tools/), [Sprout Social](https://sproutsocial.com/social-media-management/), [Metricool](https://metricool.com/planner/) and [Fedica](https://fedica.com/platforms/) advertise multi-platform calendars, collaboration, approval, engagement and reporting. These are company-described capabilities, not independently verified results for the 561 Group.

To *meet* their real workflows, the Group must offer multiple consented accounts, platform-native media treatment and action semantics, approval queues, calendar and inbox visibility, compliant posting, metrics and client receiving. To *beat* them on a properly controlled job, measure independently: exactly one provider effect under repeated attempts; source-evidence continuity from an accepted claim to platform publication; no unauthorized cross-Person effect; separately witnessed public record and actual readership; time/cost per accepted useful conversation or referral; openness, portability and operational recoverability. A source test cannot claim that threshold has been met.

Apply PACE-S/MAPE-K: recover old work and observed effects; monitor permitted source and community needs; analyze native platform affordances and customer mandate; plan bounded publish/respond/observe/abstain decisions; verify authority; execute idempotently when actually authorized; independently receive outcomes; update the original institution's knowledge/work. Hourly is a potential review cadence, not a minimum posting requirement.

## Rights, custody and remaining release gates

Research qualifies factual content; the client/consumer's editorial office and rights-holder authorize voice/media/publication; Red Cup owns original executable adapters; Coesite owns operating credential references and caps; Causeway owns public service contracting, account connection and independent receiving; MetroPlat should eventually own durable Work and ability to execute the whole cycle without repeated ChatGPT prompts.

The source patch does not connect, create or impersonate any external account. No credentials or platform tokens are stored in repository source. Tests use source-local fixtures and fake providers. Before this is a product, receive the qualified News Property original package release, Media Engineering's exact dependency update and native suite, one consented customer/Person and platform account, a real posted source-qualified artifact, public and outside reader observations, and a legitimate beneficiary's acceptance. Without that complete chain, report **candidate source and pending external receiving** rather than “published”, “federated”, “engaged” or “revenue”.
