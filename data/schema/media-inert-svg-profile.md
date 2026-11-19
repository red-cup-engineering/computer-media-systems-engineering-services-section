# media-inert-svg/1: supported inline Media asset language

This is not a general XML parser, SVG sanitizer or browser-security guarantee. It is the closed input language of the first, unreleased MediaPlan API. Unsupported syntax is refused, never rewritten; accepted bytes retain their original identity. Generic XML reading remains at xml-document-rendering-service; no external parser or producer implementation is copied here.

Input is a string of at most 400000 UTF-16 code units (existing schema bound), valid XML 1.0 scalar characters.
Maximum 10000 elements, 50000 attributes, 100000 distinct resource edges, depth 64; IDs at most 1024 characters. Every numeric token must be finite with absolute value at most 1000000.
No normalization of the returned/admitted string: identity and downstream bytes remain the author's exact bytes.

### Document/token grammar

- Optional initial BOM; XML whitespace is only space, tab, LF, CR.
- Optional XML declaration: version exactly 1.0, optional encoding UTF-8 (ASCII case-insensitive), optional standalone yes/no, no other fields.
- Exactly one unprefixed svg root; whitespace may surround it. No trailing second document.
- Start tags have an allowed ASCII element name, unique allowed attributes, quoted values and optional self-closing slash.
- Attribute separation and equals syntax follow this restricted grammar; no unquoted values or raw less-than in values.
- End tags match the current stack exactly and contain no attributes. Every tag/token is fully consumed; malformed or unknown input refuses.
- No comments, CDATA, DTD, custom entities, processing instructions other than the initial declaration, arbitrary prefixes, or namespace rebinding.
- Root must declare xmlns exactly http://www.w3.org/2000/svg. It may additionally declare xmlns:xlink exactly http://www.w3.org/1999/xlink because the real chart output carries that unused declaration.
- Namespace declarations occur only at root. No prefixed elements/attributes beyond those two declarations; in particular no xml:base, xlink:href or href.
- Text is allowed only in text, tspan, title and desc; elsewhere only XML whitespace. Literal ]]> refuses.
- Decode only the five XML predefined entities and decimal/hex numeric character references with 1 to 8 digits for value validation. Validate resulting XML scalar characters, but never reparse decoded text as markup and never recursively expand an entity.
- Literal attribute tab/LF/CR normalization is considered for validation; character-reference values retain their decoded character.
- Unknown entities, malformed references, lone surrogates, NUL and excluded XML control characters refuse.

### Elements and structure

Graphics = g, rect, circle, ellipse, line, polyline, polygon, path, text.
Resources = linearGradient, radialGradient, pattern, clipPath, marker.
Descriptive = title, desc.

- svg, g: Graphics, Resources, defs, Descriptive.
- defs: Graphics, Resources, Descriptive (no nested svg).
- rect/circle/ellipse/line/polyline/polygon/path: Descriptive only.
- text: tspan and Descriptive plus text; tspan: tspan plus text.
- title/desc: text only.
- linearGradient/radialGradient: stop and Descriptive.
- stop: Descriptive only.
- pattern/marker: Graphics, defs, Resources, Descriptive.
- clipPath: Graphics and Descriptive.
- No style, image, use, symbol, a, foreignObject, script, filter, animation or embedding elements.

### Attribute vocabulary and value languages

Global inert metadata:
id (ASCII identifier beginning letter/underscore, then letters/digits/underscore/dot/hyphen); class (space-separated such tokens);
role, aria-label, aria-roledescription (bounded XML text); aria-hidden (true/false);
aria-labelledby/aria-describedby (nonempty whitespace-separated ID references).
Metadata text may contain URLs and punctuation; it is not treated as an active reference.

Global presentation:
- fill, stroke: a plain ASCII paint identifier (letter followed by letters/digits/hyphens, excluding the CSS-wide/context keywords below), #RGB/#RGBA/#RRGGBB/#RRGGBBAA, comma-separated rgb/rgba/hsl/hsla expression (3 channels, plus alpha only for rgba/hsla; RGB channels all 0..255 numbers or all 0..100%; HSL hue a bounded number and saturation/lightness 0..100%; alpha 0..1 or 0..100%), or exact local url(#ID) (optional matching single/double quotes inside url). No escapes, var/calc, fallback suffix, external URL or other CSS grammar.
- color: literal paint only, never url; CSS-wide and context-paint keywords are excluded case-insensitively from every paint attribute.
- fill-opacity/stroke-opacity/opacity: number in [0,1].
- stroke-width: nonnegative length; stroke-miterlimit: positive number; stroke-dasharray: none or nonnegative numeric list; stroke-dashoffset: length.
- stroke-linecap: butt/round/square; stroke-linejoin: miter/round/bevel; fill-rule/clip-rule: nonzero/evenodd.
- clip-path: none or local url(#ID); marker-start/mid/end: none or local url(#ID).
- font-family: comma-separated inert family names made from Unicode letters/numbers, spaces, underscore/dot/hyphen and optional matching quotes; no backslash, parentheses, braces, at-sign or CSS declarations.
- font-size: nonnegative length; font-weight: normal/bold/bolder/lighter or integer 1..1000; font-style: normal/italic/oblique.
- text-anchor: start/middle/end; dominant-baseline/alignment-baseline: closed SVG baseline keywords; baseline-shift: baseline/sub/super or length.
- letter-spacing/word-spacing: normal or length.
- display: inline/none; visibility: visible/hidden/collapse; vector-effect: none/non-scaling-stroke.
- shape-rendering: auto/optimizeSpeed/crispEdges/geometricPrecision; text-rendering: auto/optimizeSpeed/optimizeLegibility/geometricPrecision.
- transform: a sequence only of matrix(6 numbers), translate(1 or 2), scale(1 or 2), rotate(1 or 3), skewX(1), skewY(1).

No style, event attribute, cursor, filter, href, xml:base, arbitrary data attribute or unknown attribute.
Presentation languages are lexical inert subsets, not a claim that every named paint is a standardized color or that every renderer's visual behavior is identical.
Length = bounded decimal/scientific number optionally px/em/ex/%; geometry lengths that cannot be negative reject negatives.

Element-specific additions:
- svg: width,height (positive number or px, <=20000), viewBox (4 numbers, positive width/height), version (1.0/1.1/1.2/2.0), baseProfile (tiny/basic/full), preserveAspectRatio, the fixed namespaces.
- rect: x,y,width,height,rx,ry; circle: cx,cy,r; ellipse: cx,cy,rx,ry; line: x1,y1,x2,y2.
- polyline/polygon: points (even numeric list, at least 2/3 coordinate pairs).
- path: d (empty is allowed for the real chart foreground; otherwise initial M/m plus only M/L/H/V/C/S/Q/T/A/Z and lowercase forms, correct parameter-group counts, arc flags 0/1 and nonnegative radii).
- text/tspan: x,y,dx,dy (length lists), rotate (number list), textLength (nonnegative length), lengthAdjust (spacing/spacingAndGlyphs).
- linearGradient: x1,y1,x2,y2, gradientUnits, gradientTransform, spreadMethod.
- radialGradient: cx,cy,r,fx,fy,fr, gradientUnits, gradientTransform, spreadMethod.
- stop: offset (0..1 or 0..100%), stop-color (paint without url), stop-opacity (0..1).
- pattern: x,y,width,height,patternUnits,patternContentUnits,patternTransform,viewBox,preserveAspectRatio.
- clipPath: clipPathUnits.
- marker: refX,refY,markerWidth,markerHeight,markerUnits,orient (auto/auto-start-reverse or bounded angle),viewBox,preserveAspectRatio.
Units enums are userSpaceOnUse/objectBoundingBox where applicable; markerUnits strokeWidth/userSpaceOnUse; spreadMethod pad/reflect/repeat.
preserveAspectRatio = none or xMin/xMid/xMax + YMin/YMid/YMax, optionally meet/slice.
All other attributes refuse. No CSS escape decoding exists because CSS syntax is excluded.

### Reference and resource graph

Collect unique IDs and deferred references while recognizing the whole document.
All local and ARIA references must resolve in the same document.
Paint url targets must be linearGradient/radialGradient/pattern; clip-path targets clipPath; marker references target marker.
Carry effective inherited fill/stroke/marker references through each stack frame; only a proved baseline non-resource override clears the corresponding fill/stroke reference: none, currentColor, the sixteen basic colors (black, silver, gray, white, maroon, red, purple, fuchsia, green, lime, olive, yellow, navy, blue, teal, aqua), case-insensitively, or #RGB/#RRGGBB. Other admitted inert identifiers/functions/alpha-hex forms conservatively retain an inherited reference, because an ignored declaration must not hide a cycle. Clip/marker none overrides clear their respective references. Propagate clip-path references conservatively as a supported-profile restriction even where the full SVG inheritance model would not. For every effective render-resource reference at an element, add edges from every containing identified resource (including that element) to the target. Reject self-reference and cycles with an iterative bounded graph walk. This covers resources whose descendants inherit an ancestor paint reference, not merely references lexically inside the resource. CSS-wide/context paint keywords (inherit, initial, unset, revert, revert-layer, context-fill, context-stroke) refuse; color itself permits literal paint only, so currentColor cannot hide a resource edge.
This includes a pattern containing a shape filled with that same pattern, or cycles between separate resources.
No external href, nested data URL, XML base, namespace-rebound resource, or use-instantiation can enter the profile.
Accepted data is not a claim of visual fidelity, rights, host-font reproducibility or installed renderer safety.

### API/refusal boundary

Keep svgIsSelfContained(string) -> boolean for callers, but document that true certifies this supported profile only.
It does not coerce arbitrary values. Bad or unsupported syntax returns false, never repaired output.
Existing admission code SVG_NOT_SELF_CONTAINED remains stable, with message explaining that the supported inert profile was not established.
No generic XML validation API is introduced. Asset shape remains the published schema shape; its comment and governing requirement name this profile explicitly.


## Compatibility and refusal meaning

An inherited reference on a resource itself is conservatively counted even if all its descendants later override it. Such safe-but-outside-profile arrangements may refuse; false does not mean generic SVG invalidity. A proved baseline override on the resource itself clears that inherited reference; uninterpreted or nonbaseline paint does not. This can refuse a safe resource arrangement using a valid nonbaseline color, but cannot rely on an invalid color declaration to erase an inherited edge. Clip references propagate conservatively too. Text and inert metadata may contain URLs, punctuation and escaped markup without becoming references.

- Existing Media frame/overlay strings and generated end card: root namespace, rect/text, linearGradient/stop, local url(#bg), text escaping.
- chart-specification-rendering-service 4a02cef5aa1310dc5869c056ffbf5994621b2e12:
  package.json x-market.offers[0].examples.output.svg (1026 bytes) is retained as an exact public producer control:
  unused xmlns:xlink, version1.1, class/role/ARIA, translate(5,5), M/h/v/Z paths with decimal/negative adjacency, stroke-miterlimit, empty d and display=none.
  README Hatching and test/paper-figures.test.mjs require defs/pattern/line, userSpaceOnUse, rotate(45), stroke-width1.4, local paints, stroke-dasharray3,3 and numeric apostrophe references.
- deterministic-report-graphic-service 19f6775122b5cab33f92c02c2d07a1f66c5df514:
  renderSvgBytes source constructs version1.2/baseProfile tiny,1200x1240,title/desc and rect-only art.
  Its regex assertSafeSvg is not reused as this gate.
- Media consumer af1402b81ebdf1c1de418a4b6a22252ef24cab86 composeShotSvg179-185 embeds raw asset bytes; it supplies no second sanitizer.
- The profile does not promise all possible Vega/SVG output is supported. CSS, image/use/animation, unknown namespaces or attributes are explicit unsupported-profile refusals. No presently identified required producer sample needs them.

