#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { validateStockScreenBatch } from "../src/stock-screen.mjs";

const file = process.argv[2] ?? `${process.env.PUBLIC_MEDIA_SERVICES_SECTION_ROOT ?? process.cwd()}/data/stock-assets/koios-live-article-art-screen-20261006.json`;
const batch = JSON.parse(await readFile(file, "utf8"));
const result = validateStockScreenBatch(batch);
process.stdout.write(JSON.stringify(result) + "\n");
if (!result.valid) process.exitCode = 1;
