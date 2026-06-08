// SPDX-License-Identifier: AGPL-3.0-or-later
import { expect, test } from "vitest";
import { ansiLayer, paintLayer, uiCapabilitySummary } from "./design.ts";

test("Nazar design primitives report portable ANSI graphics backend", () => {
  expect(uiCapabilitySummary()).toContain("chosen=ansi");
  expect(uiCapabilitySummary()).toContain("ansi=yes");
  expect(uiCapabilitySummary()).toContain("renderer=chafa");
});

test("paintLayer uses truecolor ANSI SGR", () => {
  expect(ansiLayer("border", "x")).toContain("\x1b[38;2;");
  expect(paintLayer("border", "x")).toContain("\x1b[38;2;");
});
