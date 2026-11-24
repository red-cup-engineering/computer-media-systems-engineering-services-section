#!/usr/bin/env node
/** Consume one EXISTING requirement and one consumer-authored media brief. */
import {readFileSync} from "node:fs";
import {proposeMediaNeedFromRequirement} from "../src/media-from-requirement.mjs";
const [requirementPath,briefPath,...rest]=process.argv.slice(2);
if(!requirementPath||!briefPath||rest.length)
  throw new Error("Usage: media-from-requirement.mjs content/requirements/EXISTING.json requirements/media/brief.json");
const requirement=JSON.parse(readFileSync(requirementPath,"utf8"));
const brief=JSON.parse(readFileSync(briefPath,"utf8"));
const proposal=proposeMediaNeedFromRequirement({requirement,brief,sourcePath:requirementPath});
process.stdout.write(JSON.stringify(proposal,null,2)+"\n");
