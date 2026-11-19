#!/usr/bin/env node
import { dispatchEducationShortProbe } from "../src/education-short-market.mjs";
const root=process.env.METROPLAT_WEB_DATA_DIR;
if(!root) throw new Error("METROPLAT_WEB_DATA_DIR is required");
process.stdout.write(JSON.stringify(await dispatchEducationShortProbe({root}),null,2)+"\n");
