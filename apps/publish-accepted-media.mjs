#!/usr/bin/env node
import { publishAcceptedMedia } from "../src/accepted-media-publication.mjs";
const root=process.env.METROPLAT_WEB_DATA_DIR;
if(!root) throw new Error("METROPLAT_WEB_DATA_DIR is required");
process.stdout.write(JSON.stringify(await publishAcceptedMedia({root}),null,2)+"\n");
