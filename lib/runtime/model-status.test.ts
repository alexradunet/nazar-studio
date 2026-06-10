// SPDX-License-Identifier: AGPL-3.0-or-later
import { expect, test } from "bun:test";
import { DEFAULT_SYNTHETIC_MODEL_ID } from "./synthetic-provider.ts";
import { formatBalaurModelCatalog, formatBalaurModelStatus, getBalaurModelCatalog, getBalaurModelStatus } from "./model-status.ts";

test("defaults to Synthetic model status", () => {
  const status = getBalaurModelStatus({});
  expect(status.model.id).toBe(DEFAULT_SYNTHETIC_MODEL_ID);
  expect(status.model.provider).toBe("synthetic");

  const text = formatBalaurModelStatus(status);
  expect(text).toContain("Model · synthetic/syn:large:text");
  expect(text).toContain("Available providers");
  expect(text).toContain("Available pi-ai models");
});

test("formats full pi-ai model catalog summary", () => {
  const catalog = getBalaurModelCatalog(1);
  expect(catalog.totalModels).toBeGreaterThan(10);
  expect(catalog.providers.length).toBeGreaterThan(5);

  const formatted = formatBalaurModelCatalog(catalog);
  expect(formatted).toContain(`Available models from pi-ai: ${catalog.totalModels}`);
  expect(formatted).toContain("- openai (");
});
