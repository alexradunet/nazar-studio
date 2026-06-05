// SPDX-License-Identifier: AGPL-3.0-or-later
// Local image generation for Nazar: small SD.cpp pictures rendered inline when Kitty is available.
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { execFile } from "node:child_process";
import { join } from "node:path";
import { promisify } from "node:util";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { Component } from "@earendil-works/pi-tui";
import { getCellDimensions, Text } from "@earendil-works/pi-tui";
import { Type } from "typebox";
import { kittyImage, kittyPlaceholderGrid, terminalSupportsKitty } from "../lib/ui/graphics-protocol.ts";

const execFileAsync = promisify(execFile);
const DEFAULT_PROMPT = "8-bit pixel art avatar, front-facing portrait, simple silhouette, limited color palette, clean outline, game sprite, centered, plain dark background";
const SCRIPT = join(process.env.HOME ?? "", ".local", "share", "nazar", "bin", "nazar-image");

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

class KittyPngComponent implements Component {
  constructor(private path: string) {}
  invalidate(): void {}
  render(_width: number): string[] {
    const data = readFileSync(this.path);
    const dimensions = imageDimensions(this.path);
    const { widthPx, heightPx } = getCellDimensions();
    const cellW = Number.isFinite(widthPx) && widthPx > 0 ? Math.max(1, widthPx) : 8;
    const cellH = Number.isFinite(heightPx) && heightPx > 0 ? Math.max(1, heightPx) : 16;
    let columns = 24;
    let rows = 12;

    if (dimensions) {
      columns = Math.max(1, Math.round(dimensions.width / cellW));
      rows = Math.max(1, Math.round(dimensions.height / cellH));
      const widthScale = 64 / columns;
      const heightScale = 36 / rows;
      const scale = Math.min(1, widthScale, heightScale);
      if (scale < 1) {
        columns = Math.max(1, Math.round(columns * scale));
        rows = Math.max(1, Math.round(rows * scale));
      }
    }

    const id = imageId(this.path);
    const image = kittyImage({ data, format: "png", columns, rows, id, virtualPlacement: true });
    const placeholders = kittyPlaceholderGrid(id, columns, rows);
    return placeholders.map((line, index) => index === 0 ? `${image}${line}` : line);
  }
}

function resultComponent(result: any, theme: any): Component {
  const details = (result?.details ?? {}) as ImageDetails;
  if (details.error) return new Text(theme.fg?.("error", `Image generation failed: ${details.error}`) ?? `Image generation failed: ${details.error}`, 0, 0);
  const path = details.alpha ?? details.raw ?? details.pixel;
  if (!path || !existsSync(path)) return new Text("No generated image found.", 0, 0);
  if (terminalSupportsKitty()) return new KittyPngComponent(path);
  return new Text(`Generated image: ${path}`, 0, 0);
}

export default function (pi: ExtensionAPI) {
  pi.registerTool({
    name: "nazar_image_generate",
    label: "Generate Image",
    description: "Generate a small local image/avatar with stable-diffusion.cpp and render it inline in the conversation when Kitty images are available.",
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
