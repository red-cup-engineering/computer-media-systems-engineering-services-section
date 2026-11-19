#!/usr/bin/env node
import { resolve } from "node:path";
import { projectYouTubeAnalyticsTree } from "../src/media-performance-projector.mjs";

const repo=process.env.METROPLAT_REPOSITORY_ROOT;
const data=process.env.METROPLAT_WEB_DATA_DIR;
if (!repo) throw new Error("METROPLAT_REPOSITORY_ROOT is required");
if (!data) throw new Error("METROPLAT_WEB_DATA_DIR is required");

const educationRoot=resolve(repo,
  "lib/emsenn/services/561-group/services/public-services-section/services/public-social-services-section/services/public-education-services-section");
process.stdout.write(JSON.stringify(projectYouTubeAnalyticsTree({educationRoot,dataRoot:data}))+"\n");
