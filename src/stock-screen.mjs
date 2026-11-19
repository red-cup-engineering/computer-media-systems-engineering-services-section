import { validateJsonSchema } from "@red-cup-engineering/json-schema-engineering-services-section/validation";
import schema from "../data/schemas/stock-asset-record.schema.json" with { type: "json" };

/**
 * Validate a retained rejection screen, never an eligibility or rights grant.
 * Stock admission still requires the existing independent rights/readiness
 * receiving path. The historical record's schema locator is retained unchanged
 * and resolves to this batch schema, not the separate per-asset record schema.
 */
export function validateStockScreenBatch(batch) {
  const result = validateJsonSchema(batch, schema);
  if (!result.valid) return { kind: "media.stock-screen.validation", ...result };
  const ids = new Set();
  const issues = [];
  for (const [index, asset] of batch.assets.entries()) {
    // JSON Schema's uri format is scheme-neutral. HTTPS additionally needs a
    // parseable nonempty host and a valid port; parsing never fetches the URL.
    for (const field of ["assetUri", "receiverSurface"]) {
      let address;
      try { address = new URL(asset[field]); } catch { /* Refuse invalid HTTPS. */ }
      if (address?.protocol !== "https:" || !address.hostname) issues.push({
        kind: "instance", path: `/assets/${index}/${field}`,
        keyword: "https-address", message: "HTTPS address with a valid host and port required",
      });
    }
    if (ids.has(asset.assetId)) issues.push({
      kind: "instance", path: `/assets/${index}/assetId`,
      keyword: "unique-asset-id", message: "duplicate assetId",
    });
    ids.add(asset.assetId);
  }
  return {
    kind: "media.stock-screen.validation",
    batchId: batch.batchId,
    assets: batch.assets.length,
    valid: issues.length === 0,
    issues,
    admission: "rejected-screen-record-only",
    stockSubmissionAuthorized: false,
  };
}
