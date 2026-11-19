import { latestMediaPerformanceByVideo, youtubeVideoIdOf, parentYouTubeVideoIdOf } from "./media-performance-journal.mjs";
import { readMediaAllocationStates, readMediaArtifactReviews, readMediaDemandInbox } from "./media-demand-journal.mjs";
import { mediaArtifactReviewQueue } from "./media-artifact-review-queue.mjs";
import { mediaChannelCandidateReadout } from "./media-channel-candidates.mjs";

const number = (value) => { const n=Number(value); return Number.isFinite(n)?n:null; };
const ratio = (numerator, denominator) => (
  Number.isFinite(numerator) && Number.isFinite(denominator) && denominator > 0
    ? numerator / denominator : null
);
const rounded = (value, digits = 4) => Number.isFinite(value) ? Number(value.toFixed(digits)) : null;

function reportRows(facet){
  const report=facet?.status==="observed"?facet.report:null;
  if(!report || !Array.isArray(report.columnHeaders) || !Array.isArray(report.rows)) return [];
  const names=report.columnHeaders.map((header)=>header?.name??null);
  return report.rows.map((row)=>Object.freeze(Object.fromEntries(names.map((name,index)=>[name,row[index]]).filter(([name])=>typeof name==="string"))));
}

function performanceRow(row){
  const observation=row.observation;
  const statistics=observation.snapshot?.statistics??{};
  const basic=reportRows(observation.ownerAnalytics?.basic);
  const contentType=reportRows(observation.ownerAnalytics?.contentType);
  const trafficSources=reportRows(observation.ownerAnalytics?.trafficSources);
  const totals=basic[0]??{};
  const engagedViews=number(totals.engagedViews), views=number(totals.views);
  const watchMinutes=number(totals.estimatedMinutesWatched);
  const subscribersGained=number(totals.subscribersGained), subscribersLost=number(totals.subscribersLost);
  const subscriberNet=(subscribersGained!==null&&subscribersLost!==null)?subscribersGained-subscribersLost:null;
  const publishAt=observation.publishAt??null;
  const elapsedHours=publishAt && Date.parse(observation.observedAt)>=Date.parse(publishAt)
    ? (Date.parse(observation.observedAt)-Date.parse(publishAt))/3_600_000 : null;
  const contentTypes=contentType.map((item)=>item.creatorContentType).filter((value)=>typeof value==="string");
  const attention=Object.freeze({
    engagedViews,views,watchMinutes,
    averageViewDurationSeconds:number(totals.averageViewDuration),
    averageViewPercentage:number(totals.averageViewPercentage),
    likes:number(totals.likes),comments:number(totals.comments),shares:number(totals.shares),
    subscribersGained,subscribersLost,subscriberNet,
    elapsedHours:rounded(elapsedHours,2),
    viewsPerHour:rounded(ratio(views,elapsedHours)),
    engagedViewsPerHour:rounded(ratio(engagedViews,elapsedHours)),
    watchMinutesPerHour:rounded(ratio(watchMinutes,elapsedHours)),
    subscriberNetPer1000EngagedViews:subscriberNet===null?null:rounded(1000*ratio(subscriberNet,engagedViews)),
  });
  return Object.freeze({
    id:row.id,observedAt:observation.observedAt,channel:observation.channel,lessonId:observation.lessonId,
    mediaKind:observation.mediaKind,
    youtubeVideoId:youtubeVideoIdOf(observation),
    // Transitional projection for existing external consumers; internal
    // media portfolio calculations below use the named provider identity.
    videoId:youtubeVideoIdOf(observation),publishAt,
    ...(parentYouTubeVideoIdOf(observation)?{
      parentYouTubeVideoId:parentYouTubeVideoIdOf(observation),
      parentVideoId:parentYouTubeVideoIdOf(observation) // compatibility only
    }:{}),
    ...(observation.mediaNeed?{mediaNeed:observation.mediaNeed}:{}),
    ...(observation.allocation?{allocation:observation.allocation}:{}),
    snapshot:Object.freeze({
      views:number(statistics.viewCount),likes:number(statistics.likeCount),comments:number(statistics.commentCount),
    }),
    attention,
    classification:Object.freeze({
      contentTypes:Object.freeze(contentTypes),
      shortConfirmed:observation.mediaKind==="short" ? contentTypes.includes("SHORTS") : null,
    }),
    ownerAnalytics:Object.freeze({basic:Object.freeze(basic),contentType:Object.freeze(contentType),trafficSources:Object.freeze(trafficSources)}),
  });
}

function channelRows(performance){
  const channels=new Map();
  for(const row of performance){
    const current=channels.get(row.channel)??{channel:row.channel,trackedVideos:0,longForm:0,shorts:0,allocationLinkedShorts:0,snapshotViews:0,snapshotLikes:0,snapshotComments:0};
    current.trackedVideos+=1;
    if(row.mediaKind==="short"){current.shorts+=1;if(row.allocation)current.allocationLinkedShorts+=1;}else current.longForm+=1;
    for(const [field,key] of [["views","snapshotViews"],["likes","snapshotLikes"],["comments","snapshotComments"]]) if(row.snapshot[field]!==null) current[key]+=row.snapshot[field];
    channels.set(row.channel,current);
  }
  return [...channels.values()].sort((a,b)=>a.channel.localeCompare(b.channel)).map(Object.freeze);
}

function shortPairs(performance){
  const byVideo=new Map(performance.map((row)=>[row.youtubeVideoId,row]));
  return performance.filter((row)=>row.mediaKind==="short"&&row.parentYouTubeVideoId).map((short)=>{
    const parent=byVideo.get(short.parentYouTubeVideoId);
    const compare=(field)=>Object.freeze({
      parent:parent?.attention?.[field]??null,
      short:short.attention?.[field]??null,
      shortToParent:rounded(ratio(short.attention?.[field],parent?.attention?.[field])),
    });
    const shortAge=short.attention.elapsedHours, parentAge=parent?.attention?.elapsedHours??null;
    return Object.freeze({
      channel:short.channel,
      parentYouTubeVideoId:short.parentYouTubeVideoId,
      shortYouTubeVideoId:short.youtubeVideoId,
      // Retain exact historical readout fields until every remote consumer
      // explicitly accepts v2, never use them for internal joins.
      parentVideoId:short.parentYouTubeVideoId,shortVideoId:short.youtubeVideoId,
      parentObserved:parent?.observedAt??null,shortObserved:short.observedAt,
      parentPublishAt:parent?.publishAt??null,shortPublishAt:short.publishAt??null,
      mediaNeed:short.mediaNeed??null,allocation:short.allocation??null,
      shortClassificationConfirmed:short.classification.shortConfirmed,
      evidenceWindow:Object.freeze({
        parentHours:parentAge,shortHours:shortAge,
        comparable72h:Boolean(parentAge!==null&&shortAge!==null&&parentAge>=72&&shortAge>=72),
      }),
      comparisons:Object.freeze({
        viewsPerHour:compare("viewsPerHour"),
        engagedViewsPerHour:compare("engagedViewsPerHour"),
        watchMinutesPerHour:compare("watchMinutesPerHour"),
        averageViewPercentage:compare("averageViewPercentage"),
        subscriberNetPer1000EngagedViews:compare("subscriberNetPer1000EngagedViews"),
      }),
      contentType:Object.freeze(short.ownerAnalytics.contentType),
    });
  });
}

/** A descriptive CMO readout. It intentionally reports evidence and custody, not a universal media score. */
export function mediaPortfolioReadout({root,flow,repositoryRoot,env=process.env,now=new Date()}={}){
  const performance=latestMediaPerformanceByVideo({root}).map(performanceRow);
  const inbox=readMediaDemandInbox({root,now});
  const allocations=readMediaAllocationStates({root});
  const reviews=readMediaArtifactReviews({root});
  const reviewQueue=mediaArtifactReviewQueue({root,flow,now});
  const channelCandidates=repositoryRoot
    ? mediaChannelCandidateReadout({repositoryRoot,root,env,now})
    : null;
  return Object.freeze({
    type:"CausewayMediaPortfolioReadout",observedAt:now.toISOString(),
    demand:Object.freeze({counts:inbox.counts,frontier:inbox.frontier}),
    custody:Object.freeze({
      allocations:Object.freeze(allocations),
      reviews:Object.freeze(reviews),
      awaitingReview:reviewQueue.status==="complete"?reviewQueue.count:null,
      reviewStatus:reviewQueue.status,
    }),
    channelFormation:channelCandidates,
    youtube:Object.freeze({
      channels:Object.freeze(channelRows(performance)),
      videos:Object.freeze(performance),
      shortPairs:Object.freeze(shortPairs(performance)),
      experiment:Object.freeze({
        comparableShortPairs72h:shortPairs(performance).filter((row)=>row.evidenceWindow.comparable72h).length,
        confirmedShorts:performance.filter((row)=>row.mediaKind==="short"&&row.classification.shortConfirmed===true).length,
        unconfirmedShorts:performance.filter((row)=>row.mediaKind==="short"&&row.classification.shortConfirmed!==true).length,
        note:"This is descriptive evidence for explicit media decisions, not a universal media/viral score.",
      }),
      counts:Object.freeze({
        trackedVideos:performance.length,
        trackedShorts:performance.filter((row)=>row.mediaKind==="short").length,
        allocationLinkedShorts:performance.filter((row)=>row.mediaKind==="short"&&row.allocation).length,
      }),
    }),
  });
}
