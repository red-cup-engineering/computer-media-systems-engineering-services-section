# Canonical PNG Normalization Tool (Minimal Spec)

This document specifies a **minimal canonicalization step** for PNG files intended to function as *golden PNGs*. The tool defined here is deliberately narrow: it normalizes PNG structure and metadata so that byte equality reflects pixel equality under declared constraints, without reinterpreting rendering semantics.

This specification is **derived**, local to this repository, and assumes inputs already satisfy the rendering constraints defined in the main README.

---

## Scope and Assumptions

- **Scope**: PNG files produced by constrained Canvas/WebGL pipelines.
- **Assumptions**:
  - Image content is sRGB, 8-bit RGBA or RGB.
  - No meaningful ancillary metadata is required.
  - Visual fidelity is already correct; this tool addresses *serialization variance only*.

The tool is not a general-purpose PNG optimizer.

---

## Canonical Form (Normative)

A PNG is considered **canonical** if and only if it satisfies all of the following:

### File Structure
1. PNG signature is standard and unmodified.
2. Chunk order is exactly:
IHDR
IDAT (one or more, contiguous)
IEND

yaml
Copy code
3. No other chunks are present.

### IHDR Constraints
- Bit depth: 8
- Color type: 2 (RGB) or 6 (RGBA)
- Compression method: 0
- Filter method: 0
- Interlace method: 0

If any field differs, the file is **non-canonical**.

### IDAT Constraints
- IDAT payloads MUST decode to identical pixel data as the input.
- Compression MUST use:
- zlib
- fixed compression level (implementation-chosen but constant)
- no preset dictionaries
- Multiple IDAT chunks are permitted but SHOULD be merged into one.

### Metadata
- All ancillary chunks MUST be removed, including but not limited to:
- tEXt / zTXt / iTXt
- gAMA
- cHRM
- iCCP
- tIME
- pHYs
- No timestamps or textual metadata may remain.

### Determinism
- Given identical decoded pixel data, the canonicalizer MUST emit identical byte output across runs and machines.

---

## Error Semantics

The tool MUST fail with a structured error if:

- The input is not a valid PNG.
- The IHDR fields violate the constraints above.
- Decoded pixel data cannot be represented in the canonical form without loss.

Silent coercion is forbidden.

---

## Interface (Minimal)

A conforming implementation MUST provide a CLI with the following shape:

png-canon <input.png> <output.png>

yaml
Copy code

Behavior:
- Reads `input.png`.
- Validates constraints.
- Emits canonical PNG to `output.png`.
- Exits non-zero on failure.

No in-place mutation.

---

## Relationship to Golden PNGs

This tool is intentionally **downstream** of rendering:

- Browsers are allowed to differ.
- GPUs are allowed to differ.
- PNG encoders are *not* allowed to differ.

The canonicalizer is the point at which nondeterminism is collapsed.

---

## Non-Goals

- Lossless recompression benchmarking
- Color management correction
- Support for exotic PNG features
- Backward compatibility with arbitrary PNGs

If a file cannot be canonicalized, the upstream pipeline is out of spec.

---

## Status

This specification is normative for repositories claiming golden PNG conformance. Reference implementations may vary, but output bytes must not.