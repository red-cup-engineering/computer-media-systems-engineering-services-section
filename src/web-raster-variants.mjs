// Original Computer Media provider: source-qualified candidate web raster encodes.
// This does not decide reader-task fidelity, publish, or meter electricity.
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

const run = promisify(execFile);
const FORMAT = Object.freeze({
  webp: { extension: 'webp', mime: 'image/webp' },
  avif: { extension: 'avif', mime: 'image/avif' },
  'dithered-png': { extension: 'png', mime: 'image/png' },
});
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const positive = (v, label, max) => {
  if (!Number.isSafeInteger(v) || v <= 0 || v > max) throw new RangeError(label + ' must be an integer from 1 to ' + max);
};
function mimeOf(bytes) {
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) return { mime: 'image/png', extension: 'png', codec: 'png' };
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return { mime: 'image/jpeg', extension: 'jpg', codec: 'mjpeg' };
  throw new TypeError('Only ordinary source PNG/JPEG still images are admitted');
}

/**
 * Produce candidate web images from caller-authorized source bytes.
 * Rights assertions are recorded, not independently verified.
 * Output remains in memory; the consumer decides whether to publish.
 * No best-format decision is made before reader-task fidelity testing.
 */
export async function encodeWebRasterVariants(bytes, {
  source, width, height, formats = ['webp', 'avif'], allowLossyPreview = false,
  maxSourceBytes = 8 * 1024 * 1024, maxOutputBytes = 2 * 1024 * 1024,
  maxPixels = 4 * 1024 * 1024, timeoutMs = 15_000,
} = {}) {
  if (!(bytes instanceof Uint8Array) || bytes.byteLength === 0) throw new TypeError('Raster source must be a nonempty Buffer or Uint8Array');
  positive(maxSourceBytes, 'maxSourceBytes', 32 * 1024 * 1024);
  positive(maxOutputBytes, 'maxOutputBytes', 32 * 1024 * 1024);
  positive(maxPixels, 'maxPixels', 16 * 1024 * 1024);
  positive(timeoutMs, 'timeoutMs', 120_000);
  if (bytes.byteLength > maxSourceBytes) throw new RangeError('Source bytes exceed declared bound');
  if (!source || source.derivativesAuthorized !== true ||
      typeof source.license !== 'string' || source.license.trim().length === 0 ||
      typeof source.id !== 'string' || source.id.trim().length === 0 || source.id.length > 1024) {
    throw new TypeError('Require source identity, license and explicit derivative authorization');
  }
  const content = Buffer.from(bytes);
  const sourceDigest = sha256(content);
  if (source.sha256 !== undefined && (typeof source.sha256 !== 'string' || source.sha256.toLowerCase() !== sourceDigest)) {
    throw new TypeError('Source digest disagrees with supplied bytes');
  }
  const kind = mimeOf(content);
  positive(width, 'width', 4096);
  positive(height, 'height', 4096);
  if (width * height > maxPixels) throw new RangeError('Output would exceed pixel budget');
  if (!Array.isArray(formats) || formats.length === 0 || formats.length > 3 ||
      new Set(formats).size !== formats.length || formats.some(f => !Object.hasOwn(FORMAT, f))) {
    throw new TypeError('Choose unique explicitly offered image formats');
  }
  if (formats.includes('dithered-png') && allowLossyPreview !== true) {
    throw new TypeError('Dither is an explicitly authorized information-loss preview only');
  }
  const dir = await mkdtemp(join(tmpdir(), '561-web-raster-'));
  try {
    const input = join(dir, 'input.' + kind.extension);
    await writeFile(input, content, { mode: 0o600 });
    const probe = await run('ffprobe', ['-v', 'error', '-select_streams', 'v:0',
      '-show_entries', 'stream=width,height,codec_name', '-of', 'json', input], {
      timeout: timeoutMs, maxBuffer: 16 * 1024,
    });
    let stream;
    try { stream = JSON.parse(probe.stdout).streams?.[0]; } catch { /* fail closed below */ }
    if (!stream || stream.codec_name !== kind.codec ||
        !Number.isSafeInteger(stream.width) || !Number.isSafeInteger(stream.height) ||
        stream.width <= 0 || stream.height <= 0 || stream.width > 4096 || stream.height > 4096 ||
        stream.width * stream.height > maxPixels) {
      throw new RangeError('Source geometry or codec violates admitted still-image bounds');
    }
    const version = (await run('ffmpeg', ['-version'], { timeout: timeoutMs, maxBuffer: 8192 })).stdout.split('\n')[0];
    const results = [];
    for (const format of formats) {
      const output = join(dir, 'candidate-' + format + '.' + FORMAT[format].extension);
      const scale = 'scale=' + width + ':' + height + ':flags=lanczos';
      let args;
      if (format === 'webp') {
        args = ['-vf', scale + ',format=yuv420p', '-c:v', 'libwebp', '-quality', '72', '-compression_level', '4'];
      } else if (format === 'avif') {
        args = ['-vf', scale + ',format=yuv420p', '-c:v', 'libaom-av1', '-still-picture', '1', '-crf', '38', '-b:v', '0', '-cpu-used', '5'];
      } else {
        args = ['-filter_complex',
          '[0:v]' + scale + ',split[base][forpal];[forpal]format=gray,palettegen=max_colors=6:stats_mode=full[palette];[base][palette]paletteuse=dither=bayer:bayer_scale=3[out]',
          '-map', '[out]', '-c:v', 'png'];
      }
      const start = process.hrtime.bigint();
      await run('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-threads', '1', '-y',
        '-i', input, ...args, '-frames:v', '1', output], { timeout: timeoutMs, maxBuffer: 32 * 1024 });
      const elapsedNs = process.hrtime.bigint() - start;
      const encoded = await readFile(output);
      if (encoded.length === 0 || encoded.length > maxOutputBytes) throw new RangeError('Encoded ' + format + ' exceeds output byte bound');
      results.push({
        format, mime: FORMAT[format].mime, width, height,
        bytes: encoded.length, sha256: sha256(encoded), encodeElapsedMs: Number(elapsedNs) / 1e6,
        encoder: version, data: encoded, taskFidelity: 'unassessed',
        electricity: null, greenhouseGases: null,
      });
    }
    return {
      kind: 'SourceQualifiedWebRasterCandidates',
      source: { id: source.id, license: source.license, derivativesAuthorized: true,
        sha256: sourceDigest, mime: kind.mime, width: stream.width, height: stream.height },
      candidates: results,
      claims: 'Encoded bytes and execution elapsed time are observed; no task fidelity, accessibility, metered energy or CO2e is established.',
    };
  } finally { await rm(dir, { recursive: true, force: true }); }
}
