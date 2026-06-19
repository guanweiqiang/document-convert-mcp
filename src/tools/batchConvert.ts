import path from "path";
import fs from "fs";
import type { BatchConvertParams, ConvertResult } from "../types/convert.js";
import { logger } from "../utils/logger.js";
import { validateInputPath, validateOutputPath, outputExists, getWorkspaceDir } from "../utils/pathGuard.js";
import { PandocConverter } from "../converters/pandoc.js";
import { MarkItDownConverter } from "../converters/markitdown.js";

/**
 * Tool handler: batch_convert
 * Converts all matching files in a directory from one format to another.
 * Individual file failures do NOT abort the entire batch.
 */
export async function batchConvert(params: BatchConvertParams): Promise<{
  success: boolean;
  total: number;
  successCount: number;
  failedCount: number;
  results: ConvertResult[];
}> {
  const { inputDir, outputDir, from, to, recursive, overwrite, cleanForLLM } = params;

  // Validate input directory
  const dirValidation = validateInputPath(inputDir);
  if (!dirValidation.ok) {
    return { success: false, total: 0, successCount: 0, failedCount: 0, results: [] };
  }

  // Validate output directory
  const outValidation = validateOutputPath(outputDir);
  if (!outValidation.ok) {
    return { success: false, total: 0, successCount: 0, failedCount: 0, results: [] };
  }

  const ws = getWorkspaceDir();
  const resolvedInputDir = path.resolve(ws, inputDir);
  const resolvedOutputDir = path.resolve(ws, outputDir);

  // Normalize format names
  const fromExt = normalizeFormat(from);
  const toExt = normalizeFormat(to);

  logger.info(`batch_convert: ${inputDir}/*.${fromExt} -> ${outputDir}/*.${toExt}`);

  // Collect files
  const files = collectFiles(resolvedInputDir, fromExt, recursive ?? false);
  logger.info(`Found ${files.length} files to convert`);

  const results: ConvertResult[] = [];
  let successCount = 0;
  let failedCount = 0;

  for (const filePath of files) {
    const relativePath = path.relative(ws, filePath);
    const fileName = path.basename(filePath, path.extname(filePath));
    const outFileRelative = path.join(path.dirname(relativePath), fileName + "." + toExt);

    // Per-file validation
    const fileValidation = validateInputPath(relativePath);
    if (!fileValidation.ok) {
      results.push({
        success: false,
        input: relativePath,
        output: outFileRelative,
        engine: "pandoc",
        warnings: [],
        error: fileValidation.error,
      });
      failedCount++;
      continue;
    }

    // Skip if output exists and overwrite is false
    const outFullPath = path.resolve(ws, outFileRelative);
    if (!overwrite && fs.existsSync(outFullPath)) {
      results.push({
        success: false,
        input: relativePath,
        output: outFileRelative,
        engine: "pandoc",
        warnings: [],
        error: `Output file already exists: ${outFileRelative}. Set overwrite=true to replace.`,
      });
      failedCount++;
      continue;
    }

    // Ensure output subdirectory exists
    const outDir = path.dirname(outFullPath);
    if (!fs.existsSync(outDir)) {
      fs.mkdirSync(outDir, { recursive: true });
    }

    // Perform conversion
    const result = await convertSingleFile(filePath, outFullPath, fromExt, toExt, cleanForLLM);
    results.push(result);

    if (result.success) {
      successCount++;
    } else {
      failedCount++;
    }
  }

  const success = failedCount === 0;

  return {
    success,
    total: files.length,
    successCount,
    failedCount,
    results,
  };
}

/**
 * Recursively or non-recursively collect files with a given extension.
 */
function collectFiles(dir: string, ext: string, recursive: boolean): string[] {
  const results: string[] = [];

  if (!fs.existsSync(dir)) {
    return results;
  }

  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (recursive && entry.name !== "." && entry.name !== "..") {
        results.push(...collectFiles(path.join(dir, entry.name), ext, true));
      }
    } else if (entry.isFile()) {
      const fileExt = path.extname(entry.name).slice(1).toLowerCase();
      const normalized = fileExt === "markdown" ? "md" : fileExt;
      if (normalized === ext || (ext === "md" && fileExt === "markdown")) {
        results.push(path.join(dir, entry.name));
      }
    }
  }

  return results;
}

/**
 * Convert a single file using the appropriate engine.
 */
async function convertSingleFile(
  filePath: string,
  outputPath: string,
  fromExt: string,
  toExt: string,
  cleanForLLM?: boolean
): Promise<ConvertResult> {
  // Determine engine and formats
  let engine: "pandoc" | "markitdown" = "pandoc";
  let fromFormat = toPandocFormat(fromExt);
  let toFormat = toPandocFormat(toExt);

  // PDF -> Markdown prefers markitdown
  if (fromExt === "pdf" && toExt === "md") {
    const miAvailable = await MarkItDownConverter.isAvailable();
    if (miAvailable) {
      engine = "markitdown";
    }
  }

  if (engine === "markitdown" && toExt === "md") {
    const result = await MarkItDownConverter.convert(filePath, outputPath);
    if (cleanForLLM && result.details?.stdout) {
      const cleaned = cleanMarkdown(result.details.stdout);
      fs.writeFileSync(outputPath, cleaned);
      result.details.stdout = cleaned;
    }
    return result;
  }

  // Pandoc path
  return PandocConverter.convert(filePath, outputPath, fromFormat, toFormat);
}

/** Normalize a format alias to its canonical extension. */
function normalizeFormat(fmt: string): string {
  if (fmt === "markdown") return "md";
  return fmt;
}

/** Map our format name to pandoc format name. */
function toPandocFormat(ext: string): string {
  switch (ext) {
    case "md":
    case "markdown": return "markdown";
    case "pdf": return "pdf";
    case "docx": return "docx";
    case "html": return "html";
    default: return ext;
  }
}

/** Simple Markdown cleanup for LLM consumption. */
function cleanMarkdown(text: string): string {
  return text
    .split("\n")
    .map((line) => line.replace(/[ \t]+$/, ""))
    .join("\n")
    .replace(/\n{4,}/g, "\n\n\n")
    .replace(/^\n+/, "")
    .replace(/\n+$/, "");
}
