import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { validateStockScreenBatch } from "../src/stock-screen.mjs";
import { validateJsonSchema } from "@red-cup-engineering/json-schema-engineering-services-section/validation";
import schema from "../data/schemas/stock-asset-record.schema.json" with { type: "json" };
const fixtureUrl = new URL("./fixtures/data/stock-assets/koios-live-article-art-screen-20261006.json", import.meta.url);
const original = JSON.parse(await readFile(fixtureUrl, "utf8"));
const copy = () => structuredClone(original);

test("the unchanged historical rejection screen validates without stock authority", () => {
  const before = JSON.stringify(original);
  const result = validateStockScreenBatch(original);
  assert.equal(result.valid, true);
  assert.equal(result.assets, 10);
  assert.equal(result.stockSubmissionAuthorized, false);
  assert.equal(result.admission, "rejected-screen-record-only");
  assert.equal(JSON.stringify(original), before);
  assert.ok(original.assets.every(asset => asset.rightsStatus === "unknown" && asset.stockStatus === "not-submitted"));
});
test("the retained schema locator resolves to the actual batch schema", async () => {
  const schema = JSON.parse(await readFile(new URL(original.$schema, fixtureUrl), "utf8"));
  assert.equal(schema.$id, "https://561.group/schemas/media/rejected-stock-screen-batch.schema.json");
  assert.ok(schema.required.includes("assets"));
});
test("eligibility and submission claims are refused even when a caller asserts cleared rights", () => {
  for (const rightsStatus of ["unknown", "cleared"]) {
    for (const screeningState of ["eligible", "review"]) {
      const value = copy(); value.assets[0].rightsStatus = rightsStatus;
      value.assets[0].screeningState = screeningState;
      assert.equal(validateStockScreenBatch(value).valid, false);
    }
    for (const stockStatus of ["submitted", "accepted"]) {
      const value = copy(); value.assets[0].rightsStatus = rightsStatus;
      value.assets[0].stockStatus = stockStatus;
      assert.equal(validateStockScreenBatch(value).valid, false);
    }
  }
});
test("missing metadata and invented provider-authority fields fail the actual schema", () => {
  for (const field of ["batchId", "workRef", "screenedAt", "decision", "sharedReasons"]) {
    const value = copy(); delete value[field];
    assert.equal(validateStockScreenBatch(value).valid, false, field);
  }
  const value = copy(); value.assets[0].publicationAuthorized = true;
  assert.equal(validateStockScreenBatch(value).valid, false);
});
test("malformed asset rows, duplicate identities, dates and URLs are refused", () => {
  for (const value of [null, {}, { ...copy(), assets: [null] }, { ...copy(), assets: [] }]) {
    assert.equal(validateStockScreenBatch(value).valid, false);
  }
  const duplicate = copy(); duplicate.assets.push(structuredClone(duplicate.assets[0]));
  assert.equal(validateStockScreenBatch(duplicate).valid, false);
  for (const change of [
    value => { value.screenedAt = "yesterday"; },
    value => { value.assets[0].assetId = ""; },
    value => { value.assets[0].assetUri = "http://example.test/asset.svg"; },
    value => { value.assets[0].receiverSurface = "https://"; },
    value => { value.decision = "eligible"; },
  ]) {
    const value = copy(); change(value);
    assert.equal(validateStockScreenBatch(value).valid, false);
  }
});
test("the CLI receives the same canonical validation without a network request", () => {
  const result = spawnSync(process.execPath, [new URL("../scripts/validate-stock-screen.mjs", import.meta.url).pathname, new URL("./fixtures/data/stock-assets/koios-live-article-art-screen-20261006.json", import.meta.url).pathname], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(result.stdout);
  assert.equal(output.valid, true);
  assert.equal(output.stockSubmissionAuthorized, false);
});

test("both screen address fields reject hostless and malformed HTTPS authorities", () => {
  for (const field of ["assetUri", "receiverSurface"]) {
    for (const address of [
      "https://:", "https://:443/path", "https://user@/path",
      "https:///example.test/path", "https://example.test:65536/path",
      "https://example.test:abc/path", "https://[not-an-ip]/path",
      "https://%zz/path",
    ]) {
      const value = copy(); value.assets[0][field] = address;
      const result = validateStockScreenBatch(value);
      assert.equal(result.valid, false, `${field}: ${address}`);
      assert.ok(result.issues.some(issue => issue.path === `/assets/0/${field}`), `${field}: ${address}`);
    }
  }
});
test("valid HTTPS host forms remain usable as retained evidence addresses", () => {
  for (const field of ["assetUri", "receiverSurface"]) {
    for (const address of [
      "https://example.test", "https://example.test:8443/path?view=1#asset",
      "https://[2001:db8::1]/path", "https://reader@example.test/path",
    ]) {
      const value = copy(); value.assets[0][field] = address;
      const result = validateStockScreenBatch(value);
      assert.equal(result.valid, true, `${field}: ${address}`);
      assert.equal(result.stockSubmissionAuthorized, false);
    }
  }
});

test("the batch schema itself refuses a missing HTTPS hostname", () => {
  for (const field of ["assetUri", "receiverSurface"]) {
    for (const address of ["https://:", "https://:443/path", "https://user@/path"]) {
      const value = copy(); value.assets[0][field] = address;
      assert.equal(validateJsonSchema(value, schema).valid, false, `${field}: ${address}`);
    }
  }
});
