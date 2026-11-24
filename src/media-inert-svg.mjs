/**
 * Recognizer for the closed media-inert-svg/1 asset language, not an XML parser
 * or general SVG sanitizer. See data/schema/media-inert-svg-profile.md.
 * Pure, bounded, fail closed; no recovery, rewriting, imports or external data.
 */
const WS = /^[ \t\r\n]*$/u;
const ID = /^[A-Za-z_][A-Za-z0-9_.-]{0,1023}$/u;
const NUMBER = '[+-]?(?:[0-9]+(?:\\.[0-9]*)?|\\.[0-9]+)(?:[eE][+-]?[0-9]+)?';
const NUMBER_RE = new RegExp(`^${NUMBER}$`, 'u');
const LENGTH_RE = new RegExp(`^(${NUMBER})(px|em|ex|%)?$`, 'u');
const NUMBER_AT = new RegExp(NUMBER, 'uy');
const GRAPHICS = ['g', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon', 'path', 'text'];
const RESOURCES = ['linearGradient', 'radialGradient', 'pattern', 'clipPath', 'marker'];
const DESCRIPTIVE = ['title', 'desc'];
const PAINT_SERVERS = ['linearGradient', 'radialGradient', 'pattern'];
const CONTAINER = [...GRAPHICS, ...RESOURCES, 'defs', ...DESCRIPTIVE];
const CHILDREN = new Map([
  ['svg', CONTAINER], ['g', CONTAINER], ['defs', [...GRAPHICS, ...RESOURCES, ...DESCRIPTIVE]],
  ...['rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon', 'path', 'stop'].map((n) => [n, DESCRIPTIVE]),
  ['text', ['tspan', ...DESCRIPTIVE]], ['tspan', ['tspan']], ['title', []], ['desc', []],
  ['linearGradient', ['stop', ...DESCRIPTIVE]], ['radialGradient', ['stop', ...DESCRIPTIVE]],
  ['pattern', CONTAINER], ['marker', CONTAINER], ['clipPath', [...GRAPHICS, ...DESCRIPTIVE]],
]);
const TEXT = new Set(['text', 'tspan', 'title', 'desc']);
const REFERENCE_ATTRIBUTES = new Set(['fill', 'stroke', 'clip-path', 'marker-start', 'marker-mid', 'marker-end']);
const FORBIDDEN_PAINT = new Set(['inherit', 'initial', 'unset', 'revert', 'revert-layer', 'context-fill', 'context-stroke']);
// A syntactically inert identifier need not be a valid CSS color. Invalid
// declarations can leave the inherited paint active. Only this baseline set
// proves that an inherited resource reference is replaced; all other admitted
// scalar forms conservatively retain it (even when a renderer accepts them).
const BASELINE_PAINT = new Set(['none', 'currentcolor', 'black', 'silver', 'gray', 'white', 'maroon', 'red', 'purple', 'fuchsia', 'green', 'lime', 'olive', 'yellow', 'navy', 'blue', 'teal', 'aqua']);
const clearsInheritedPaint = (s) => BASELINE_PAINT.has(s.toLowerCase()) || /^#(?:[0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/u.test(s);
const scalar = (n) => n === 9 || n === 10 || n === 13 || (n >= 32 && n <= 0xd7ff)
  || (n >= 0xe000 && n <= 0xfffd) || (n >= 0x10000 && n <= 0x10ffff);
const validScalars = (s) => { for (const c of s) if (!scalar(c.codePointAt(0))) return false; return true; };
const trim = (s) => s.replace(/^[ \t\r\n]+|[ \t\r\n]+$/gu, '');
const number = (s) => NUMBER_RE.test(s) && Number.isFinite(Number(s)) && Math.abs(Number(s)) <= 1000000;
const range = (s, min, max) => number(s) && Number(s) >= min && Number(s) <= max;
const length = (s, min = -1000000) => { const m = LENGTH_RE.exec(s); return Boolean(m && number(m[1]) && Number(m[1]) >= min); };
const oneOf = (...values) => (s) => values.includes(s);

// Only XML predefined entities and bounded scalar references; never recursively
// expand the resulting text or parse it as markup. Literal attribute whitespace
// is normalized separately, before reference decoding, as in this XML subset.
function decoded(raw, attribute = false) {
  if (raw.includes('<') || raw.includes(']]>')) return null;
  const input = attribute ? raw.replace(/[\t\r\n]/gu, ' ') : raw;
  let out = '', start = 0;
  for (let at = input.indexOf('&'); at !== -1; at = input.indexOf('&', start)) {
    out += input.slice(start, at);
    const end = input.indexOf(';', at + 1);
    if (end < 0 || end - at > 12) return null;
    const name = input.slice(at + 1, end);
    const entities = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
    if (Object.hasOwn(entities, name)) out += entities[name];
    else {
      const m = /^#(?:(x)([0-9A-Fa-f]{1,8})|([0-9]{1,8}))$/u.exec(name);
      if (!m) return null;
      const n = Number.parseInt(m[2] ?? m[3], m[1] ? 16 : 10);
      if (!scalar(n)) return null;
      out += String.fromCodePoint(n);
    }
    start = end + 1;
  }
  out += input.slice(start);
  return validScalars(out) ? out : null;
}

function list(s, validate = number) {
  const value = trim(s);
  if (!value || !/^[^,]+(?:,[^,]+)*$/u.test(value)) return null;
  const parts = value.split(/[ \t\r\n]*,[ \t\r\n]*|[ \t\r\n]+/u);
  return parts.every((p) => p && validate(p)) ? parts : null;
}
const sized = (s, counts, validate = number) => { const parts = list(s, validate); return parts !== null && counts.includes(parts.length); };
const viewBox = (s) => { const p = list(s); return p?.length === 4 && Number(p[2]) > 0 && Number(p[3]) > 0; };
const aspect = (s) => /^(?:none|x(?:Min|Mid|Max)Y(?:Min|Mid|Max))(?: (?:meet|slice))?$/u.test(s);
const dimension = (s) => { const m = new RegExp(`^(${NUMBER})(?:px)?$`, 'u').exec(s); return Boolean(m && number(m[1]) && Number(m[1]) > 0 && Number(m[1]) <= 20000); };

function transform(s) {
  let i = 0, count = 0;
  const arities = { matrix: [6], translate: [1, 2], scale: [1, 2], rotate: [1, 3], skewX: [1], skewY: [1] };
  while (i < s.length) {
    const m = /^(matrix|translate|scale|rotate|skewX|skewY)\([ \t\r\n]*([^()]*)\)/u.exec(s.slice(i));
    if (!m || !sized(m[2], arities[m[1]])) return false;
    i += m[0].length; count += 1;
    if (i === s.length) break;
    const gap = /^[ \t\r\n]*,[ \t\r\n]*|^[ \t\r\n]+/u.exec(s.slice(i));
    if (!gap) return false;
    i += gap[0].length;
    if (i === s.length) return false;
  }
  return count > 0;
}

function path(s) {
  if (s === '') return true; // Actual chart producer's invisible foreground path.
  let i = 0, command = null, values = [], first = true, previousNumber = false, comma = false;
  const arity = { M: 2, L: 2, H: 1, V: 1, C: 6, S: 4, Q: 4, T: 2, A: 7, Z: 0 };
  const complete = () => {
    if (command === null) return false;
    const size = arity[command.toUpperCase()];
    if (size === 0) return values.length === 0;
    if (values.length === 0 || values.length % size !== 0) return false;
    if (command.toUpperCase() === 'A') for (let j = 0; j < values.length; j += 7) {
      if (Number(values[j]) < 0 || Number(values[j + 1]) < 0 || !['0', '1'].includes(values[j + 3]) || !['0', '1'].includes(values[j + 4])) return false;
    }
    return true;
  };
  while (i < s.length) {
    if (/[ \t\r\n]/u.test(s[i])) { i += 1; continue; }
    if (s[i] === ',') { if (!previousNumber || comma) return false; comma = true; previousNumber = false; i += 1; continue; }
    if (/[A-Za-z]/u.test(s[i])) {
      const c = s[i];
      if (!Object.hasOwn(arity, c.toUpperCase()) || comma || (first ? !/[Mm]/u.test(c) : !complete())) return false;
      command = c; values = []; first = false; previousNumber = false; i += 1; continue;
    }
    NUMBER_AT.lastIndex = i;
    const m = NUMBER_AT.exec(s);
    if (!m || command === null || command.toUpperCase() === 'Z' || !number(m[0])) return false;
    values.push(m[0]); i = NUMBER_AT.lastIndex; previousNumber = true; comma = false;
  }
  return !comma && complete();
}

function literalPaint(s) {
  if (/^[A-Za-z][A-Za-z0-9-]*$/u.test(s)) return !FORBIDDEN_PAINT.has(s.toLowerCase());
  if (/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/u.test(s)) return true;
  const m = /^(rgb|rgba|hsl|hsla)\(([^()]*)\)$/u.exec(s);
  if (!m) return false;
  const p = m[2].split(',').map((x) => trim(x));
  const alpha = m[1].endsWith('a');
  if (p.length !== (alpha ? 4 : 3)) return false;
  const percent = (x) => x.endsWith('%') && range(x.slice(0, -1), 0, 100);
  if (m[1].startsWith('rgb')) {
    if (!(p.slice(0, 3).every(percent) || p.slice(0, 3).every((x) => range(x, 0, 255)))) return false;
  } else if (!number(p[0]) || !percent(p[1]) || !percent(p[2])) return false;
  return !alpha || range(p[3], 0, 1) || percent(p[3]);
}
const localReference = (s) => {
  const m = /^url\((?:#([A-Za-z_][A-Za-z0-9_.-]*)|'#([A-Za-z_][A-Za-z0-9_.-]*)'|"#([A-Za-z_][A-Za-z0-9_.-]*)")\)$/u.exec(s);
  const id = m && (m[1] ?? m[2] ?? m[3]);
  return id && ID.test(id) ? id : null;
};
const paint = (s) => literalPaint(s) || localReference(s) !== null;
const referenceOrNone = (s) => s === 'none' || localReference(s) !== null;
const family = (s) => s.split(',').every((part) => {
  let p = trim(part);
  if (p[0] === '"' || p[0] === "'") { if (p.at(-1) !== p[0]) return false; p = p.slice(1, -1); }
  return /^[\p{L}\p{N} _.\-]+$/u.test(p) && trim(p).length > 0;
});
const baseline = oneOf('auto', 'baseline', 'before-edge', 'text-before-edge', 'middle', 'central', 'after-edge', 'text-after-edge', 'ideographic', 'alphabetic', 'hanging', 'mathematical', 'use-script', 'no-change', 'reset-size');
const GLOBAL = new Map(Object.entries({
  id: (s) => ID.test(s), class: (s) => Boolean(list(s, (p) => ID.test(p)) && !s.includes(',')),
  role: (s) => s.length > 0, 'aria-label': () => true, 'aria-roledescription': () => true,
  'aria-hidden': oneOf('true', 'false'),
  'aria-labelledby': (s) => Boolean(list(s, (p) => ID.test(p)) && !s.includes(',')),
  'aria-describedby': (s) => Boolean(list(s, (p) => ID.test(p)) && !s.includes(',')),
  fill: paint, stroke: paint, color: literalPaint,
  'fill-opacity': (s) => range(s, 0, 1), 'stroke-opacity': (s) => range(s, 0, 1), opacity: (s) => range(s, 0, 1),
  'stroke-width': (s) => length(s, 0), 'stroke-miterlimit': (s) => number(s) && Number(s) > 0,
  'stroke-dasharray': (s) => s === 'none' || Boolean(list(s, (p) => range(p, 0, 1000000))), 'stroke-dashoffset': length,
  'stroke-linecap': oneOf('butt', 'round', 'square'), 'stroke-linejoin': oneOf('miter', 'round', 'bevel'),
  'fill-rule': oneOf('nonzero', 'evenodd'), 'clip-rule': oneOf('nonzero', 'evenodd'),
  'clip-path': referenceOrNone, 'marker-start': referenceOrNone, 'marker-mid': referenceOrNone, 'marker-end': referenceOrNone,
  'font-family': family, 'font-size': (s) => length(s, 0),
  'font-weight': (s) => ['normal', 'bold', 'bolder', 'lighter'].includes(s) || (/^[0-9]+$/u.test(s) && range(s, 1, 1000)),
  'font-style': oneOf('normal', 'italic', 'oblique'), 'text-anchor': oneOf('start', 'middle', 'end'),
  'dominant-baseline': baseline, 'alignment-baseline': baseline,
  'baseline-shift': (s) => ['baseline', 'sub', 'super'].includes(s) || length(s),
  'letter-spacing': (s) => s === 'normal' || length(s), 'word-spacing': (s) => s === 'normal' || length(s),
  display: oneOf('inline', 'none'), visibility: oneOf('visible', 'hidden', 'collapse'),
  'vector-effect': oneOf('none', 'non-scaling-stroke'),
  'shape-rendering': oneOf('auto', 'optimizeSpeed', 'crispEdges', 'geometricPrecision'),
  'text-rendering': oneOf('auto', 'optimizeSpeed', 'optimizeLegibility', 'geometricPrecision'), transform,
}));
const lengths = (names, positive = []) => Object.fromEntries(names.map((n) => [n, (s) => length(s, positive.includes(n) ? 0 : -1000000)]));
const units = oneOf('userSpaceOnUse', 'objectBoundingBox');
const gradient = { gradientUnits: units, gradientTransform: transform, spreadMethod: oneOf('pad', 'reflect', 'repeat') };
const textAttributes = {
  x: (s) => Boolean(list(s, length)), y: (s) => Boolean(list(s, length)), dx: (s) => Boolean(list(s, length)), dy: (s) => Boolean(list(s, length)),
  rotate: (s) => Boolean(list(s)), textLength: (s) => length(s, 0), lengthAdjust: oneOf('spacing', 'spacingAndGlyphs'),
};
const SPECIFIC = new Map(Object.entries({
  svg: { width: dimension, height: dimension, viewBox, version: oneOf('1.0', '1.1', '1.2', '2.0'), baseProfile: oneOf('tiny', 'basic', 'full'), preserveAspectRatio: aspect,
    xmlns: (s) => s === 'http://www.w3.org/2000/svg', 'xmlns:xlink': (s) => s === 'http://www.w3.org/1999/xlink' },
  rect: lengths(['x', 'y', 'width', 'height', 'rx', 'ry'], ['width', 'height', 'rx', 'ry']),
  circle: lengths(['cx', 'cy', 'r'], ['r']), ellipse: lengths(['cx', 'cy', 'rx', 'ry'], ['rx', 'ry']),
  line: lengths(['x1', 'y1', 'x2', 'y2']),
  polyline: { points: (s) => { const p = list(s); return p !== null && p.length >= 4 && p.length % 2 === 0; } },
  polygon: { points: (s) => { const p = list(s); return p !== null && p.length >= 6 && p.length % 2 === 0; } },
  path: { d: path }, text: textAttributes, tspan: textAttributes,
  linearGradient: { ...lengths(['x1', 'y1', 'x2', 'y2']), ...gradient },
  radialGradient: { ...lengths(['cx', 'cy', 'r', 'fx', 'fy', 'fr'], ['r', 'fr']), ...gradient },
  stop: { offset: (s) => s.endsWith('%') ? range(s.slice(0, -1), 0, 100) : range(s, 0, 1), 'stop-color': literalPaint, 'stop-opacity': (s) => range(s, 0, 1) },
  pattern: { ...lengths(['x', 'y', 'width', 'height'], ['width', 'height']), patternUnits: units, patternContentUnits: units, patternTransform: transform, viewBox, preserveAspectRatio: aspect },
  clipPath: { clipPathUnits: units },
  marker: { ...lengths(['refX', 'refY', 'markerWidth', 'markerHeight'], ['markerWidth', 'markerHeight']), markerUnits: oneOf('strokeWidth', 'userSpaceOnUse'),
    orient: (s) => ['auto', 'auto-start-reverse'].includes(s) || number(s) || (s.endsWith('deg') && number(s.slice(0, -3))), viewBox, preserveAspectRatio: aspect },
}));

function startTag(s, start) {
  const name = /^<([A-Za-z][A-Za-z0-9]*)/u.exec(s.slice(start));
  if (!name || !CHILDREN.has(name[1])) return null;
  let i = start + name[0].length;
  const attributes = new Map();
  while (i < s.length) {
    const gap = /^[ \t\r\n]*/u.exec(s.slice(i))[0]; i += gap.length;
    if (s.startsWith('/>', i)) return { name: name[1], attributes, end: i + 2, closed: true };
    if (s[i] === '>') return { name: name[1], attributes, end: i + 1, closed: false };
    if (!gap) return null;
    const a = /^([A-Za-z][A-Za-z0-9:._-]*)[ \t\r\n]*=[ \t\r\n]*(["'])/u.exec(s.slice(i));
    if (!a || attributes.has(a[1])) return null;
    i += a[0].length;
    const end = s.indexOf(a[2], i);
    if (end < 0) return null;
    const value = decoded(s.slice(i, end), true);
    if (value === null) return null;
    attributes.set(a[1], value); i = end + 1;
  }
  return null;
}

function acyclic(edges) {
  const indegree = new Map([...edges.keys()].map((id) => [id, 0]));
  for (const targets of edges.values()) for (const id of targets) indegree.set(id, (indegree.get(id) ?? 0) + 1);
  const ready = [...indegree].filter(([, n]) => n === 0).map(([id]) => id);
  let read = 0;
  while (read < ready.length) for (const target of edges.get(ready[read++]) ?? []) {
    const remaining = indegree.get(target) - 1; indegree.set(target, remaining);
    if (remaining === 0) ready.push(target);
  }
  return read === indegree.size;
}

export function isMediaInertSvg(svg) {
  if (typeof svg !== 'string' || svg.length > 400000 || !validScalars(svg)) return false;
  let i = svg[0] === '\uFEFF' ? 1 : 0, elements = 0, attributeCount = 0, edgeCount = 0, rootSeen = false;
  const stack = [], ids = new Map(), references = [], edges = new Map();
  if (svg.startsWith('<?xml', i)) {
    const declaration = /^<\?xml[ \t\r\n]+version=(?:"1\.0"|'1\.0')(?:[ \t\r\n]+encoding=(?:"[Uu][Tt][Ff]-8"|'[Uu][Tt][Ff]-8'))?(?:[ \t\r\n]+standalone=(?:"(?:yes|no)"|'(?:yes|no)'))?[ \t\r\n]*\?>/u.exec(svg.slice(i));
    if (!declaration) return false;
    i += declaration[0].length;
  }
  while (i < svg.length) {
    const parent = stack.at(-1);
    if (svg[i] !== '<') {
      let end = svg.indexOf('<', i); if (end === -1) end = svg.length;
      const raw = svg.slice(i, end);
      if (!parent || !TEXT.has(parent.name)) { if (!WS.test(raw)) return false; }
      else if (decoded(raw) === null) return false;
      i = end; continue;
    }
    if (svg.startsWith('</', i)) {
      const end = /^<\/([A-Za-z][A-Za-z0-9]*)[ \t\r\n]*>/u.exec(svg.slice(i));
      if (!end || !parent || end[1] !== parent.name) return false;
      stack.pop(); i += end[0].length; continue;
    }
    const node = startTag(svg, i);
    if (!node || ++elements > 10000 || stack.length >= 64) return false;
    attributeCount += node.attributes.size;
    if (attributeCount > 50000) return false;
    if (!parent) {
      if (rootSeen || node.name !== 'svg' || node.attributes.get('xmlns') !== 'http://www.w3.org/2000/svg') return false;
      rootSeen = true;
    } else if (!CHILDREN.get(parent.name).includes(node.name)) return false;
    const effective = new Map(parent?.effective ?? []);
    for (const [name, value] of node.attributes) {
      const specific = SPECIFIC.get(node.name);
      const check = specific && Object.hasOwn(specific, name) ? specific[name] : GLOBAL.get(name);
      if (!check || !check(value)) return false;
      if (REFERENCE_ATTRIBUTES.has(name)) {
        const id = localReference(value);
        if (id) {
          const kind = name === 'fill' || name === 'stroke' ? 'paint' : name === 'clip-path' ? 'clip' : 'marker';
          const ref = { id, kind }; effective.set(name, ref); references.push(ref);
        } else if (!['fill', 'stroke'].includes(name) || clearsInheritedPaint(value)) effective.delete(name);
      }
      if (name === 'aria-labelledby' || name === 'aria-describedby') for (const id of list(value, (p) => ID.test(p))) references.push({ id, kind: 'aria' });
    }
    const id = node.attributes.get('id');
    if (id) { if (ids.has(id)) return false; ids.set(id, node.name); }
    const resources = [...(parent?.resources ?? [])];
    if (id && RESOURCES.includes(node.name)) { resources.push(id); edges.set(id, new Set()); }
    // Over-approximation: clip references also propagate; inherited references on
    // the resource itself count even if its descendants later override them.
    for (const owner of resources) for (const ref of effective.values()) {
      const targets = edges.get(owner);
      if (!targets.has(ref.id)) { targets.add(ref.id); if (++edgeCount > 100000) return false; }
    }
    if (!node.closed) stack.push({ name: node.name, effective, resources });
    i = node.end;
  }
  if (!rootSeen || stack.length !== 0) return false;
  for (const ref of references) {
    const type = ids.get(ref.id);
    if (!type || (ref.kind === 'paint' && !PAINT_SERVERS.includes(type)) || (ref.kind === 'clip' && type !== 'clipPath') || (ref.kind === 'marker' && type !== 'marker')) return false;
  }
  return acyclic(edges);
}
