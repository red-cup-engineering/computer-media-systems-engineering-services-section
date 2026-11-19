import { mkdir, mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);

/** Crop and encode raster bytes as a bounded JPEG at the requested dimensions. */
export async function fitJpeg(bytes, outputPath, { width, height, maxBytes, qualitySteps = [3, 6, 10, 14, 18, 24, 30, 31], timeoutMs = 30_000 } = {}) {
  if (!Buffer.isBuffer(bytes) && !(bytes instanceof Uint8Array)) throw new TypeError("fitJpeg bytes must be a Buffer or Uint8Array");
  if (!outputPath.endsWith(".jpg")) throw new Error("JPEG outputPath must end in .jpg");
  for (const [name, value] of [["width", width], ["height", height], ["maxBytes", maxBytes]]) {
    if (!Number.isSafeInteger(value) || value <= 0) throw new RangeError(`${name} must be a positive integer`);
  }
  if (!Array.isArray(qualitySteps) || qualitySteps.length === 0 || qualitySteps.some((value) => !Number.isInteger(value) || value < 2 || value > 31)) throw new RangeError("qualitySteps must contain ffmpeg MJPEG quality values from 2 to 31");
  await mkdir(dirname(outputPath), { recursive: true });
  const temp = await mkdtemp(join(dirname(outputPath), ".fit-jpeg-"));
  try {
    const source = join(temp, "source-image"), jpeg = join(temp, "fitted.jpg");
    await writeFile(source, bytes, { mode: 0o600 });
    for (const quality of qualitySteps) {
      await run("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-threads", "1", "-i", source, "-vf", `scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height},setsar=1`, "-frames:v", "1", "-c:v", "mjpeg", "-pix_fmt", "yuvj420p", "-q:v", String(quality), jpeg], { timeout: timeoutMs, maxBuffer: 32 * 1024 });
      const output = await readFile(jpeg);
      if (output.length > maxBytes) continue;
      if (output[0] !== 0xff || output[1] !== 0xd8) throw new Error("Media conversion did not produce JPEG bytes");
      await rename(jpeg, outputPath);
      return { outputPath, width, height, bytes: output.length };
    }
    throw new Error(`JPEG cannot fit the ${maxBytes} byte limit`);
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
}
