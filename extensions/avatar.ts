// SPDX-License-Identifier: AGPL-3.0-or-later
// Local image generation for Nazar: small SD.cpp pictures rendered inline when Kitty is available.
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { execFile } from "node:child_process";
import { join } from "node:path";
import { promisify } from "node:util";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { Component } from "@earendil-works/pi-tui";
import { Text } from "@earendil-works/pi-tui";
import { Type } from "typebox";
import { kittyImage, kittyPlaceholderGrid, terminalSupportsKitty } from "../lib/ui/graphics-protocol.ts";

const execFileAsync = promisify(execFile);
const DEFAULT_PROMPT = "8-bit pixel art avatar, front-facing portrait, simple silhouette, limited color palette, clean outline, game sprite, centered, plain dark background";
const SCRIPT = join(process.env.HOME ?? "", ".local", "share", "nazar", "bin", "nazar-image");

type GenerateMode = "fast-128" | "clean-128";
type ImageDetails = {
  prompt?: string;
  mode?: GenerateMode;
  raw?: string;
  pixel?: string;
  error?: string;
};

function parseOutput(stdout: string): Pick<ImageDetails, "raw" | "pixel"> {
  const raw = stdout.match(/^raw:\s*(.+)$/m)?.[1]?.trim();
  const pixel = stdout.match(/^pixel:\s*(.+)$/m)?.[1]?.trim();
  return { raw, pixel };
}

function imageId(path: string): number {
  const hash = createHash("sha1").update(path).digest();
  return (hash.readUInt32BE(0) & 0xffffff) || 1;
}

class KittyPngComponent implements Component {
  constructor(private path: string, private columns = 24, private rows = 12) {}
  invalidate(): void {}
  render(_width: number): string[] {
    const data = readFileSync(this.path);
    const id = imageId(this.path);
    const image = kittyImage({ data, format: "png", columns: this.columns, rows: this.rows, id, virtualPlacement: true });
    const placeholders = kittyPlaceholderGrid(id, this.columns, this.rows);
    return placeholders.map((line, index) => index === 0 ? `${image}${line}` : line);
  }
}

function resultComponent(result: any, theme: any): Component {
  const details = (result?.details ?? {}) as ImageDetails;
  if (details.error) return new Text(theme.fg?.("error", `Image generation failed: ${details.error}`) ?? `Image generation failed: ${details.error}`, 0, 0);
  const path = details.pixel ?? details.raw;
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
      ], { description: "fast-128 generates native 128px quickly; clean-128 generates 384px then pixel-downscales to 128px." })),
    }),
    renderShell: "self",
    async execute(_toolCallId, params): Promise<any> {
      const prompt = (params.prompt?.trim() || DEFAULT_PROMPT);
      const mode = (params.mode ?? "fast-128") as GenerateMode;
      if (!existsSync(SCRIPT)) {
        return {
          content: [{ type: "text", text: "Image generator is not installed at ~/.local/share/nazar/bin/nazar-image." }],
          details: { prompt, mode, error: "generator script missing" } satisfies ImageDetails,
        };
      }

      const args = mode === "fast-128" ? ["--native-128", "--no-preview", prompt] : ["--no-preview", prompt];
      try {
        const { stdout } = await execFileAsync(SCRIPT, args, { timeout: 120_000, maxBuffer: 1024 * 1024 });
        const paths = parseOutput(stdout);
        const text = paths.pixel ? `Generated image: ${paths.pixel}` : "Generated image.";
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
