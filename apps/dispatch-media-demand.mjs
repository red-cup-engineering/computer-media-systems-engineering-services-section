#!/usr/bin/env node
import { dispatchFreeFlowMediaDemand } from "../src/media-demand-dispatch.mjs";

const root = process.env.METROPLAT_WEB_DATA_DIR;
if (!root) throw new Error("METROPLAT_WEB_DATA_DIR is required");
const result = await dispatchFreeFlowMediaDemand({ root });
process.stdout.write(JSON.stringify(result)+"\n");
