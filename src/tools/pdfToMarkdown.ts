import path from "path";
import fs from "fs";
import type { ConvertResult, PdfToMarkdownParams, PdfConversionQuality } from "../types/convert.js";
import { logger } from "../utils/logger.js";
import { validateInputPath, validateOutputPath, outputExists, getWorkspaceDir } from "../utils/pathGuard.js";
import { resolveOutputPath } from "../utils/outputPath.js";
import { PandocConverter } from "../converters/pandoc.js";
import { MarkItDownConverter } from "../converters/markitdown.js";

/**
 * Build the sidecar source path for a given PDF input path.
 * e.g. "docs/report.pdf" → "docs/report.source.md"
 */
function buildSourceSidecarPath(pdfInputPath: string): string {
  const dir = path.dirname(pdfInputPath);
  const base = path.basename(pdfInputPath, ".pdf");
  return path.join(dir, `${base}.source.md`);
}

/**
 * Quality report for text-extraction mode (conservative: nothing reliable).
 */
const TEXT_EXTRACTION_QUALITY: PdfConversionQuality = {
  mode: "text-extraction",
  layoutPreserved: false,
  headingsReliable: false,
  tablesReliable: false,
  codeBlocksReliable: false,
  readingOrderReliable: false,
};

/**
 * Quality report for source-sidecar mode (full fidelity).
 */
const SOURCE_SIDECAR_QUALITY: PdfConversionQuality = {
  mode: "source-sidecar",
  layoutPreserved: true,
  headingsReliable: true,
  tablesReliable: true,
  codeBlocksReliable: true,
  readingOrderReliable: true,
};

/**
 * Conservative clean-for-LLM: only whitespace/blank-line cleanup.
 * Does NOT reconstruct structure that is not reliably available.
 */
function cleanForLLM(text: string): string {
  return text
    // Merge 3+ consecutive blank lines into 2
    .replace(/\n{4,}/g, "\n\n\n")
    // Remove trailing whitespace per line
    .split("\n")
    .map((line) => line.replace(/[ \t]+$/, ""))
    .join("\n")
    // Remove standalone page-number lines (single digit or double digit on its own line, surrounded by blanks)
    .replace(/\n\s*\d{1,3}\s*\n/g, "\n\n")
    // Trim leading/trailing blank lines
    .replace(/^\n+/, "")
    .replace(/\n+$/, "");
}

/**
 * Tool handler: pdf_to_markdown
 * Extracts text content from a PDF file into Markdown format.
 *
 * IMPORTANT: This is CONTENT EXTRACTION, NOT layout or semantic structure reconstruction.
 * PDF files usually do not preserve Markdown semantics.
 * Tables, headings, code blocks, lists, and reading order may not be reliably recovered.
 */
export async function pdfToMarkdown(params: PdfToMarkdownParams): Promise<ConvertResult> {
  const { inputPath, outputPath, engine: preferredEngine, cleanForLLM: doCleanForLLM, preferSourceSidecar, overwrite } = params;

  const engine = preferredEngine ?? "markitdown";
  const effectivePreferSidecar = preferSourceSidecar ?? true;

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
      quality: TEXT_EXTRACTION_QUALITY,
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
      quality: TEXT_EXTRACTION_QUALITY,
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
      quality: TEXT_EXTRACTION_QUALITY,
    };
  }

  logger.info(`pdf_to_markdown: ${inputPath} -> ${resolvedOutput} (engine=${engine})`);

  // --- Sidecar recovery path ---
  if (effectivePreferSidecar) {
    const ws = getWorkspaceDir();
    const sidecarPath = path.resolve(ws, buildSourceSidecarPath(inputPath));

    if (fs.existsSync(sidecarPath)) {
      // Overwrite check for sidecar
      if (!overwrite && outputExists(resolvedOutput)) {
        return {
          success: false,
          input: inputPath,
          output: resolvedOutput,
          engine: "markitdown",
          warnings: [],
          error: `Output file already exists: ${resolvedOutput}. Set overwrite=true to replace it.`,
          quality: SOURCE_SIDECAR_QUALITY,
        };
      }

      // Read and write the sidecar source
      try {
        const sourceContent = fs.readFileSync(sidecarPath, "utf-8");
        const finalContent = doCleanForLLM ? cleanForLLM(sourceContent) : sourceContent;
        fs.writeFileSync(path.resolve(ws, resolvedOutput), finalContent, "utf-8");

        return {
          success: true,
          input: inputPath,
          output: resolvedOutput,
          engine: "markitdown",
          warnings: ["Source sidecar Markdown found. Returned original Markdown instead of extracting PDF text."],
          quality: SOURCE_SIDECAR_QUALITY,
        };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        logger.warn(`Sidecar read failed for ${sidecarPath}: ${msg}`);
        // Fall through to text extraction
      }
    }
  }

  // --- Text extraction path ---
  const warnings: string[] = [
    "PDF to Markdown is content extraction, not layout reconstruction.",
    "PDF files may not preserve headings, tables, lists, code blocks, or reading order.",
    "For accurate recovery of PDFs generated by this server, use markdown_to_pdf with preserveSource=true.",
    "Scanned PDFs require OCR, which is not included in this server.",
  ];

  let result: ConvertResult;

  if (engine === "markitdown") {
    result = await MarkItDownConverter.extractPdf(inputPath, resolvedOutput);
    // Add friendly hint if MarkItDown lacks PDF optional deps
    if (!result.success && result.error && typeof result.error === "string" && result.error.includes("optional")) {
      warnings.push("MarkItDown PDF support requires optional dependencies. Install with: pip install -U \"markitdown[pdf]\"");
    }
  } else {
    result = await PandocConverter.convert(inputPath, resolvedOutput, "pdf", "markdown", []);
  }

  // Post-process: clean for LLM (conservative only)
  if (doCleanForLLM && result.success && result.details?.stdout) {
    const cleaned = cleanForLLM(result.details.stdout);
    const ws = getWorkspaceDir();
    fs.writeFileSync(path.resolve(ws, resolvedOutput), cleaned);
    result.details.stdout = cleaned;
  }

  return {
    ...result,
    warnings: [...warnings, ...result.warnings],
    quality: TEXT_EXTRACTION_QUALITY,
  };
}
