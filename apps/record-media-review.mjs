#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { recordMediaArtifactReview } from "../src/media-demand-journal.mjs";
const root=process.env.METROPLAT_WEB_DATA_DIR;
if(!root) throw new Error("METROPLAT_WEB_DATA_DIR is required");
const input=JSON.parse(readFileSync(0,"utf8"));
process.stdout.write(JSON.stringify(recordMediaArtifactReview({root,...input}),null,2)+"\n");
