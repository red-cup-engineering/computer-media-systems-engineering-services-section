import { createHash } from 'node:crypto';
import { readFileSync, realpathSync, statSync } from 'node:fs';
import { resolve, sep } from 'node:path';
import { admitAcceptedMediaAsset } from './media-accepted-asset-contract.mjs';

const text = (value, field) => {
  if (typeof value !== 'string' || !value.trim()) throw new TypeError(`${field} must be nonempty`);
  return value.trim();
};
const integer = (value, field) => {
  if (!Number.isSafeInteger(value) || value <= 0) throw new TypeError(`${field} must be positive integer`);
  return value;
};
const reference = (value, field) => {
  const raw = text(value, field);
  const u = new URL(raw);
  if (u.protocol !== 'https:' || !u.hostname) throw new TypeError(`${field} must be HTTPS`);
  return raw;
};
const finite = (value, field) => {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new TypeError(`${field} must be finite number`);
  return value;
};
const digestOf = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');

// Validate handoff data. Referenced approvals must be verified by independent receiving authority.
export function qualifyPrintifyRelease(raw) {
  if (!raw || raw.type !== 'AcceptedPODProduct' || raw.version !== 1)
    throw new TypeError('requires AcceptedPODProduct version 1; creative proposals cannot be staged');
  if (raw.state !== 'accepted-for-provider-draft')
    throw new TypeError('POD release needs consumer acceptance for a provider draft');
  const id = text(raw.id, 'product id');
  if (!/^[a-z][a-z0-9-]{1,63}$/u.test(id)) throw new TypeError('product id must be URL-safe');
  const authority = Object.freeze({
    sourceIssue: reference(raw.authority?.sourceIssue, 'source issue'),
    mediaAcceptanceRef: reference(raw.authority?.mediaAcceptanceRef, 'media acceptance'),
    productAcceptanceRef: reference(raw.authority?.productAcceptanceRef, 'product acceptance'),
    receiverAcceptanceRef: reference(raw.authority?.receiverAcceptanceRef, 'receiving store acceptance'),
  });
  const title = text(raw.title, 'title');
  const description = text(raw.description, 'description');
  if (title.length > 120) throw new TypeError('title too long');
  const provider = raw.provider;
  if (provider?.kind !== 'printify') throw new TypeError('provider must be printify');
  const shopId = integer(provider.shopId, 'shopId');
  const blueprintId = integer(provider.blueprintId, 'blueprintId');
  const printProviderId = integer(provider.printProviderId, 'printProviderId');
  if (!Array.isArray(provider.variants) || !provider.variants.length)
    throw new TypeError('at least one manufacturer-verified variant required');
  const variants = provider.variants.map((v, index) => ({
    id: integer(v?.id, `variant ${index} id`),
    price: integer(v?.retailPriceCents, `variant ${index} retailPriceCents`),
    is_enabled: true,
  }));
  if (new Set(variants.map(v => v.id)).size !== variants.length) throw new TypeError('duplicate variant IDs');
  if (!Array.isArray(raw.placements) || !raw.placements.length)
    throw new TypeError('at least one accepted production placement required');
  const placements = raw.placements.map((p, index) => {
    const position = text(p?.position, `placement ${index} position`);
    if (!/^[a-z][a-z0-9_-]*$/u.test(position)) throw new TypeError('invalid Printify position');
    const accepted = admitAcceptedMediaAsset({ asset: p?.asset }).asset;
    if (accepted.mimeType !== 'image/png') throw new TypeError('Printify print artwork must be accepted PNG; mockups do not qualify');
    const x = finite(p.x, 'image x'), y = finite(p.y, 'image y');
    const scale = finite(p.scale, 'image scale'), angle = finite(p.angle, 'image angle');
    if (x < 0 || x > 1 || y < 0 || y > 1 || scale <= 0 || scale > 10 || angle < -360 || angle > 360)
      throw new TypeError('provider placement geometry out of range');
    return Object.freeze({ position, asset: accepted, x, y, scale, angle });
  });
  if (new Set(placements.map(p => p.position)).size !== placements.length)
    throw new TypeError('duplicate placement positions');
  const marker = `561pod-${id}-${digestOf({id,title,description,provider:{shopId,blueprintId,printProviderId,variants},placements}).slice(0,16)}`;
  return Object.freeze({ id, title, description, authority, provider: Object.freeze({shopId,blueprintId,printProviderId,variants}), placements, marker });
}

function assetBytes(root, asset) {
  const base = realpathSync(root), file = realpathSync(resolve(base, asset.relativePath));
  if (file !== base && !file.startsWith(base + sep)) throw new Error('artwork escaped source custody');
  if (!statSync(file).isFile()) throw new Error('artwork must be a regular file');
  const bytes = readFileSync(file);
  if (createHash('sha256').update(bytes).digest('hex') !== asset.sha256) throw new Error('artwork SHA-256 mismatch');
  if (bytes.length < 33 || !bytes.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex')) || bytes.toString('ascii', 12, 16) !== 'IHDR')
    throw new Error('artwork is not a PNG');
  if (bytes.readUInt32BE(16) !== asset.width || bytes.readUInt32BE(20) !== asset.height)
    throw new Error('accepted art pixel dimensions disagree with PNG');
  let offset = 8, ended = false;
  while (offset + 12 <= bytes.length) {
    const size = bytes.readUInt32BE(offset);
    if (offset + size + 12 > bytes.length) throw new Error('truncated PNG chunk');
    const kind = bytes.toString('ascii', offset + 4, offset + 8);
    if (['tEXt','zTXt','iTXt','eXIf'].includes(kind)) throw new Error('PNG still carries ancillary metadata');
    offset += size + 12;
    if (kind === 'IEND') { ended = true; break; }
  }
  if (!ended || offset !== bytes.length) throw new Error('PNG contains incomplete or trailing bytes');
  if (bytes.length > 5 * 1024 * 1024)
    throw new Error('image over 5 MiB; use provider-verified HTTPS source upload instead of inline data');
  return bytes;
}

// A pure draft payload, testable without a provider account.
export function makePrintifyDraftPayload(release, imageIds) {
  if (!Array.isArray(imageIds) || imageIds.length !== release.placements.length)
    throw new TypeError('one returned upload image ID required per placement');
  const placeholders = release.placements.map((p, index) => ({
    position: p.position,
    images: [{id:text(imageIds[index], 'image id'), x:p.x, y:p.y, scale:p.scale, angle:p.angle}],
  }));
  return {
    title: release.title,
    description: release.description,
    tags: [release.marker],
    blueprint_id: release.provider.blueprintId,
    print_provider_id: release.provider.printProviderId,
    variants: release.provider.variants,
    print_areas: [{variant_ids: release.provider.variants.map(v=>v.id), placeholders}],
  };
}

async function jsonRequest({fetch,token,path,method='GET',body}) {
  const response = await fetch(`https://api.printify.com/v1${path}`, {
    method, headers:{Authorization:`Bearer ${token}`,Accept:'application/json',...(body?{'Content-Type':'application/json'}:{})},
    ...(body?{body:JSON.stringify(body)}:{}),
  });
  if (!response.ok) throw new Error(`Printify ${method} ${path} failed (${response.status}); no release recorded`);
  const payload = await response.json();
  if (!payload || typeof payload !== 'object') throw new Error('Printify returned non-object JSON');
  return payload;
}

async function findExisting({fetch,token,shopId,marker}) {
  for(let page=1;page<=20;page++) {
    const result = await jsonRequest({fetch,token,path:`/shops/${shopId}/products.json?limit=100&page=${page}`});
    if (!Array.isArray(result.data)) throw new Error('Printify list response lacks data: fail closed');
    const matches = result.data.filter(p=>Array.isArray(p.tags)&&p.tags.includes(marker));
    if(matches.length>1) throw new Error('ambiguous duplicate Printify draft for release marker');
    if(matches.length===1) return matches[0];
    if (page >= (result.last_page??page)) return null;
  }
  throw new Error('Printify pagination exceeds bounded search; fail closed before product mutation');
}

// Stage a provider-side draft, never a public listing or physical order.
export async function stagePrintifyDraft({raw,root,token,shopId,fetch=globalThis.fetch}) {
  const release = qualifyPrintifyRelease(raw);
  const credential = text(token,'PRINTIFY_TOKEN');
  const suppliedShopId = integer(Number(shopId),'PRINTIFY_SHOP_ID');
  if(suppliedShopId !== release.provider.shopId) throw new Error('connected shop differs from accepted product receiving shop');
  // Check local assets before making any provider request.
  const images = release.placements.map(p=>assetBytes(root,p.asset));
  const prior = await findExisting({fetch,token:credential,shopId:suppliedShopId,marker:release.marker});
  if(prior) {
    if(prior.title !== release.title || prior.blueprint_id !== release.provider.blueprintId || prior.print_provider_id !== release.provider.printProviderId)
      throw new Error('existing Printify product marker disagrees with release');
    return {type:'PrintifyDraftReceiving',status:'existing',productId:prior.id,marker:release.marker,shopId:suppliedShopId};
  }
  // Catalog is the provider's current source of truth, not the release's guessed IDs.
  // This read must succeed before any image upload or product creation.
  const catalog=await jsonRequest({fetch,token:credential,path:`/catalog/blueprints/${release.provider.blueprintId}/print_providers/${release.provider.printProviderId}/variants.json`});
  const available=Array.isArray(catalog)?catalog:Array.isArray(catalog.variants)?catalog.variants:Array.isArray(catalog.data)?catalog.data:null;
  if(!available) throw new Error('Printify catalog response has no variants; fail closed');
  for(const selected of release.provider.variants){
    const actual=available.find(v=>v.id===selected.id);
    if(!actual) throw new Error('selected manufacturer variant is not in current stock catalog');
    if(actual.is_available===false) throw new Error('selected manufacturer variant is out of stock');
    if(Number.isInteger(actual.cost) && selected.price<=actual.cost)
      throw new Error('retail price cannot cover currently quoted base production cost');
  }
  const uploaded=[];
  for(let i=0;i<images.length;i++) {
    const response=await jsonRequest({fetch,token:credential,path:'/uploads/images.json',method:'POST',body:{
      file_name:`${release.id}-${release.placements[i].position}-${release.placements[i].asset.sha256.slice(0,12)}.png`,
      contents:images[i].toString('base64'),
    }});
    if(typeof response.id!=='string'||!response.id || response.width!==release.placements[i].asset.width || response.height!==release.placements[i].asset.height)
      throw new Error('Printify uploaded file receipt does not match accepted image');
    uploaded.push(response.id);
  }
  const created=await jsonRequest({fetch,token:credential,path:`/shops/${suppliedShopId}/products.json`,method:'POST',body:makePrintifyDraftPayload(release,uploaded)});
  if(typeof created.id!=='string'||!created.id) throw new Error('Printify did not return created product ID');
  const witnessed=await jsonRequest({fetch,token:credential,path:`/shops/${suppliedShopId}/products/${encodeURIComponent(created.id)}.json`});
  if(witnessed.id!==created.id || witnessed.title!==release.title || !witnessed.tags?.includes(release.marker))
    throw new Error('Printify created draft failed independent read-back; do not claim acceptance');
  return {type:'PrintifyDraftReceiving',status:'created',productId:created.id,marker:release.marker,shopId:suppliedShopId};
}
