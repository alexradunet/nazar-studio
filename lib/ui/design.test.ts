// SPDX-License-Identifier: AGPL-3.0-or-later
import { afterEach, expect, test } from "vitest";
import { uiCapabilitySummary } from "./design.ts";
import { setUiQuality } from "./graphics-state.ts";

const originalUiQuality = process.env.NAZAR_UI_QUALITY;

afterEach(() => {
  if (originalUiQuality === undefined) delete process.env.NAZAR_UI_QUALITY;
  else process.env.NAZAR_UI_QUALITY = originalUiQuality;
  setUiQuality(undefined);
});

test("Nazar design primitives report portable ANSI graphics backend", () => {
  delete process.env.NAZAR_UI_QUALITY;
  setUiQuality(undefined);
  expect(uiCapabilitySummary()).toContain("chosen=ansi");
  expect(uiCapabilitySummary()).toContain("quality=medium");
  expect(uiCapabilitySummary()).toContain("renderer=sextant");
});
