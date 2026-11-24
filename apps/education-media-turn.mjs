#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { dispatchEducationShortProbe, projectEducationShortDemand, reconcileEducationShorts } from "../src/education-short-market.mjs";

const dataRoot=process.env.METROPLAT_WEB_DATA_DIR;
if(!dataRoot) throw new Error("METROPLAT_WEB_DATA_DIR is required");
// The independent Education package owns its CLI and checkpoint; derive both
// from its admitted export rather than a no-longer-existing nested source tree.
const educationCli=fileURLToPath(import.meta.resolve("@causeway-services/public-education-services-section/cli"));
const educationRoot=dirname(dirname(educationCli));
const run=(entry,...args)=>execFileSync(process.execPath,[...process.execArgv,join(educationRoot,entry),...args],{cwd:educationRoot,env:process.env,stdio:"inherit"});
let failure;
try{
  run("src/cli.mjs","produce","all");
  const demand=await projectEducationShortDemand({root:dataRoot});
  process.stdout.write(JSON.stringify(demand)+"\n");
  const probe=await dispatchEducationShortProbe({root:dataRoot});
  process.stdout.write(JSON.stringify(probe)+"\n");
  const reconciled=await reconcileEducationShorts({root:dataRoot});
  process.stdout.write(JSON.stringify(reconciled)+"\n");
}catch(error){failure=error;}
finally{
  try{run("scripts/checkpoint.mjs");}
  catch(checkpointError){if(failure===undefined)failure=checkpointError;else process.stderr.write(`checkpoint after failed education-media turn also failed: ${checkpointError.message}\n`);}
}
if(failure) throw failure;
