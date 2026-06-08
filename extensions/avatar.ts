// SPDX-License-Identifier: AGPL-3.0-or-later
// Local image generation for Nazar: small SD.cpp pictures rendered inline when terminal images are available.
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { execFile } from "node:child_process";
import { join } from "node:path";
import { promisify } from "node:util";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { Component } from "@earendil-works/pi-tui";
import { getCellDimensions, Image, Text } from "@earendil-works/pi-tui";
import { Type } from "typebox";

const execFileAsync = promisify(execFile);
const DEFAULT_PROMPT = "8-bit pixel art avatar, front-facing portrait, simple silhouette, limited color palette, clean outline, game sprite, centered, plain dark background";
const SCRIPT = join(process.env.HOME ?? "", ".local", "share", "nazar", "bin", "nazar-image");
const MAX_THUMBNAIL_PX = 256;

type GenerateMode = "fast-128" | "clean-128" | "clean-256" | "clean-384" | "clean-512";
type ImageDetails = {
  prompt?: string;
  mode?: GenerateMode;
  raw?: string;
  alpha?: string;
  pixel?: string;
  error?: string;
};

function parseOutput(stdout: string): Pick<ImageDetails, "raw" | "alpha" | "pixel"> {
  const raw = stdout.match(/^raw:\s*(.+)$/m)?.[1]?.trim();
  const alpha = stdout.match(/^alpha:\s*(.+)$/m)?.[1]?.trim();
  const pixel = stdout.match(/^pixel:\s*(.+)$/m)?.[1]?.trim();
  return { raw, alpha, pixel };
}

function imageDimensions(path: string): { width: number; height: number } | undefined {
  const data = readFileSync(path);
  if (!data.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return undefined;

  const signature = data.subarray(8, 24);
  const width = signature.readUInt32BE(8);
  const height = signature.readUInt32BE(12);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return undefined;
  return { width, height };
}

function imageId(path: string): number {
  const hash = createHash("sha1").update(path).digest();
  return (hash.readUInt32BE(0) & 0xffffff) || 1;
}

export function thumbnailCellSize(
  dimensions: { width: number; height: number } | undefined,
  cellW: number,
  cellH: number,
): { columns: number; rows: number } {
  const safeCellW = Number.isFinite(cellW) && cellW > 0 ? Math.max(1, cellW) : 8;
  const safeCellH = Number.isFinite(cellH) && cellH > 0 ? Math.max(1, cellH) : 16;
  let widthPx = MAX_THUMBNAIL_PX;
  let heightPx = MAX_THUMBNAIL_PX;

  if (dimensions) {
    const scale = Math.min(1, MAX_THUMBNAIL_PX / dimensions.width, MAX_THUMBNAIL_PX / dimensions.height);
    widthPx = Math.max(1, Math.floor(dimensions.width * scale));
    heightPx = Math.max(1, Math.floor(dimensions.height * scale));
  }

  return {
    columns: Math.max(1, Math.floor(widthPx / safeCellW)),
    rows: Math.max(1, Math.floor(heightPx / safeCellH)),
  };
}

function imageComponent(path: string, theme: any): Component {
  const data = readFileSync(path);
  const dimensions = imageDimensions(path);
  const { widthPx, heightPx } = getCellDimensions();
  const { columns, rows } = thumbnailCellSize(dimensions, widthPx, heightPx);
  return new Image(
    data.toString("base64"),
    "image/png",
    { fallbackColor: (text: string) => theme.fg?.("toolOutput", text) ?? text },
    { maxWidthCells: columns, maxHeightCells: rows, filename: path, imageId: imageId(path) },
    dimensions ? { widthPx: dimensions.width, heightPx: dimensions.height } : undefined,
  );
}

export function displayImagePath(details: Pick<ImageDetails, "raw" | "alpha" | "pixel">): string | undefined {
  return details.pixel ?? details.alpha ?? details.raw;
}

function resultComponent(result: any, theme: any): Component {
  const details = (result?.details ?? {}) as ImageDetails;
  if (details.error) return new Text(theme.fg?.("error", `Image generation failed: ${details.error}`) ?? `Image generation failed: ${details.error}`, 0, 0);
  const path = displayImagePath(details);
  if (!path || !existsSync(path)) return new Text("No generated image found.", 0, 0);
  return imageComponent(path, theme);
}

export default function (pi: ExtensionAPI) {
  pi.registerTool({
    name: "nazar_image_generate",
    label: "Generate Image",
    description: "Generate a small local image/avatar with stable-diffusion.cpp and render it inline in the conversation when terminal images are available.",
    parameters: Type.Object({
      prompt: Type.Optional(Type.String({ description: "Visual prompt. Prefer concise 8-bit/pixel-art avatar prompts." })),
      mode: Type.Optional(Type.Union([
        Type.Literal("fast-128"),
        Type.Literal("clean-128"),
        Type.Literal("clean-256"),
        Type.Literal("clean-384"),
        Type.Literal("clean-512"),
      ], { description: "fast-128 generates native 128px quickly; clean-* generates transparent PNG output and also saves a 128px variant." })),
    }),
    renderShell: "self",
    async execute(_toolCallId, params): Promise<any> {
      const prompt = (params.prompt?.trim() || DEFAULT_PROMPT);
      const mode = (params.mode ?? "clean-256") as GenerateMode;
      if (!existsSync(SCRIPT)) {
        return {
          content: [{ type: "text", text: "Image generator is not installed at ~/.local/share/nazar/bin/nazar-image." }],
          details: { prompt, mode, error: "generator script missing" } satisfies ImageDetails,
        };
      }

      const size = mode === "fast-128" || mode === "clean-128" ? 128 : mode === "clean-256" ? 256 : mode === "clean-384" ? 384 : 512;
      const args = mode === "fast-128"
        ? ["--native-128", "--no-preview", prompt]
        : ["--size", String(size), "--no-preview", prompt];
      try {
        const { stdout } = await execFileAsync(SCRIPT, args, { timeout: 120_000, maxBuffer: 1024 * 1024 });
        const paths = parseOutput(stdout);
        const text = paths.alpha ? `Generated transparent image: ${paths.alpha}` : paths.pixel ? `Generated image: ${paths.pixel}` : "Generated image.";
        return {
          content: [{ type: "text", text }],
          details: { prompt, mode, ...paths } satisfies ImageDetails,
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          content: [{ type: "text", text: `Image generation failed: ${message}` }],
          details: { prompt, mode, error: message } satisfies ImageDetails,
        };
      }
    },
    renderCall(args, theme) {
      const prompt = typeof args.prompt === "string" && args.prompt.trim() ? args.prompt.trim() : DEFAULT_PROMPT;
      return new Text(`${theme.fg?.("toolTitle", "Generating image") ?? "Generating image"}\n${theme.fg?.("dim", prompt) ?? prompt}`, 0, 0);
    },
    renderResult(result, _options, theme) {
      return resultComponent(result, theme);
    },
  });
}
