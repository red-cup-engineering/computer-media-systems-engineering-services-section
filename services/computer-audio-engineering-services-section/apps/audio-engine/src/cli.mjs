#!/usr/bin/env node
// cli.mjs -- audio-engine: the composed CLI face over audio-services-section's
// scripts. parse reads a WAV's header/summary; generate renders a tone to a
// WAV; interpret measures a WAV's pitch/envelope. Each subcommand is a thin
// call into its own scripts/<verb>-<noun>.mjs -- no logic lives here.

import { parseWavInfo } from '../../../scripts/parse-wav-info.mjs';
import { generateToneToWav } from '../../../scripts/generate-tone-to-wav.mjs';
import { interpretWavPitch } from '../../../scripts/interpret-wav-pitch.mjs';

const USAGE = `usage: audio-engine <command> [args]
  parse <path.wav>                          print header/summary facts as JSON
  generate <freqHz> <outPath.wav> [sine|pluck]  render a tone and write it
  interpret <path.wav>                      print measured pitch/envelope facts as JSON`;

/**
 * @param {string[]} argv - argv slice after the command name (process.argv.slice(2))
 * @returns {Promise<unknown>} the command's result, already written to stdout as JSON when applicable
 */
export async function runAudioEngine(argv) {
  const [command, ...rest] = argv;
  switch (command) {
    case 'parse': {
      const result = await parseWavInfo(rest[0]);
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      return result;
    }
    case 'generate': {
      const [freqHzStr, outPath, source] = rest;
      const result = await generateToneToWav({ freqHz: Number(freqHzStr), outPath, source: source ?? 'sine' });
      process.stdout.write(`${JSON.stringify(result)}\n`);
      return result;
    }
    case 'interpret': {
      const result = await interpretWavPitch(rest[0]);
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      return result;
    }
    default:
      throw new Error(`unknown command '${command ?? ''}'\n\n${USAGE}`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runAudioEngine(process.argv.slice(2)).catch((error) => {
    process.stderr.write(`audio-engine: ${error.message}\n`);
    process.exitCode = 1;
  });
}
