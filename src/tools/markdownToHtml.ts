import type { ConvertResult, MarkdownToHtmlParams } from "../types/convert.js";
import { logger } from "../utils/logger.js";
import { validateInputPath, validateOutputPath, outputExists } from "../utils/pathGuard.js";
import { resolveOutputPath } from "../utils/outputPath.js";
import { PandocConverter } from "../converters/pandoc.js";
import { validateMarkdown } from "../utils/markdownPreflight.js";
import fs from "fs";
import path from "path";

/**
 * Tool handler: markdown_to_html
 * Converts a Markdown file to HTML using Pandoc.
 */
export async function markdownToHtml(params: MarkdownToHtmlParams): Promise<ConvertResult> {
  const { inputPath, outputPath, cssPath, standalone, overwrite, strictMarkdown } = params;

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

  // Preflight: read and validate Markdown content
  const fullPath = path.resolve(path.dirname(inputPath), inputPath);
  let preflightWarnings: string[] = [];
  if (fs.existsSync(fullPath)) {
    const content = fs.readFileSync(fullPath, "utf-8");
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
  const resolvedOutput = resolveOutputPath(inputPath, outputPath, "html");

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

  logger.info(`markdown_to_html: ${inputPath} -> ${resolvedOutput}`);

  // Build extra pandoc args
  const extraArgs: string[] = [];
  if (standalone) {
    extraArgs.push("--standalone");
  }
  if (cssPath) {
    const cssValidation = validateInputPath(cssPath);
    if (!cssValidation.ok) {
      return {
        success: false,
        input: inputPath,
        output: resolvedOutput,
        engine: "pandoc",
        warnings: [],
        error: `CSS file validation failed: ${cssValidation.error}`,
      };
    }
    extraArgs.push("--css", cssPath);
  }

  const result = await PandocConverter.convert(inputPath, resolvedOutput, "markdown", "html", extraArgs);

  // Attach preflight warnings
  if (preflightWarnings.length > 0) {
    result.warnings = [...preflightWarnings, ...result.warnings];
  }

  return result;
}
