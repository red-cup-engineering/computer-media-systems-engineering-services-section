#!/usr/bin/env node
// Comparator fixtures: no claims about client photographs or completed visitor tasks.
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { encodeWebRasterVariants } from '../src/web-raster-variants.mjs';

const run = promisify(execFile);
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const W = 240, H = 160;
function rgb(name, x, y) {
  if (name === 'categorical') return [
    [0,80,140],[240,50,0],[5,160,45],[150,0,170],[238,180,0],[20,20,20],
  ][Math.floor(x / 40)];
  if (name === 'gradient-noise') return [
    Math.round(x * 255 / (W - 1)), Math.round(y * 255 / (H - 1)),
    (x * 17 + y * 31 + (x * y) % 127) % 256,
  ];
  const line = x % 48 <= 2 || y % 40 <= 2 || Math.abs(x - y) < 2;
  return line ? [5,5,5] : [250,250,250];
}
async function image(name, dir) {
  const ppm = Buffer.alloc(W * H * 3);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    ppm.set(rgb(name, x, y), (y * W + x) * 3);
  }
  const input = join(dir, name + '.ppm'), output = join(dir, name + '.png');
  await writeFile(input, Buffer.concat([Buffer.from('P6\n' + W + ' ' + H + '\n255\n'), ppm]));
  await run('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', input, '-frames:v', '1', output], { timeout:15000 });
  return await readFile(output);
}
const dir = await mkdtemp(join(tmpdir(), '561-media-comparison-'));
try {
  const fixtures = [];
  for (const name of ['categorical', 'gradient-noise', 'linework']) {
    const input = await image(name, dir);
    const result = await encodeWebRasterVariants(input, {
      source: { id:'generated-fixture:' + name, license:'self-generated testing',
        derivativesAuthorized:true, sha256:sha256(input) },
      width:W, height:H, formats:['webp','avif','dithered-png'], allowLossyPreview:true,
    });
    fixtures.push({
      name, width:W, height:H, sourceBytes:input.length, sourceSha256:sha256(input),
      candidates:result.candidates.map(item => ({
        format:item.format, bytes:item.bytes, sha256:item.sha256,
        encodeElapsedMs:Number(item.encodeElapsedMs.toFixed(2)), fidelity:item.taskFidelity,
      })),
      missing:['client task equivalence','reader accessibility','physical energy','hosting electricity','CO2e'],
    });
  }
  process.stdout.write(JSON.stringify({
    kind:'SyntheticMediaEncodingStudy', observedAt:new Date().toISOString(),
    node:process.version, encoder:(await run('ffmpeg',['-version'])).stdout.split('\n')[0],
    note:'Synthetic source fixtures; encoding bytes and local wall-clock work only; no physical power or user-quality conclusion.',
    fixtures,
  }, null, 2) + '\n');
} finally { await rm(dir, { recursive:true, force:true }); }
