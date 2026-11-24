#!/usr/bin/env node
import { mediaArtifactReviewQueue } from "../src/media-artifact-review-queue.mjs";
const root=process.env.METROPLAT_WEB_DATA_DIR;
if(!root) throw new Error("METROPLAT_WEB_DATA_DIR is required");
process.stdout.write(JSON.stringify(mediaArtifactReviewQueue({root}),null,2)+"\n");
