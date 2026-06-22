import path from "path";
import fs from "fs";
import type { ConvertResult, DocxToMarkdownParams } from "../types/convert.js";
import { logger } from "../utils/logger.js";
import { validateInputPath, validateOutputPath, outputExists, getWorkspaceDir } from "../utils/pathGuard.js";
import { resolveOutputPath } from "../utils/outputPath.js";
import { PandocConverter } from "../converters/pandoc.js";
import { MarkItDownConverter } from "../converters/markitdown.js";

/** Supported image file extensions for extraction scanning. */
const IMAGE_EXTS = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".bmp", ".tif", ".tiff"]);

/**
 * Validate imageDir path: must be within workspace.
 */
function validateImageDir(imageDir: string): { ok: true } | { ok: false; error: string } {
  const ws = getWorkspaceDir();
  const resolved = path.resolve(ws, imageDir);
  const rel = path.relative(ws, resolved);

  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    return { ok: false, error: `Access denied: imageDir path escapes workspace directory (${imageDir})` };
  }

  return { ok: true };
}

/**
 * Generate default image directory name from output markdown path.
 * e.g. "out/docx-extract-images.md" -> "out/docx-extract-images_media"
 */
function generateDefaultImageDir(outputMdPath: string): string {
  const dir = path.dirname(outputMdPath);
  const base = path.basename(outputMdPath, ".md");
  return path.join(dir, `${base}_media`);
}

/**
 * Scan image directory and return image file metadata.
 */
function scanImages(absoluteImageDir: string): { imageCount: number; images: Array<{ filename: string; sizeBytes: number }> } {
  if (!fs.existsSync(absoluteImageDir)) {
    return { imageCount: 0, images: [] };
  }

  const images: Array<{ filename: string; sizeBytes: number }> = [];

  function walk(dir: string) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (IMAGE_EXTS.has(ext)) {
          try {
            const stat = fs.statSync(fullPath);
            images.push({
              filename: path.relative(absoluteImageDir, fullPath),
              sizeBytes: stat.size,
            });
          } catch {
            // Ignore files we can't stat
          }
        }
      }
    }
  }

  walk(absoluteImageDir);
  return { imageCount: images.length, images };
}

/**
 * Tool handler: docx_to_markdown
 * Converts a DOCX file to Markdown using Pandoc or MarkItDown.
 *
 * v0.2.0: resolved input path is now passed to converters (absolute path).
 * v0.2.0: extractImages/imageDir support with pathGuard, default imageDir, image scanning.
 */
export async function docxToMarkdown(params: DocxToMarkdownParams): Promise<ConvertResult> {
  const {
    inputPath,
    outputPath,
    extractImages,
    imageDir: paramImageDir,
    engine: preferredEngine,
    markdownFlavor,
    cleanForLLM,
    overwrite,
  } = params;

  const engine = preferredEngine ?? "pandoc";
  const flavor = markdownFlavor ?? "gfm";
  const ws = getWorkspaceDir();

  // Validate input
  const inputValidation = validateInputPath(inputPath);
  if (!inputValidation.ok) {
    return {
      success: false,
      input: inputPath,
      output: outputPath,
      engine,
      warnings: [],
      error: inputValidation.error,
    };
  }

  // Resolve input to absolute workspace path
  const resolvedInput = path.resolve(ws, inputPath);

  // Resolve output path
  const resolvedOutput = resolveOutputPath(inputPath, outputPath, "md");

  // Validate output
  const outputValidation = validateOutputPath(resolvedOutput);
  if (!outputValidation.ok) {
    return {
      success: false,
      input: inputPath,
      output: resolvedOutput,
      engine,
      warnings: [],
      error: outputValidation.error,
    };
  }

  // Overwrite protection
  if (!overwrite && outputExists(resolvedOutput)) {
    return {
      success: false,
      input: inputPath,
      output: resolvedOutput,
      engine,
      warnings: [],
      error: `Output file already exists: ${resolvedOutput}. Set overwrite=true to replace it.`,
    };
  }

  logger.info(`docx_to_markdown: ${inputPath} -> ${resolvedOutput} (engine=${engine}, flavor=${flavor})`);

  // ── Image extraction setup ──────────────────────────────────────────
  let imageDirResolved: string | undefined;
  let imageDirRelative: string | undefined;
  let imageScanResult: { imageCount: number; images: Array<{ filename: string; sizeBytes: number }> } | undefined;

  if (extractImages) {
    if (paramImageDir) {
      // Validate user-provided imageDir
      const imageDirValidation = validateImageDir(paramImageDir);
      if (!imageDirValidation.ok) {
        return {
          success: false,
          input: inputPath,
          output: resolvedOutput,
          engine,
          warnings: [],
          error: imageDirValidation.error,
        };
      }
      imageDirResolved = path.resolve(ws, paramImageDir);
      imageDirRelative = paramImageDir;
    } else {
      // Generate default imageDir from output basename
      imageDirRelative = generateDefaultImageDir(resolvedOutput);
      imageDirResolved = path.resolve(ws, imageDirRelative);
    }

    // Ensure image directory exists
    if (!fs.existsSync(imageDirResolved)) {
      fs.mkdirSync(imageDirResolved, { recursive: true });
    }
  }

  const warnings: string[] = [];

  if (engine === "markitdown") {
    // Use RESOLVED absolute paths
    const result = await MarkItDownConverter.extractDocx(resolvedInput, resolvedOutput);
    if (cleanForLLM && result.success && result.details?.stdout) {
      const cleaned = cleanMarkdown(result.details.stdout);
      fs.writeFileSync(path.resolve(ws, resolvedOutput), cleaned);
      result.details.stdout = cleaned;
    }
    if (result.success) {
      warnings.push("MarkItDown may lose complex table formatting compared to Pandoc.");
    }

    // Attach image metadata even for markitdown (may be empty if not extracted)
    if (extractImages && imageDirResolved) {
      imageScanResult = scanImages(imageDirResolved);
      (result as ConvertResult & { imageCount?: number; imageDir?: string; images?: unknown[] }).imageCount = imageScanResult.imageCount;
      (result as ConvertResult & { imageCount?: number; imageDir?: string; images?: unknown[] }).imageDir = imageDirRelative ?? imageDirResolved;
      (result as ConvertResult & { imageCount?: number; imageDir?: string; images?: unknown[] }).images = imageScanResult.images;
    }

    return { ...result, warnings: [...warnings, ...result.warnings] };
  }

  // ── Pandoc path ─────────────────────────────────────────────────────
  const formatMap: Record<string, string> = {
    gfm: "gfm",
    commonmark: "commonmark",
    pandoc: "markdown",
  };
  const outputFormat = formatMap[flavor] ?? "gfm";

  const extraArgs: string[] = [
    `-t`, outputFormat,
    `--wrap=none`,
    `--markdown-headings=atx`,
  ];

  // Pass --extract-media to Pandoc when image extraction is enabled
  if (extractImages && imageDirResolved) {
    extraArgs.push(`--extract-media=${imageDirResolved}`);
  }

  // Use RESOLVED absolute input path
  const result = await PandocConverter.convert(resolvedInput, resolvedOutput, "docx", "markdown", extraArgs);

  // Post-process: clean for LLM
  if (cleanForLLM && result.success && result.details?.stdout) {
    const cleaned = cleanMarkdown(result.details.stdout);
    fs.writeFileSync(path.resolve(ws, resolvedOutput), cleaned);
    result.details.stdout = cleaned;
  }

  // Scan image directory after conversion
  if (extractImages && imageDirResolved) {
    imageScanResult = scanImages(imageDirResolved);
    (result as ConvertResult & { imageCount?: number; imageDir?: string; images?: unknown[] }).imageCount = imageScanResult.imageCount;
    (result as ConvertResult & { imageCount?: number; imageDir?: string; images?: unknown[] }).imageDir = imageDirRelative ?? imageDirResolved;
    (result as ConvertResult & { imageCount?: number; imageDir?: string; images?: unknown[] }).images = imageScanResult.images;
  }

  if (!result.success) {
    warnings.push("Pandoc conversion returned non-zero exit code. Check stderr for details.");
  }

  return { ...result, warnings: [...warnings, ...result.warnings] };
}

/**
 * Enhanced Markdown cleanup for LLM consumption:
 * - Preserve fenced code blocks intact
 * - Remove Pandoc attributes like {#xxx .class}
 * - Collapse multiple blank lines to at most 2
 * - Remove leading "Table of Contents" heading when present
 */
function cleanMarkdown(text: string): string {
  const lines = text.split("\n");
  const result: string[] = [];
  let inFencedBlock = false;
  let fenceChar = "";
  let fenceLen = 0;
  let consecutiveBlanks = 0;
  let tocRemoved = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Track fenced code blocks
    const fenceMatch = trimmed.match(/^(`{3,}|~{3,})(.*)?$/);
    if (fenceMatch && !inFencedBlock) {
      inFencedBlock = true;
      fenceChar = fenceMatch[1][0];
      fenceLen = fenceMatch[1].length;
      result.push(line);
      continue;
    }
    if (fenceMatch && inFencedBlock) {
      const curFence = fenceMatch[1];
      if (curFence[0] === fenceChar && curFence.length >= fenceLen && !(fenceMatch[2] ?? "").replace(/ /g, "")) {
        inFencedBlock = false;
      }
      result.push(line);
      continue;
    }

    // Inside fenced block — preserve as-is
    if (inFencedBlock) {
      result.push(line);
      continue;
    }

    // Remove Pandoc attributes: {#xxx}, {.class}, etc.
    const cleaned = trimmed.replace(/\{#[\w-]+\}/g, "").replace(/\{\.[\w-]+\}/g, "");

    // Remove leading "Table of Contents" heading
    if (!tocRemoved && cleaned === "Table of Contents" && i === 0) {
      // Skip this line and any immediately following blank lines
      tocRemoved = true;
      continue;
    }
    // Also check for "# Table of Contents"
    if (!tocRemoved && cleaned === "# table of contents" && i === 0) {
      tocRemoved = true;
      continue;
    }

    // Collapse blank lines: keep at most 2 consecutive
    if (cleaned === "") {
      consecutiveBlanks++;
      if (consecutiveBlanks <= 2) {
        result.push("");
      }
      continue;
    }
    consecutiveBlanks = 0;

    // Trim trailing whitespace from line
    result.push(line.replace(/[ \t]+$/, ""));
  }

  let output = result.join("\n");

  // Final cleanup: trim leading/trailing whitespace
  output = output.replace(/^\n+/, "").replace(/\n+$/, "");

  return output;
}
