import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);

/** Read duration using ffprobe. */
export async function mediaDurationSeconds(path) {
  const probe = await run("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "json", path], { timeout: 30_000, maxBuffer: 16_384 });
  return Number(JSON.parse(probe.stdout).format?.duration);
}

/** Extract bounded mono 16 kHz MP3 chunks from audio or video media. */
export async function prepareAudioChunks(path, { maxSeconds = 3600, chunkSeconds = 300, maxChunkBytes = 2 * 1024 * 1024, sampleRate = 16000, bitrate = "48k" } = {}) {
  if (!(await stat(path)).isFile()) throw new Error("Audio preparation input is not a file");
  for (const [name, value] of [["maxSeconds", maxSeconds], ["chunkSeconds", chunkSeconds], ["maxChunkBytes", maxChunkBytes], ["sampleRate", sampleRate]]) {
    if (!Number.isFinite(value) || value <= 0) throw new RangeError(`${name} must be positive`);
  }
  const durationSeconds = await mediaDurationSeconds(path);
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0 || durationSeconds > maxSeconds) throw new Error(`Audio preparation requires media lasting at most ${maxSeconds} seconds`);
  const temp = await mkdtemp(join(tmpdir(), "media-audio-"));
  const chunks = [];
  try {
    for (let offsetSeconds = 0; offsetSeconds < durationSeconds; offsetSeconds += chunkSeconds) {
      const file = join(temp, "audio.mp3");
      await run("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-threads", "1", "-ss", String(offsetSeconds), "-i", path, "-t", String(Math.min(chunkSeconds, durationSeconds - offsetSeconds)), "-vn", "-ac", "1", "-ar", String(sampleRate), "-c:a", "libmp3lame", "-b:a", bitrate, file], { timeout: 120_000, maxBuffer: 32_768 });
      const info = await stat(file);
      if (info.size > maxChunkBytes) throw new Error(`Audio chunk at ${offsetSeconds}s exceeds ${maxChunkBytes} bytes`);
      chunks.push({ offsetSeconds, bytes: await readFile(file) });
    }
    return { durationSeconds, chunks };
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
}
