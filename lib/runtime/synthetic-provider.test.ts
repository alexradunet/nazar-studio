// SPDX-License-Identifier: AGPL-3.0-or-later
import { expect, test } from "bun:test";
import { createSyntheticModel, DEFAULT_SYNTHETIC_MODEL_ID, DEFAULT_SYNTHETIC_MODEL_REF, SYNTHETIC_BASE_URL, SYNTHETIC_PROVIDER } from "./synthetic-provider.ts";
import { getBalaurApiKey } from "./auth.ts";

test("creates the default Synthetic model", () => {
  const model = createSyntheticModel();
  expect(model.provider).toBe(SYNTHETIC_PROVIDER);
  expect(model.api).toBe("openai-completions");
  expect(model.id).toBe(DEFAULT_SYNTHETIC_MODEL_ID);
  expect(model.baseUrl).toBe(SYNTHETIC_BASE_URL);
  expect(model.name).toBe("Synthetic Large Text");
  expect(DEFAULT_SYNTHETIC_MODEL_REF).toBe("synthetic/syn:large:text");
});

test("creates custom Synthetic aliases without name rewriting", () => {
  const model = createSyntheticModel("syn:small:text");
  expect(model.name).toBe("syn:small:text");
});

test("reads Synthetic keys from Balaur override first", () => {
  const previousSynthetic = Bun.env.SYNTHETIC_API_KEY;
  const previousBalaur = Bun.env.BALAUR_SYNTHETIC_API_KEY;

  try {
    delete Bun.env.BALAUR_SYNTHETIC_API_KEY;
    Bun.env.SYNTHETIC_API_KEY = "syn-key";
    expect(getBalaurApiKey("synthetic")).toBe("syn-key");

    Bun.env.BALAUR_SYNTHETIC_API_KEY = "balaur-key";
    expect(getBalaurApiKey("synthetic")).toBe("balaur-key");
  } finally {
    if (previousSynthetic === undefined) delete Bun.env.SYNTHETIC_API_KEY;
    else Bun.env.SYNTHETIC_API_KEY = previousSynthetic;
    if (previousBalaur === undefined) delete Bun.env.BALAUR_SYNTHETIC_API_KEY;
    else Bun.env.BALAUR_SYNTHETIC_API_KEY = previousBalaur;
  }
});

test("supports setting a non-default provider/model path", () => {
  const model = createSyntheticModel("syn:large:vision");
  expect(model.input.includes("image")).toBe(false);
  expect(model.id).toBe("syn:large:vision");
});
