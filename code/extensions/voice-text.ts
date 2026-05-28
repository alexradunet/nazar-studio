export type TtsTextOptions = {
  maxChunkChars?: number;
  minChars?: number;
  simplifyPaths?: boolean;
  pathTailSegments?: number;
  maxPathLength?: number;
};

const DEFAULT_TEXT_OPTIONS: Required<TtsTextOptions> = {
  maxChunkChars: 450,
  minChars: 90,
  simplifyPaths: true,
  pathTailSegments: 2,
  maxPathLength: 42,
};

function textOptions(options: TtsTextOptions = {}): Required<TtsTextOptions> {
  return { ...DEFAULT_TEXT_OPTIONS, ...options };
}

export function stripEmojis(text: string): string {
  return text.replace(/\p{Extended_Pictographic}/gu, "").replace(/[\uFE0E\uFE0F\u200D]/g, "");
}

export function normalizeMarkdownForTts(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    .replace(/^\s*>\s?/gm, "")
    .replace(/^\s*[-*+]\s+/gm, "")
    .replace(/^\s*\d+\.\s+/gm, "")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/_([^_]+)_/g, "$1")
    .replace(/(^|\s)#(?=[A-Za-z][\w-]*\b)/g, "$1");
}

export function addPausePunctuation(text: string): string {
  return text.replace(/\n\s*\n+/g, ". ").replace(/\n/g, ", ");
}

export function simplifyPathsForTts(text: string, options: TtsTextOptions = {}): string {
  const config = textOptions(options);
  if (!config.simplifyPaths) return text;
  return text.replace(/(?:~|\/[\w.-]+(?:\/[\w.-]+)+)/g, (fullPath) => {
    const normalized = fullPath.replace(/^~\//, "home/");
    if (normalized.length <= config.maxPathLength) return fullPath;
    const segments = normalized.split("/").filter(Boolean);
    const tail = segments.slice(-Math.max(1, config.pathTailSegments)).join("/");
    return `…/${tail}`;
  });
}

export function cleanForTts(text: string, options: TtsTextOptions = {}): string {
  return addPausePunctuation(simplifyPathsForTts(normalizeMarkdownForTts(stripEmojis(text)), options))
    .replace(/\s+/g, " ")
    .replace(/\s+([,.;!?])/g, "$1")
    .replace(/([.!?])\1+/g, "$1")
    .trim();
}

export function splitLongText(text: string, options: TtsTextOptions = {}): string[] {
  const config = textOptions(options);
  const chunks: string[] = [];
  let remaining = text.trim();

  while (remaining.length > config.maxChunkChars) {
    const candidate = remaining.slice(0, config.maxChunkChars);
    const breakAt = Math.max(candidate.lastIndexOf(". "), candidate.lastIndexOf("! "), candidate.lastIndexOf("? "), candidate.lastIndexOf(", "));
    const cut = breakAt > 80 ? breakAt + 1 : config.maxChunkChars;
    chunks.push(remaining.slice(0, cut).trim());
    remaining = remaining.slice(cut).trim();
  }

  if (remaining) chunks.push(remaining);
  return chunks;
}

export function splitSpeakableChunks(buffer: string, options: TtsTextOptions = {}): { chunks: string[]; rest: string } {
  const config = textOptions(options);
  const chunks: string[] = [];
  let remaining = buffer;

  while (remaining.length >= config.minChars) {
    const match = remaining.match(/^([\s\S]*?[.!?\n])\s+/);
    if (!match) break;
    const chunk = match[1].trim();
    if (chunk) chunks.push(chunk);
    remaining = remaining.slice(match[0].length);
  }

  return { chunks, rest: remaining };
}
