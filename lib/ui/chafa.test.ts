// SPDX-License-Identifier: AGPL-3.0-or-later
import { expect, test } from "vitest";
import { visibleWidth } from "./ansi.ts";
import { chafaWasmReady, imageToChafaAnsi, initChafaWasm } from "./chafa.ts";

test("Chafa WASM renders decoded image data synchronously after init", async () => {
  expect(await initChafaWasm()).toBe(true);
  expect(chafaWasmReady()).toBe(true);

  const width = 16;
  const height = 14;
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < data.length; i += 4) {
    const pixel = i / 4;
    data[i] = 255;
    data[i + 1] = pixel % 256;
    data[i + 2] = 64;
    data[i + 3] = 255;
  }

  const ansi = imageToChafaAnsi({ width, height, data }, {
    format: "CHAFA_PIXEL_MODE_SYMBOLS",
    width: 4,
    height: 2,
    fontRatio: 0.5,
    colors: "CHAFA_CANVAS_MODE_TRUECOLOR",
    colorExtractor: "CHAFA_COLOR_EXTRACTOR_AVERAGE",
    colorSpace: "CHAFA_COLOR_SPACE_RGB",
    symbols: "block",
    fill: "none",
    fg: "#ffffff",
    bg: "#000000",
    fgOnly: false,
    dither: "CHAFA_DITHER_MODE_NONE",
    ditherGrainWidth: 4,
    ditherGrainHeight: 4,
    ditherIntensity: 1,
    preprocess: false,
    threshold: 0.5,
    optimize: 5,
    work: 5,
  });

  expect(ansi).toBeDefined();
  const lines = ansi!.trimEnd().split("\n");
  expect(lines).toHaveLength(2);
  expect(lines.map(visibleWidth)).toEqual([4, 4]);
});
