/**
 * Provider-neutral consumer acceptance of generated/produced media bytes.
 * Publication remains a separate child-owned capability; only the existing
 * Bluesky image adapter recognizes an optional distribution packet.
 */
const IMAGES=new Set(["image/png","image/jpeg","image/webp"]);
const VIDEOS=new Set(["video/mp4","video/webm"]);
const AUDIO=new Set(["audio/mpeg","audio/ogg","audio/wav"]);
const DOCUMENTS=new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation"
]);
const nonempty=(x,label)=>{
  if(typeof x!=="string"||!x.trim())throw new TypeError(label+" must be nonempty");
  return x.trim();
};
const pos=(x,label)=>{
  if(!Number.isSafeInteger(x)||x<1)throw new TypeError(label+" must be positive");
  return x;
};
const relativePath=(v)=>{
  const path=nonempty(v,"asset path").replace(/\\/gu,"/");
  if(path.startsWith("/")||path.split("/").some(s=>!s||s==="."||s===".."))
    throw new TypeError("asset path must be clean relative under shared custody");
  return path;
};

export function admitAcceptedMediaAsset({asset,distribution}={}){
  if(!asset||typeof asset!=="object"||Array.isArray(asset))
    throw new TypeError("accepted review requires asset");
  const sha256=nonempty(asset.sha256,"asset sha256").toLowerCase();
  if(!/^[0-9a-f]{64}$/u.test(sha256))
    throw new TypeError("asset sha256 must be exact 64-digit hex");
  const mimeType=nonempty(asset.mimeType,"asset mimeType");
  if(!IMAGES.has(mimeType)&&!VIDEOS.has(mimeType)&&!AUDIO.has(mimeType)&&!DOCUMENTS.has(mimeType))
    throw new TypeError("unsupported accepted media MIME type");
  if(asset.metadataSanitized!==true)
    throw new TypeError("accepted media must have metadataSanitized=true");
  const accepted={relativePath:relativePath(asset.relativePath),sha256,mimeType,
    metadataSanitized:true};
  if(IMAGES.has(mimeType)){
    accepted.width=pos(asset.width,"image width");
    accepted.height=pos(asset.height,"image height");
    accepted.altText=nonempty(asset.altText,"image altText");
  }else if(VIDEOS.has(mimeType)){
    accepted.width=pos(asset.width,"video width");
    accepted.height=pos(asset.height,"video height");
    accepted.transcriptRef=nonempty(asset.transcriptRef,"video captions/transcript reference");
  }else if(AUDIO.has(mimeType)){
    accepted.transcriptRef=nonempty(asset.transcriptRef,"audio transcript reference");
  }else {
    accepted.accessibleTextRef=nonempty(asset.accessibleTextRef,"document accessible text reference");
  }
  let release;
  if(distribution!==undefined){
    if(!IMAGES.has(mimeType))
      throw new TypeError("current Bluesky distribution accepts only reviewed raster images");
    if(!distribution||distribution.channel!=="bluesky")
      throw new TypeError("current distribution adapter supports Bluesky only");
    release={
      channel:"bluesky",
      handle:nonempty(distribution.handle,"Bluesky handle"),
      text:nonempty(distribution.text,"Bluesky text"),
      url:nonempty(distribution.url,"Bluesky canonical URL")
    };
    const url=new URL(release.url);
    if(!["http:","https:"].includes(url.protocol))
      throw new TypeError("Bluesky canonical URL must be HTTP(S)");
  }
  return Object.freeze({
    asset:Object.freeze(accepted),
    ...(release?{distribution:Object.freeze(release)}:{})
  });
}
