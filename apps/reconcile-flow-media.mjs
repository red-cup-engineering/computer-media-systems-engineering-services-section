#!/usr/bin/env node
import { reconcileFlowMediaAllocations } from "../src/media-flow-reconciliation.mjs";
const root=process.env.METROPLAT_WEB_DATA_DIR;
if(!root) throw new Error("METROPLAT_WEB_DATA_DIR is required");
process.stdout.write(JSON.stringify(reconcileFlowMediaAllocations({root}))+"\n");
