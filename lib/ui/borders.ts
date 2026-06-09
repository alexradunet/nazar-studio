// SPDX-License-Identifier: AGPL-3.0-or-later
// Shared terminal border glyphs for Nazar's ANSI panels.
import { visibleWidth } from "./ansi.ts";

export type BorderGlyphs = {
  topLeft: string;
  topRight: string;
  bottomLeft: string;
  bottomRight: string;
  horizontal: string;
  topHorizontal: string;
  bottomHorizontal: string;
  vertical: string;
  leftVertical: string;
  rightVertical: string;
  topJoin: string;
  bottomJoin: string;
  shadow: string;
};

const HEAVY_BORDER: BorderGlyphs = {
  topLeft: "┏",
  topRight: "┓",
  bottomLeft: "┗",
  bottomRight: "┛",
  horizontal: "━",
  topHorizontal: "━",
  bottomHorizontal: "━",
  vertical: "┃",
  leftVertical: "┃",
  rightVertical: "┃",
  topJoin: "┳",
  bottomJoin: "┻",
  shadow: "░",
};

export function borderGlyphs(): BorderGlyphs {
  return HEAVY_BORDER;
}

export function horizontal(width: number, glyphs: BorderGlyphs = borderGlyphs()): string {
  return glyphs.horizontal.repeat(Math.max(0, Math.floor(width)));
}

export function topHorizontal(width: number, glyphs: BorderGlyphs = borderGlyphs()): string {
  return glyphs.topHorizontal.repeat(Math.max(0, Math.floor(width)));
}

export function bottomHorizontal(width: number, glyphs: BorderGlyphs = borderGlyphs()): string {
  return glyphs.bottomHorizontal.repeat(Math.max(0, Math.floor(width)));
}

export function panelTop(leftInnerWidth: number, rightInnerWidth: number): string {
  const g = borderGlyphs();
  return `${g.topLeft}${topHorizontal(leftInnerWidth, g)}${g.topJoin}${topHorizontal(rightInnerWidth, g)}${g.topRight}`;
}

export function panelBottom(leftInnerWidth: number, rightInnerWidth: number): string {
  const g = borderGlyphs();
  return `${g.bottomLeft}${bottomHorizontal(leftInnerWidth, g)}${g.bottomJoin}${bottomHorizontal(rightInnerWidth, g)}${g.bottomRight}`;
}

export function leftPanelTop(innerWidth: number): string {
  const g = borderGlyphs();
  return `${g.topLeft}${topHorizontal(innerWidth, g)}${g.topJoin}`;
}

export function leftPanelBottom(innerWidth: number): string {
  const g = borderGlyphs();
  return `${g.bottomLeft}${bottomHorizontal(innerWidth, g)}${g.bottomJoin}`;
}

export function soloTop(innerWidth: number): string {
  const g = borderGlyphs();
  return `${g.topLeft}${topHorizontal(innerWidth, g)}${g.topRight}`;
}

export function soloBottom(innerWidth: number): string {
  const g = borderGlyphs();
  return `${g.bottomLeft}${bottomHorizontal(innerWidth, g)}${g.bottomRight}`;
}

export function labeledTopRightSegment(
  innerWidth: number,
  label: string,
  paintBorder: (text: string) => string,
): string {
  const g = borderGlyphs();
  const targetWidth = Math.max(1, innerWidth + visibleWidth(g.topRight));
  const prefix = `${g.topHorizontal} `;
  const suffix = " ";
  const fillWidth = targetWidth
    - visibleWidth(prefix)
    - visibleWidth(label)
    - visibleWidth(suffix)
    - visibleWidth(g.topRight);

  if (fillWidth < 0) return paintBorder(`${topHorizontal(innerWidth, g)}${g.topRight}`);
  return `${paintBorder(prefix)}${label}${paintBorder(`${suffix}${topHorizontal(fillWidth, g)}${g.topRight}`)}`;
}

export function labeledSoloTop(
  innerWidth: number,
  label: string,
  paintBorder: (text: string) => string,
): string {
  const g = borderGlyphs();
  const targetWidth = Math.max(2, innerWidth + visibleWidth(g.topLeft) + visibleWidth(g.topRight));
  const prefix = `${g.topLeft}${g.topHorizontal} `;
  const suffix = " ";
  const fillWidth = targetWidth
    - visibleWidth(prefix)
    - visibleWidth(label)
    - visibleWidth(suffix)
    - visibleWidth(g.topRight);

  if (fillWidth < 0) return paintBorder(soloTop(innerWidth));
  return `${paintBorder(prefix)}${label}${paintBorder(`${suffix}${topHorizontal(fillWidth, g)}${g.topRight}`)}`;
}
