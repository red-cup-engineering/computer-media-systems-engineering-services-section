#!/usr/bin/env node
import { mediaChannelCandidateReadout } from "../src/media-channel-candidates.mjs";
const root=process.env.METROPLAT_WEB_DATA_DIR;
if(!root) throw new Error("METROPLAT_WEB_DATA_DIR is required");
process.stdout.write(JSON.stringify(mediaChannelCandidateReadout({root}),null,2)+"\n");
