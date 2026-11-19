#!/usr/bin/env node
import { mediaPortfolioReadout } from "../src/media-portfolio-readout.mjs";
const root=process.env.METROPLAT_WEB_DATA_DIR;
if(!root) throw new Error("METROPLAT_WEB_DATA_DIR is required");
process.stdout.write(JSON.stringify(mediaPortfolioReadout({root,repositoryRoot:process.env.METROPLAT_REPOSITORY_ROOT,env:process.env}),null,2)+"\n");
