#!/usr/bin/env node
// CLI for a consumer-accepted POD release. No public issue webhook may invoke 'stage'.
import { readFileSync } from 'node:fs';
import { resolve, sep } from 'node:path';
import { validatePrintifyRelease, stagePrintifyDraft } from '../src/pod-printify.mjs';

async function main() {
  const [mode, path] = process.argv.slice(2);
  if (!['check','stage'].includes(mode) || !path) {
    throw new TypeError('usage: node apps/pod-printify.mjs check|stage products/.../release.json');
  }
  const root=resolve(process.cwd());
  const filename=resolve(root,path);
  if(!filename.startsWith(root+sep)) throw new TypeError('release file must be within repository');
  const release=JSON.parse(readFileSync(filename,'utf8'));
  if(mode==='check'){
    const validation=validatePrintifyRelease(release);
    console.log(JSON.stringify({type:'PrintifyDraftQualification',state:'ready-for-independent-approval',marker:validation.marker,shopId:validation.provider.shopId,placements:validation.placements.length}));
    return;
  }
  const outcome=await stagePrintifyDraft({raw:release,root,token:process.env.PRINTIFY_TOKEN,shopId:process.env.PRINTIFY_SHOP_ID});
  console.log(JSON.stringify(outcome));
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
