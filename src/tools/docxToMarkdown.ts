import path from "path";
import fs from "fs";
import type { ConvertResult, DocxToMarkdownParams } from "../types/convert.js";
import { logger } from "../utils/logger.js";
import { validateInputPath, validateOutputPath, outputExists, getWorkspaceDir } from "../utils/pathGuard.js";
import { resolveOutputPath } from "../utils/outputPath.js";
import { PandocConverter } from "../converters/pandoc.js";
import { MarkItDownConverter } from "../converters/markitdown.js";

/**
 * Tool handler: docx_to_markdown
 * Converts a DOCX file to Markdown using Pandoc or MarkItDown.
 */
export async function docxToMarkdown(params: DocxToMarkdownParams): Promise<ConvertResult> {
  const {
    inputPath,
    outputPath,
    extractImages,
    imageDir,
    engine: preferredEngine,
    markdownFlavor,
    cleanForLLM,
    overwrite,
  } = params;

  const engine = preferredEngine ?? "pandoc";
  const flavor = markdownFlavor ?? "gfm";

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

  const warnings: string[] = [];

  if (extractImages && imageDir) {
    warnings.push("Image extraction is not yet fully implemented. Images may be embedded as base64 in the Markdown.");
  }

  if (engine === "markitdown") {
    const result = await MarkItDownConverter.extractDocx(inputPath, resolvedOutput);
    if (cleanForLLM && result.success && result.details?.stdout) {
      const cleaned = cleanMarkdown(result.details.stdout);
      const ws = getWorkspaceDir();
      fs.writeFileSync(path.resolve(ws, resolvedOutput), cleaned);
      result.details.stdout = cleaned;
    }
    if (result.success) {
      warnings.push("MarkItDown may lose complex table formatting compared to Pandoc.");
    }
    return { ...result, warnings: [...warnings, ...result.warnings] };
  }

  // Pandoc path — resolve output format based on markdownFlavor
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

  if (extractImages && imageDir) {
    const imgDirResolved = path.resolve(getWorkspaceDir(), imageDir);
    extraArgs.push("--extract-media", imgDirResolved);
  }

  const result = await PandocConverter.convert(inputPath, resolvedOutput, "docx", "markdown", extraArgs);

  // Post-process: clean for LLM
  if (cleanForLLM && result.success && result.details?.stdout) {
    const cleaned = cleanMarkdown(result.details.stdout);
    const ws = getWorkspaceDir();
    fs.writeFileSync(path.resolve(ws, resolvedOutput), cleaned);
    result.details.stdout = cleaned;
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
