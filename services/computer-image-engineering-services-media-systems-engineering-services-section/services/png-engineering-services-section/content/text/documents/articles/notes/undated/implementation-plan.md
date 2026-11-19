# Reference Implementation Plan: `png-canon`

This document specifies a **single reference implementation** of the canonicalization tool described in `CANONICAL_PNG.md`. It is intended to be a *deterministic oracle* for CI and reproducible pipelines. The plan defines behavior precisely enough that independent implementations can be tested against it.

This plan is **derived**, local to this repository, and depends on the canonical-form constraints already defined.

---

## 0. Design Choice

Two viable deterministic strategies exist:

- **Strategy A (Preferred): re-encode from decoded pixels** using a fixed PNG encoder configuration.
- **Strategy B: normalize chunks without re-encoding** if the input already has acceptable IDAT encoding characteristics.

The reference implementation MUST use **Strategy A**. This sacrifices speed to collapse encoder variance and simplify conformance.

---

## 1. Language and Dependencies

### Option 1: Rust (preferred for determinism)
- `png` crate for decode/encode.
- `flate2` for zlib with fixed compression parameters.

### Option 2: Python (fastest to ship, still deterministic if careful)
- `Pillow` for decode only (encode varies; not recommended as sole encoder).
- `pypng` or a small custom encoder for deterministic output.
- `zlib` from the Python standard library for fixed parameters.

**Reference implementation target**: Rust.

Assumption: the repository can ship a small static binary or reproducible build recipe.

---

## 2. Canonical Output Definition (Operational)

The reference implementation MUST emit:

1. PNG signature
2. `IHDR` with:
   - original width/height
   - bit depth 8
   - color type:
     - 6 (RGBA) if any alpha channel is present in decoded data
     - else 2 (RGB)
   - compression method 0
   - filter method 0
   - interlace method 0
3. A single `IDAT` chunk containing:
   - zlib stream created with fixed parameters
   - deflate produced deterministically with fixed compression level and strategy
4. `IEND`

No other chunks.

---

## 3. Pixel Decode Rules

The tool MUST decode input PNG into a canonical in-memory pixel buffer:

- Supported input color types: 2 (RGB), 6 (RGBA), 3 (indexed) ONLY if it can be losslessly expanded.
- Interlaced inputs: MUST be rejected (out of scope).
- Bit depths other than 8: MUST be rejected.
- Gamma/cHRM/iCCP chunks: MUST be ignored for pixel decode (no color management corrections).

Decoded buffer format:
- RGBA8 in row-major order.
- If input is RGB, alpha is set to 255.

If the decoder library performs implicit color conversions, that implementation is non-conforming.

---

## 4. Row Filter Rules

PNG allows per-row filters (None, Sub, Up, Average, Paeth). To stabilize output, the reference implementation MUST use:

- **Filter type 0 (None)** for every row.

This reduces encoder degrees of freedom at the cost of file size.

---

## 5. Zlib / Deflate Rules

The reference implementation MUST use a fixed zlib configuration:

- compression level: **6**
- window bits: **15**
- memory level: default for the library, but MUST be fixed and documented
- strategy: **default**

Additionally:
- The zlib header and Adler-32 MUST be produced by the same library path every time.
- No dictionaries.
- No timestamped gzip wrappers (PNG uses zlib, not gzip).

If exact byte stability cannot be guaranteed with a chosen library version, the implementation MUST pin versions and document them.

---

## 6. Validation Rules

The tool MUST validate before emitting output:

- Input is a PNG with valid signature and CRCs.
- IHDR fields are supported (see decode rules).
- Decoding succeeds.
- Dimensions match reasonable limits (to prevent memory bombs); the limit MUST be explicit and configurable.

Suggested default hard limit:
- width * height <= 100,000,000 pixels
- reject above with `E_TOO_LARGE`

---

## 7. Error Model

Errors MUST be machine-readable.

CLI exit codes:
- 0: success
- 2: invalid PNG
- 3: unsupported features
- 4: decode failure
- 5: encode failure
- 6: resource limits exceeded

STDERR MUST print a single-line JSON object:

Example:
```json
{"code":"E_UNSUPPORTED","detail":"interlaced PNGs are not supported","field":"IHDR.interlace_method"}
No stack traces by default.

8. CLI Contract
Command:

lua
Copy code
png-canon <input.png> <output.png>
Options:

--max-pixels <n> override resource cap.

--stdout writes canonical PNG bytes to stdout (output path ignored).

--json prints a success report JSON to stdout (metadata only).

Success JSON (when --json):

json
Copy code
{
  "input_sha256":"…",
  "output_sha256":"…",
  "width":123,
  "height":456,
  "color_type":"RGBA",
  "filter":"None",
  "zlib_level":6
}
9. Conformance Tests
A reference test suite MUST include:

Round-trip invariance: canonicalizing an already canonical file yields identical bytes.

Chunk stripping: inputs with tEXt, tIME, iCCP produce outputs without them.

Multiple IDAT merge: outputs contain exactly one IDAT.

Indexed expansion: palette PNG expands deterministically to RGB/RGBA.

Reject interlace: error code and JSON field match.

Reject non-8-bit: error code and JSON field match.

A conformance harness SHOULD compare SHA-256 of emitted files against fixture expectations.

10. Repository Layout
Suggested structure:

bash
Copy code
/spec/
  CANONICAL_PNG.md
  PNG_CANON_PLAN.md
/tool/
  png-canon/        # Rust crate
/tests/
  fixtures/
    in/
    out/
  test_manifest.json
11. Security Considerations
The implementation MUST:

cap memory and pixel counts

reject absurd chunk sizes

handle CRC failures safely

avoid quadratic-time filter processing (not relevant with filter=0 encode)

Status
This plan is normative for the reference implementation. Other implementations may differ internally, but to be conforming they must emit byte-identical output for the same decoded pixel data under the supported subset.