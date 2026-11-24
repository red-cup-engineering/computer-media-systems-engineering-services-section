# Golden PNGs

This repository specifies a **golden PNG** workflow: a narrowly-defined, byte-stable image output contract for browser and worker-based graphics pipelines (Canvas and WebGL), designed so rendered images can be treated as *deterministic artifacts* rather than opaque, environment-dependent blobs.

The goal is not visual fidelity across platforms, but **bitwise reproducibility under explicitly constrained conditions**, enabling PNG files to function as golden files in tests, CI, archival datasets, and content-addressed systems.

---

## Problem Statement

Modern browser rendering stacks are *intentionally non-deterministic* at the byte level. Identical drawing code can produce different PNG encodings across:

- Browsers (Chromium, Gecko, WebKit)
- GPU vendors and drivers
- ANGLE / backend choices
- Color-management defaults
- Precision qualifiers and antialiasing paths
- PNG serialization implementations

As a result, naïve uses of `canvas.toDataURL()` or even `OffscreenCanvas.convertToBlob()` yield images that are visually identical but **byte-inequivalent**, breaking reproducible builds, snapshot tests, and content hashing.

This repository defines the minimal additional constraints required to close that gap.

---

## Definition: Golden PNG

A **golden PNG** is a PNG file produced by a rendering pipeline that satisfies all of the following properties:

1. **Byte-stable**: repeated renders under the same declared environment produce identical byte sequences.
2. **Environment-declared**: all sources of non-determinism are either fixed, disabled, or recorded.
3. **Canonicalized**: pixel data and PNG chunk layout are normalized to a single representation.
4. **Diffable**: equality is determined by byte comparison, not decoded pixel comparison.

This is a *derived* concept, local to this repository, and depends on explicit constraints listed below.

---

## Rendering Constraints (Normative)

A golden PNG pipeline **MUST** satisfy all of the following:

### Canvas & Encoding
- Rendering occurs on an `OffscreenCanvas`.
- Output is obtained via `OffscreenCanvas.convertToBlob({ type: "image/png" })`.
- No use of `toDataURL()` or visible DOM canvases.

### Color Space
- All shader math occurs in linear space.
- Final fragment output is explicitly converted to sRGB.
- No implicit color-profile embedding.
- PNGs contain no ICC profile chunks.

### WebGL Configuration
- Antialiasing disabled.
- Blending modes fixed and explicitly declared.
- All GLSL precision qualifiers explicitly specified (`highp` where arithmetic matters).
- No reliance on implementation-defined behavior (e.g., undefined NaN handling).

### Geometry & Rasterization
- Integer-aligned geometry where possible.
- No subpixel positioning without explicit rounding.
- No time-dependent uniforms or randomness.

### Metadata
- No timestamps, textual metadata, or non-deterministic ancillary chunks.
- PNG chunk order is fixed and.

---

## Canonicalization

Golden PNGs are compared **after canonicalization**, which includes:

- Stripping non-essential PNG chunks.
- Enforcing a fixed chunk ordering.
- Normalizing zlib compression parameters if re-encoding is required.

This step is intentionally external to the browser, typically performed by a small deterministic tool in CI.

---

## Reference Pipeline

A typical golden PNG flow looks like:

1. Worker renders to `OffscreenCanvas`.
2. Canvas exported via `convertToBlob()`.
3. Blob written to disk or buffer.
4. Canonicalization tool normalizes PNG structure.
5. Resulting file committed or compared byte-for-byte.

The browser is treated as a *renderer*, not a serializer of record.

---

## Non-Goals

This project explicitly does **not** attempt to:

- Guarantee cross-GPU pixel equivalence under unconstrained shaders.
- Preserve perceptual color accuracy outside sRGB.
- Support lossy formats.
- Abstract away platform differences automatically.

If you want “it looks the same,” this repo is the wrong tool. If you want “the bytes are the same,” this repo is narrowly for that.

---

## Use Cases

Golden PNGs are appropriate for:

- Rendering snapshot tests in CI.
- Visual regression testing where diffs must be machine-checkable.
- Deterministic demo datasets.
- Content-addressed image artifacts.
- Worker-only rendering pipelines.

They are *especially* useful when images participate in larger reproducible systems (hashes, Merkle trees, provenance graphs).

---

## Status

This repository is a **specification-first** project. Tooling, reference implementations, and conformance tests are expected to evolve, but the constraints described here are treated as normative unless explicitly revised.

Expect browser quirks. Expect to pin versions. Expect to record metadata. That is the cost of determinism.

---

## License

MIT
