#!/usr/bin/env node
import { reconcileEducationShorts } from "../src/education-short-market.mjs";
const root=process.env.METROPLAT_WEB_DATA_DIR;
if(!root) throw new Error("METROPLAT_WEB_DATA_DIR is required");
process.stdout.write(JSON.stringify(await reconcileEducationShorts({root}),null,2)+"\n");
