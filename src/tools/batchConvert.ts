import path from "path";
import fs from "fs";
import type { BatchConvertParams, ConvertResult } from "../types/convert.js";
import { logger } from "../utils/logger.js";
import { getWorkspaceDir } from "../utils/pathGuard.js";
import { PandocConverter } from "../converters/pandoc.js";
import { MarkItDownConverter } from "../converters/markitdown.js";

// ---------------------------------------------------------------------------
// Validated batch result shape (v0.2.0)
// ---------------------------------------------------------------------------

interface BatchResult {
  success: boolean;
  summary: string;
  total: number;
  plannedCount: number;
  skippedCount: number;
  successCount: number;
  failedCount: number;
  durationMs: number;
  results: ConvertResult[];
  error?: string;
}

// ---------------------------------------------------------------------------
// Allowed formats
// ---------------------------------------------------------------------------

const ALLOWED_FROM = new Set(["md", "markdown", "docx", "pdf"]);
const ALLOWED_TO = new Set(["md", "markdown", "docx", "pdf", "html"]);

/** Normalize format alias to canonical extension. */
function normalizeFormat(fmt: string): string {
  if (fmt === "markdown") return "md";
  return fmt;
}

/** Map format to pandoc format name. */
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

// ---------------------------------------------------------------------------
// Path helpers
// ---------------------------------------------------------------------------

/**
 * Validate that a directory path is within workspace.
 * Unlike validateInputPath, this accepts directories (not just files).
 */
function validateDirectoryPath(inputPath: string): { ok: true } | { ok: false; error: string } {
  const ws = getWorkspaceDir();
  const resolved = path.resolve(ws, inputPath);
  const rel = path.relative(ws, resolved);

  // Reject path traversal outside workspace
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    return { ok: false, error: `Access denied: path escapes workspace directory (${inputPath})` };
  }

  // Check that directory exists
  try {
    const stat = fs.statSync(resolved);
    if (!stat.isDirectory()) {
      return { ok: false, error: `Not a directory: ${resolved}` };
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `Cannot read directory: ${msg}` };
  }

  return { ok: true };
}

/**
 * Validate that an output directory path is within workspace.
 * The directory does NOT need to exist yet — only check path safety.
 */
function validateOutputDirectory(outputPath: string): { ok: true } | { ok: false; error: string } {
  const ws = getWorkspaceDir();
  const resolved = path.resolve(ws, outputPath);
  const rel = path.relative(ws, resolved);

  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    return { ok: false, error: `Access denied: output path escapes workspace directory (${outputPath})` };
  }

  return { ok: true };
}

// ---------------------------------------------------------------------------
// Glob-like filename matching
// ---------------------------------------------------------------------------

/**
 * Match a filename against a simple glob pattern.
 * Supports: * (any chars), ? (single char), no nested path matching.
 */
function matchPattern(filename: string, pattern: string): boolean {
  // Escape regex special chars except * and ?
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, "[^/]*")
    .replace(/\?/g, "[^/]");
  const re = new RegExp(`^${escaped}$`);
  return re.test(filename);
}

// ---------------------------------------------------------------------------
// File collection
// ---------------------------------------------------------------------------

interface CollectedFile {
  absolutePath: string;
  relativePath: string; // relative to workspace
  fileName: string;     // basename without extension
  ext: string;
}

/**
 * Collect files from a directory, applying include/exclude filters.
 */
function collectFiles(
  dir: string,
  ext: string,
  recursive: boolean,
  include?: string[],
  exclude?: string[]
): CollectedFile[] {
  const results: CollectedFile[] = [];

  if (!fs.existsSync(dir)) {
    return results;
  }

  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (recursive && entry.name !== "." && entry.name !== "..") {
        results.push(...collectFiles(
          path.join(dir, entry.name),
          ext,
          true,
          include,
          exclude,
        ));
      }
    } else if (entry.isFile()) {
      const fileExt = path.extname(entry.name).slice(1).toLowerCase();
      const normalized = fileExt === "markdown" ? "md" : fileExt;

      // Extension match
      if (normalized !== ext && !(ext === "md" && fileExt === "markdown")) {
        continue;
      }

      // include filter: if specified, filename must match at least one pattern
      if (include && include.length > 0) {
        const matched = include.some(p => matchPattern(entry.name, p));
        if (!matched) continue;
      }

      // exclude filter: if filename matches any pattern, skip
      if (exclude && exclude.length > 0) {
        const skipped = exclude.some(p => matchPattern(entry.name, p));
        if (skipped) continue;
      }

      const absPath = path.join(dir, entry.name);
      results.push({
        absolutePath: absPath,
        relativePath: path.relative(getWorkspaceDir(), absPath),
        fileName: path.basename(entry.name, "." + fileExt),
        ext: fileExt,
      });
    }
  }

  return results;
}

// ---------------------------------------------------------------------------
// Single file conversion (reuse existing logic)
// ---------------------------------------------------------------------------

async function convertSingleFile(
  filePath: string,
  outputPath: string,
  fromExt: string,
  toExt: string,
  cleanForLLM?: boolean,
): Promise<ConvertResult> {
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

  return PandocConverter.convert(filePath, outputPath, fromFormat, toFormat);
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

// ---------------------------------------------------------------------------
// Concurrency pool
// ---------------------------------------------------------------------------

/**
 * Run conversions with a concurrency limit.
 * Returns results in the order the promises were submitted (FIFO).
 */
async function runWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (true) {
      const idx = nextIndex;
      if (idx >= items.length) break;
      nextIndex++;

      results[idx] = await fn(items[idx], idx);
    }
  }

  const workers: Promise<void>[] = [];
  const concurrent = Math.min(limit, items.length);
  for (let i = 0; i < concurrent; i++) {
    workers.push(worker());
  }
  await Promise.all(workers);
  return results;
}

// ---------------------------------------------------------------------------
// Main entry
// ---------------------------------------------------------------------------

/**
 * Tool handler: batch_convert (v0.2.0)
 * Converts all matching files in a directory from one format to another.
 */
export async function batchConvert(params: BatchConvertParams): Promise<BatchResult> {
  const startMs = Date.now();

  const {
    inputDir,
    outputDir,
    from,
    to,
    recursive,
    overwrite,
    cleanForLLM,
    dryRun,
    include,
    exclude,
    maxConcurrency,
    continueOnError,
  } = params;

  const ws = getWorkspaceDir();

  // ── 1. Validate from/to formats ──────────────────────────────────────
  const normFrom = normalizeFormat(from);
  if (!ALLOWED_FROM.has(normFrom)) {
    return makeError(startMs, `Invalid from format: "${from}". Allowed: ${[...ALLOWED_FROM].join(", ")}.`);
  }

  const normTo = normalizeFormat(to);
  if (!ALLOWED_TO.has(normTo)) {
    return makeError(startMs, `Invalid to format: "${to}". Allowed: ${[...ALLOWED_TO].join(", ")}.`);
  }

  // ── 2. Validate inputDir (must be within workspace) ─────────────────
  const inputValidation = validateDirectoryPath(inputDir);
  if (!inputValidation.ok) {
    return makeError(startMs, inputValidation.error);
  }

  // ── 3. Validate outputDir (must be within workspace) ────────────────
  const outputValidation = validateOutputDirectory(outputDir);
  if (!outputValidation.ok) {
    return makeError(startMs, outputValidation.error);
  }

  // ── 4. Resolve absolute paths ───────────────────────────────────────
  const resolvedInputDir = path.resolve(ws, inputDir);
  const resolvedOutputDir = path.resolve(ws, outputDir);

  // ── 5. Clamp maxConcurrency ──────────────────────────────────────────
  const clampedConcurrency = Math.max(1, Math.min(8, maxConcurrency ?? 1));

  // ── 6. Collect files ────────────────────────────────────────────────
  const files = collectFiles(resolvedInputDir, normFrom, recursive ?? false, include, exclude);
  const plannedCount = files.length;

  logger.info(`batch_convert: ${inputDir}/*.${normFrom} -> ${outputDir}/*.${normTo} (${plannedCount} files, concurrency=${clampedConcurrency})`);

  // ── 7. dryRun: return plan without converting ───────────────────────
  if (dryRun) {
    const plannedResults: ConvertResult[] = files.map(f => ({
      success: true,
      input: f.absolutePath,
      output: path.join(resolvedOutputDir, path.relative(resolvedInputDir, f.absolutePath)).replace(/\.[^.]+$/, "." + normTo),
      engine: "pandoc",
      warnings: [],
      status: "planned",
    }));

    return {
      success: true,
      summary: `Batch conversion dry-run: ${plannedCount} files planned, 0 executed.`,
      total: plannedCount,
      plannedCount,
      skippedCount: 0,
      successCount: 0,
      failedCount: 0,
      durationMs: Date.now() - startMs,
      results: plannedResults,
    };
  }

  // ── 8. Execute conversions ──────────────────────────────────────────
  const results: ConvertResult[] = [];
  let successCount = 0;
  let failedCount = 0;
  let skippedCount = 0;

  // Build work items
  const workItems: Array<{ file: CollectedFile; index: number }> = files.map((f, i) => ({ file: f, index: i }));

  const converted = await runWithConcurrency(workItems, clampedConcurrency, async (workItem) => {
    const file = workItem.file;
    const fileName = path.basename(file.absolutePath, "." + file.ext);
    const relDir = path.relative(resolvedInputDir, path.dirname(file.absolutePath));
    const outFileName = fileName + "." + normTo;
    const outRelPath = relDir ? path.join(relDir, outFileName) : outFileName;
    const outFullPath = path.resolve(resolvedOutputDir, outRelPath);

    // Overwrite protection
    if (!overwrite && fs.existsSync(outFullPath)) {
      return {
        index: workItem.index,
        result: {
          success: false,
          input: file.relativePath,
          output: outRelPath,
          engine: "pandoc",
          warnings: [],
          error: `Output file already exists: ${outRelPath}. Set overwrite=true to replace.`,
        } as ConvertResult,
      };
    }

    // Ensure output directory exists
    const outDir = path.dirname(outFullPath);
    if (!fs.existsSync(outDir)) {
      fs.mkdirSync(outDir, { recursive: true });
    }

    // Perform conversion
    const result = await convertSingleFile(file.absolutePath, outFullPath, normFrom, normTo, cleanForLLM);
    result.input = file.relativePath;
    result.output = outRelPath;

    return { index: workItem.index, result };
  });

  // Sort by original index to preserve file order
  converted.sort((a, b) => a.index - b.index);

  for (const item of converted) {
    results.push(item.result);
    if (item.result.success) {
      successCount++;
    } else {
      failedCount++;
      // continueOnError: if false, stop after first failure
      if (continueOnError === false) {
        // Still record the result but don't process further
        // We need to fill remaining as skipped
        const remaining = files.length - item.index - 1;
        skippedCount += remaining;
        for (let r = 0; r < remaining; r++) {
          results.push({
            success: false,
            input: files[item.index + 1 + r]?.relativePath ?? "",
            output: "",
            engine: "pandoc",
            warnings: [],
            error: `Skipped due to earlier failure (continueOnError=false)`,
            status: "skipped",
          });
        }
        break;
      }
    }
  }

  // Fill skipped for remaining files when continueOnError stopped early
  if (continueOnError === false && failedCount > 0) {
    // Already handled above
  }

  const overallSuccess = failedCount === 0;

  return {
    success: overallSuccess,
    summary: `Batch conversion completed: ${successCount} succeeded, ${failedCount} failed, ${skippedCount} skipped.`,
    total: plannedCount,
    plannedCount,
    skippedCount,
    successCount,
    failedCount,
    durationMs: Date.now() - startMs,
    results,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeError(durationStart: number, message: string): BatchResult {
  return {
    success: false,
    summary: `Batch conversion failed: ${message}`,
    total: 0,
    plannedCount: 0,
    skippedCount: 0,
    successCount: 0,
    failedCount: 0,
    durationMs: Date.now() - durationStart,
    results: [],
    error: message,
  };
}
