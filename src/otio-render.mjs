/**
 * Render the video cuts in a real OpenTimelineIO Timeline.1/Track.1/Clip.2
 * using FFmpeg. OTIO remains the EDITABLE source of the edit; MP4 is its
 * observed binary projection, not an invented source-of-truth timeline.
 *
 * Source references are admitted against caller-supplied, byte-checked media.
 * Cut source_range is SOURCE-relative, not a parent-track position. Track
 * order places clips in the finished movie; out-of-order and shortened source
 * ranges are meaningful editorial actions. Transitions and arbitrary effects
 * are deliberately NOT supported or silently ignored.
 *
 * This is a neutral media transform, not a reviewer, rights authority,
 * publisher, SignCell replacement, Notebook provider or YouTube uploader.
 */
import {createHash,randomUUID} from 'node:crypto';
import {createReadStream} from 'node:fs';
import {lstat,mkdir,mkdtemp,readFile,realpath,rm,link} from 'node:fs/promises';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {execFile as execFileCallback} from 'node:child_process';
import {promisify} from 'node:util';

const execFile=promisify(execFileCallback);
const NI=/^ni:\/\/\/sha-256;[A-Za-z0-9_-]{43}$/u;
const unique=x=>new Set(x).size===x.length;
const requireValid=(yes,message)=>{if(!yes)throw new TypeError(message)};
const sourceMime=new Set(['video/mp4','video/webm','video/quicktime']);
const permittedRates=new Set([24,25,30,60]);
const integer=value=>Number.isSafeInteger(value)&&value>=0;
export const OTIO_RENDER_TYPE='SourceBoundOtioRenderedVideo';

async function contentNi(file){
 const digest=createHash('sha256');
 for await(const bytes of createReadStream(file))digest.update(bytes);
 return 'ni:///sha-256;'+digest.digest('base64url');
}
async function probe(file){
 const {stdout}=await execFile('ffprobe',['-v','error','-show_entries',
  'format=duration:stream=codec_type,width,height','-of','json',file],
  {timeout:30000,maxBuffer:65536});
 const data=JSON.parse(stdout),durationSeconds=Number(data.format?.duration);
 requireValid(Number.isFinite(durationSeconds)&&durationSeconds>0&&durationSeconds<=7200,
  'OTIO source has no bounded finite media duration');
 const videoStreams=(data.streams??[]).filter(x=>x.codec_type==='video');
 const audioStreams=(data.streams??[]).filter(x=>x.codec_type==='audio');
 requireValid(videoStreams.length===1&&audioStreams.length<=1,
  'OTIO edit requires exactly one video and at most one audio source track');
 requireValid(Number.isSafeInteger(videoStreams[0].width)&&videoStreams[0].width>0&&
  Number.isSafeInteger(videoStreams[0].height)&&videoStreams[0].height>0,
  'OTIO edit video stream has invalid pixel geometry');
 return {durationSeconds,hasAudio:audioStreams.length===1,
  width:videoStreams[0].width,height:videoStreams[0].height};
}
const milliseconds=value=>{
 requireValid(value?.OTIO_SCHEMA==='RationalTime.1'&&value.rate===1000&&integer(value.value),
  'OTIO cut timing requires whole exact milliseconds in RationalTime.1 at rate 1000');
 return value.value;
};

/** Pure semantic preflight on actual standard OTIO, not another file format. */
export function admitOtioVideoCuts({edit,sourceMedia,frameRate=30,width=1280,height=720}={}){
 requireValid(edit?.OTIO_SCHEMA==='Timeline.1'&&
  edit.tracks?.OTIO_SCHEMA==='Stack.1'&&
  Array.isArray(edit.tracks.children)&&edit.tracks.children.length===1&&
  edit.tracks.children[0]?.OTIO_SCHEMA==='Track.1'&&
  edit.tracks.children[0]?.kind==='Video',
  'A single original OpenTimelineIO Video Track is required');
 requireValid(permittedRates.has(frameRate)&&integer(width)&&integer(height)&&
  width>=160&&height>=90&&width%2===0&&height%2===0&&width<=3840&&height<=2160,
  'Bounded even target dimensions and supported integer frame rate are required');
 requireValid(Array.isArray(sourceMedia)&&sourceMedia.length>0&&sourceMedia.length<=32,
  'One to 32 explicitly owned original source files are required');
 const sourceByNi=new Map();
 for(const record of sourceMedia){
  requireValid(record&&NI.test(record.sourceVideoNi??'')&&
   typeof record.filePath==='string'&&record.filePath.length>0&&
   sourceMime.has(record.mediaType),'Accepted source must name NI, original file and media type');
  requireValid(!sourceByNi.has(record.sourceVideoNi),'Duplicate source content identity');
  sourceByNi.set(record.sourceVideoNi,record);
 }
 const track=edit.tracks.children[0],clips=track.children;
 requireValid(Array.isArray(clips)&&clips.length>=2&&clips.length<=32,
  'Actual editorial arrangement requires two to 32 OTIO cuts');
 requireValid(!track.effects?.length&&
  (!edit.effects||edit.effects.length===0),
  'Unsupported OTIO track effects must not be silently discarded');
 let totalMilliseconds=0;
 const cuts=clips.map((clip,index)=>{
  requireValid(clip?.OTIO_SCHEMA==='Clip.2'&&clip.enabled===true&&
   !clip.effects?.length,'Unsupported or disabled OTIO clip cannot be silently rendered');
  const media=clip.media_references?.[clip.active_media_reference_key];
  requireValid(media?.OTIO_SCHEMA==='ExternalReference.1'&&
   typeof media.target_url==='string'&&media.target_url.startsWith('file:///'),
   'Every clip requires an original local OTIO ExternalReference');
  const sourceVideoNi=media.metadata?.causeway?.sourceVideoNi;
  const source=sourceByNi.get(sourceVideoNi);
  requireValid(source,'OTIO source reference is not in the admitted byte-identity set');
  requireValid(media.target_url===pathToFileURL(resolve(source.filePath)).href,
   'OTIO media URL and separately held source file differ');
  requireValid(clip.source_range?.OTIO_SCHEMA==='TimeRange.1',
   'OTIO clip requires explicit source-relative TimeRange.1');
  const startMilliseconds=milliseconds(clip.source_range.start_time),
   durationMilliseconds=milliseconds(clip.source_range.duration);
  requireValid(durationMilliseconds>=100,'OTIO cut is shorter than 100 milliseconds');
  totalMilliseconds+=durationMilliseconds;
  requireValid(totalMilliseconds<=7_200_000,'OTIO source edit exceeds two hours');
  return Object.freeze({
   clipIndex:index,clipName:String(clip.name??'').slice(0,120),
   sourceVideoNi,sourceFilePath:source.filePath,
   sourceStartMilliseconds:startMilliseconds,durationMilliseconds
  });
 });
 requireValid(unique(sourceMedia.map(x=>resolve(x.filePath))),
  'Original media paths cannot claim multiple distinct byte identities');
 return Object.freeze({type:'AdmittedSourceBoundOtioVideoCuts',schemaVersion:1,
  frameRate,width,height,expectedDurationSeconds:totalMilliseconds/1000,
  cuts:Object.freeze(cuts)});
}
const seconds=milliseconds=>(milliseconds/1000).toFixed(3);

/** Real source read, FFmpeg decode/trim/concat and independent ffprobe output
 * inspection. The destination is write-once, and source files never mutate. */
export async function renderOtioVideoCuts({
 editPath,sourceMedia,outputPath,frameRate=30,width=1280,height=720,
 timeoutMs=300000
}={}){
 requireValid(typeof editPath==='string'&&editPath.endsWith('.otio')&&
  typeof outputPath==='string'&&outputPath.endsWith('.mp4')&&
  integer(timeoutMs)&&timeoutMs>=10000&&timeoutMs<=3_600_000,
  'A named OTIO source, MP4 destination and bounded FFmpeg time budget are required');
 const editStats=await lstat(editPath);
 requireValid(editStats.isFile()&&!editStats.isSymbolicLink()&&editStats.size<=2_000_000,
  'OTIO source must be a bounded regular file');
 const editBytes=await readFile(editPath);
 const edit=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(editBytes));
 const plan=admitOtioVideoCuts({edit,sourceMedia,frameRate,width,height});
 const output=resolve(outputPath),otioReal=await realpath(editPath);
 requireValid(output!==otioReal,'Output cannot overwrite original OTIO source');
 const byPath=new Map(),sourceOrder=[];
 for(const cut of plan.cuts)if(!byPath.has(cut.sourceFilePath)){
  const original=resolve(cut.sourceFilePath);
  const stat=await lstat(original),actual=await realpath(original);
  requireValid(stat.isFile()&&!stat.isSymbolicLink()&&original===actual,
   'Original media must be a physically held regular file, not a symlink');
  requireValid(output!==original&&otioReal!==original,
   'Output must not collide with a media source');
  const digest=await contentNi(original);
  requireValid(digest===cut.sourceVideoNi,'Source media bytes differ from their exact OTIO witness');
  const observed=await probe(original);
  byPath.set(cut.sourceFilePath,{index:sourceOrder.length,...observed});
  sourceOrder.push(original);
 }
 for(const cut of plan.cuts){
  const media=byPath.get(cut.sourceFilePath);
  requireValid(cut.sourceStartMilliseconds+cut.durationMilliseconds<=
   Math.floor(media.durationSeconds*1000)+35,
   'OTIO trim range extends beyond the observed original media source');
 }
 const graph=[],segments=[];
 for(const cut of plan.cuts){
  const source=byPath.get(cut.sourceFilePath),i=cut.clipIndex,
   start=seconds(cut.sourceStartMilliseconds),duration=seconds(cut.durationMilliseconds),
   reference=source.index;
  graph.push('['+reference+':v:0]trim=start='+start+':duration='+duration+
    ',setpts=PTS-STARTPTS,fps='+frameRate+
    ',scale='+width+':'+height+':force_original_aspect_ratio=decrease:flags=bicubic'+
    ',pad='+width+':'+height+':(ow-iw)/2:(oh-ih)/2,setsar=1,format=yuv420p[v'+i+']');
  if(source.hasAudio)graph.push('['+reference+':a:0]atrim=start='+start+
   ':duration='+duration+',asetpts=PTS-STARTPTS,aresample=48000,'+
   'aformat=channel_layouts=stereo,apad=whole_dur='+duration+
   ',atrim=duration='+duration+'[a'+i+']');
  else graph.push('anullsrc=r=48000:cl=stereo:d='+duration+'[a'+i+']');
  segments.push('[v'+i+'][a'+i+']');
 }
 graph.push(segments.join('')+'concat=n='+plan.cuts.length+':v=1:a=1[vout][aout]');
 await mkdir(dirname(output),{recursive:true});
 const stage=await mkdtemp(join(dirname(output),'.otio-master-'));
 const temporary=join(stage,'received.mp4');
 let created=false;
 try{
  const args=['-nostdin','-y','-hide_banner','-loglevel','error','-threads','1'];
  for(const input of sourceOrder)args.push('-i',input);
  args.push('-filter_complex',graph.join(';'),'-map','[vout]','-map','[aout]',
    '-map_metadata','-1','-map_chapters','-1',
    '-c:v','libx264','-preset','veryfast','-crf','23','-pix_fmt','yuv420p',
    '-c:a','aac','-ar','48000','-ac','2','-b:a','128k',
    '-movflags','+faststart',temporary);
  await execFile('ffmpeg',args,{timeout:timeoutMs,maxBuffer:32768});
  const observed=await probe(temporary);
  requireValid(observed.width===width&&observed.height===height&&observed.hasAudio,
   'Encoded OTIO movie lacks the expected video/audio tracks or dimensions');
  requireValid(Math.abs(observed.durationSeconds-plan.expectedDurationSeconds)<=
   Math.max(.18,2/frameRate),
   'Encoded OTIO movie duration differs from the admitted editorial cuts');
  const outputNi=await contentNi(temporary);
  try{await link(temporary,output);created=true}catch(error){
   if(error?.code!=='EEXIST')throw error;
  }
  requireValid(await contentNi(output)===outputNi,
   'An existing editorial master conflicts with the original render; never overwrite');
  return Object.freeze({
   type:OTIO_RENDER_TYPE,schemaVersion:1,
   status:created?'rendered-original-OTIO':'identical-master-already-received',
   sourceOtioNi:'ni:///sha-256;'+createHash('sha256').update(editBytes).digest('base64url'),
   outputVideoPath:output,outputVideoNi:outputNi,mediaType:'video/mp4',
   outputDurationSeconds:observed.durationSeconds,expectedDurationSeconds:plan.expectedDurationSeconds,
   width,height,frameRate,clipCount:plan.cuts.length,
   sourceVideoNis:Object.freeze([...new Set(plan.cuts.map(x=>x.sourceVideoNi))]),
   qualification:'Actually decoded, trimmed, concatenated and observed video. Separate artistic/editorial acceptance, media rights, closed captions and public playback are still required.'
  });
 }finally{await rm(stage,{recursive:true,force:true})}
}
