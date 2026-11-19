import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { recordMediaPerformanceObservations } from "./media-performance-journal.mjs";

const ANALYTICS_FILE = "analytics.jsonl";

function analyticsFilesUnder(root) {
  const files=[];
  const visit=(dir)=>{
    for (const entry of readdirSync(dir,{withFileTypes:true})) {
      if ([".git","node_modules",".work"].includes(entry.name)) continue;
      const path=join(dir,entry.name);
      if (entry.isDirectory()) visit(path);
      else if (entry.isFile() && entry.name===ANALYTICS_FILE && dir.endsWith("production")) files.push(path);
    }
  };
  if (existsSync(root)) visit(root);
  return files.sort();
}

function readAnalytics(path) {
  return readFileSync(path,"utf8").split("\n").filter(Boolean).map((line,index)=>{
    try { return JSON.parse(line); }
    catch (error) { throw new Error(path+":"+(index+1)+": invalid JSON: "+error.message); }
  });
}

/**
 * Project every retained channel-local analytics row under one Public Education tree into the
 * Group semantic journal. Replay is safe: identical records append no second witness event.
 */
export function projectYouTubeAnalyticsTree({ educationRoot, dataRoot } = {}) {
  const sourceRoot=resolve(educationRoot);
  const custodyRoot=resolve(dataRoot);
  const files=analyticsFilesUnder(sourceRoot);
  const results=[];
  let rows=0, appended=0;
  for (const path of files) {
    const observations=readAnalytics(path);
    const relative=path.slice(sourceRoot.length+1).split("\\").join("/");
    const receipt=recordMediaPerformanceObservations({
      root:custodyRoot,
      observations,
      origin:"public-education-analytics:"+relative,
    });
    rows+=receipt.observations;
    appended+=receipt.appended;
    results.push(Object.freeze({path,observations:receipt.observations,appended:receipt.appended}));
  }
  return Object.freeze({
    type:"YouTubeAnalyticsProjection",
    educationRoot:sourceRoot,
    dataRoot:custodyRoot,
    files:files.length,
    observations:rows,
    appended,
    results:Object.freeze(results),
  });
}
