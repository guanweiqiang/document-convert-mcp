import type { ConvertResult, MarkdownToDocxParams } from "../types/convert.js";
import { logger } from "../utils/logger.js";
import { validateInputPath, validateOutputPath, outputExists, getWorkspaceDir } from "../utils/pathGuard.js";
import { resolveOutputPath } from "../utils/outputPath.js";
import { PandocConverter } from "../converters/pandoc.js";
import { validateMarkdown } from "../utils/markdownPreflight.js";
import fs from "fs";
import path from "path";

/**
 * Tool handler: markdown_to_docx
 * Converts a Markdown file to DOCX using Pandoc.
 *
 * v0.2.0: resolved input path is now passed to Pandoc (absolute path).
 */
export async function markdownToDocx(params: MarkdownToDocxParams): Promise<ConvertResult> {
  const { inputPath, outputPath, referenceDocx, toc, overwrite, strictMarkdown } = params;
  const ws = getWorkspaceDir();

  // Validate input
  const inputValidation = validateInputPath(inputPath);
  if (!inputValidation.ok) {
    return {
      success: false,
      input: inputPath,
      output: outputPath,
      engine: "pandoc",
      warnings: [],
      error: inputValidation.error,
    };
  }

  // Resolve input to absolute workspace path
  const resolvedInput = path.resolve(ws, inputPath);

  // Preflight: read and validate Markdown content
  let preflightWarnings: string[] = [];
  if (fs.existsSync(resolvedInput)) {
    const content = fs.readFileSync(resolvedInput, "utf-8");
    const preflight = validateMarkdown(content);
    preflightWarnings = preflight.warnings;
    if (strictMarkdown && !preflight.ok) {
      return {
        success: false,
        input: inputPath,
        output: outputPath,
        engine: "pandoc",
        warnings: [],
        error: preflight.warnings.join(" "),
      };
    }
  }

  // Resolve output path
  const resolvedOutput = resolveOutputPath(inputPath, outputPath, "docx");

  // Validate output
  const outputValidation = validateOutputPath(resolvedOutput);
  if (!outputValidation.ok) {
    return {
      success: false,
      input: inputPath,
      output: resolvedOutput,
      engine: "pandoc",
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
      engine: "pandoc",
      warnings: [],
      error: `Output file already exists: ${resolvedOutput}. Set overwrite=true to replace it.`,
    };
  }

  logger.info(`markdown_to_docx: ${inputPath} -> ${resolvedOutput}`);

  // Build extra pandoc args
  const extraArgs: string[] = [];
  if (toc) extraArgs.push("--toc");
  if (referenceDocx) {
    const refValidation = validateInputPath(referenceDocx);
    if (!refValidation.ok) {
      return {
        success: false,
        input: inputPath,
        output: resolvedOutput,
        engine: "pandoc",
        warnings: [],
        error: `Reference docx validation failed: ${refValidation.error}`,
      };
    }
    const resolvedRef = path.resolve(ws, referenceDocx);
    extraArgs.push("--reference-doc", resolvedRef);
  }

  // Use RESOLVED absolute input path
  const result = await PandocConverter.convert(resolvedInput, resolvedOutput, "markdown", "docx", extraArgs);

  // Attach preflight warnings
  if (preflightWarnings.length > 0) {
    result.warnings = [...preflightWarnings, ...result.warnings];
  }

  return result;
}
