// SPDX-License-Identifier: AGPL-3.0-or-later
import { expect, test } from "vitest";
import { displayImagePath, thumbnailCellSize } from "./avatar.ts";

test("generated images render as terminal thumbnails capped at 256px", () => {
  expect(thumbnailCellSize({ width: 512, height: 512 }, 8, 16)).toEqual({ columns: 32, rows: 16 });
  expect(thumbnailCellSize({ width: 512, height: 256 }, 8, 16)).toEqual({ columns: 32, rows: 8 });
  expect(thumbnailCellSize({ width: 128, height: 128 }, 8, 16)).toEqual({ columns: 16, rows: 8 });
});

test("generated image thumbnail sizing falls back to a 256px box", () => {
  expect(thumbnailCellSize(undefined, 8, 16)).toEqual({ columns: 32, rows: 16 });
  expect(thumbnailCellSize({ width: 512, height: 512 }, 0, 0)).toEqual({ columns: 32, rows: 16 });
});

test("generated image display prefers the 128px preview over large source files", () => {
  expect(displayImagePath({ raw: "raw-512.png", alpha: "transparent-512.png", pixel: "pixel-128.png" })).toBe("pixel-128.png");
  expect(displayImagePath({ raw: "raw-128.png" })).toBe("raw-128.png");
});
