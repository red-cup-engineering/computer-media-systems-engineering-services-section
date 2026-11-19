/** Pure MediaNeed admission; no provider SDK, journal or allocator dependency. */
const TEXT = (value, label) => {
  if (typeof value !== "string" || !value.trim()) throw new TypeError(`${label} must be nonempty text`);
  return value.trim();
};
const INTEGER = (value, label, fallback = 0) => {
  const resolved = value ?? fallback;
  if (!Number.isSafeInteger(resolved)) throw new TypeError(`${label} must be an integer`);
  return resolved;
};
const instant = (value, label) => {
  if (value === undefined || value === null) return null;
  const time = Date.parse(value);
  if (!Number.isFinite(time)) throw new TypeError(`${label} must be an instant`);
  return new Date(time).toISOString();
};

export function admitMediaNeed(value) {
  if (!value || value.type !== "MediaNeed") throw new TypeError("media need type must be MediaNeed");
  const id = TEXT(value.id, "media need id");
  const consumer = TEXT(value.consumer, "media need consumer");
  const objective = TEXT(value.objective, "media need objective");
  const openedAt = instant(value.openedAt, "media need openedAt");
  if (!openedAt) throw new TypeError("media need openedAt is required");
  const expiresAt = instant(value.expiresAt, "media need expiresAt");
  if (expiresAt && Date.parse(expiresAt) <= Date.parse(openedAt)) throw new TypeError("media need expiresAt must follow openedAt");
  if (!Array.isArray(value.artifacts) || value.artifacts.length === 0) throw new TypeError("media need needs at least one artifact demand");
  const artifacts = value.artifacts.map((artifact,index)=>{
    const capability=TEXT(artifact?.capability,`artifact ${index} capability`);
    const purpose=TEXT(artifact?.purpose,`artifact ${index} purpose`);
    const disposition=artifact?.disposition ?? "admissible";
    if (!["admissible","conditional","hold","ineligible"].includes(disposition)) throw new TypeError(`artifact ${index} disposition is invalid`);
    const priority=INTEGER(artifact?.priority,`artifact ${index} priority`);
    const wanted=INTEGER(artifact?.wanted,`artifact ${index} wanted`,1);
    if (wanted < 0) throw new TypeError(`artifact ${index} wanted must be non-negative`);
    return Object.freeze({
      ...artifact, capability,purpose,disposition,priority,wanted,
      ...(artifact?.condition ? {condition:TEXT(artifact.condition,`artifact ${index} condition`)} : {}),
      ...(artifact?.destination ? {destination:TEXT(artifact.destination,`artifact ${index} destination`)} : {}),
    });
  });
  // Downstream readiness, allocation, and fulfillment address an artifact by
  // (MediaNeed.id, purpose), not by (MediaNeed.id, capability, purpose).
  // Require this projection to be injective: otherwise an image and a video
  // with the same purpose can consume each other's reserved demand.
  const purposes=artifacts.map(a=>a.purpose);
  if (new Set(purposes).size!==purposes.length) throw new TypeError("media need has duplicate artifact purpose across capabilities");
  return Object.freeze({
    ...value,id,consumer,objective,openedAt,...(expiresAt?{expiresAt}:{}),
    artifacts:Object.freeze(artifacts)
  });
}

