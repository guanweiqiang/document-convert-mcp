import path from "path";
import fs from "fs";
import type { ConvertResult, MarkdownToHtmlParams } from "../types/convert.js";
import { logger } from "../utils/logger.js";
import { validateInputPath, validateOutputPath, outputExists, getWorkspaceDir } from "../utils/pathGuard.js";
import { resolveOutputPath } from "../utils/outputPath.js";
import { PandocConverter } from "../converters/pandoc.js";
import { validateMarkdown } from "../utils/markdownPreflight.js";

/** Valid HTML theme values accepted by Pandoc. */
const VALID_THEMES = new Set(["default", "github", "academic", "monochrome", "bookish", "mangoe", "slaper", "quarto"]);

/** Valid Pandoc highlight styles. */
const VALID_HIGHLIGHT_STYLES = new Set([
  "default", "tango", "pygments", "kate", "monochrome", "github", "darkblue",
  "emacs", "friendly", "fruity", "native", "trac", "borland",
]);

/**
 * Tool handler: markdown_to_html
 * Converts a Markdown file to HTML using Pandoc.
 *
 * v0.2.0 additions:
 * - theme, embedCss, selfContained, highlightStyle
 * - Strict validation of theme and highlightStyle values
 * - Absolute path resolution for all file operations
 */
export async function markdownToHtml(params: MarkdownToHtmlParams): Promise<ConvertResult> {
  const { inputPath, outputPath, cssPath, standalone, overwrite, strictMarkdown, theme, embedCss, selfContained, highlightStyle } = params;
  const ws = getWorkspaceDir();

  // ── Validate theme ──────────────────────────────────────────────────
  if (theme !== undefined && theme !== "default" && !VALID_THEMES.has(theme)) {
    return {
      success: false,
      input: inputPath,
      output: outputPath,
      engine: "pandoc",
      warnings: [],
      error: `Invalid theme: "${theme}". Valid themes are: ${[...VALID_THEMES].join(", ")}.`,
    };
  }

  // ── Validate highlightStyle ─────────────────────────────────────────
  if (highlightStyle !== undefined && !VALID_HIGHLIGHT_STYLES.has(highlightStyle)) {
    return {
      success: false,
      input: inputPath,
      output: outputPath,
      engine: "pandoc",
      warnings: [],
      error: `Invalid highlightStyle: "${highlightStyle}". Valid styles are: ${[...VALID_HIGHLIGHT_STYLES].join(", ")}.`,
    };
  }

  // ── Validate input path (security) ──────────────────────────────────
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

  // ── Resolve input to absolute workspace path ────────────────────────
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

  // ── Resolve output path ─────────────────────────────────────────────
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

  // ── Build extra pandoc args ─────────────────────────────────────────
  const extraArgs: string[] = [];

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
    const resolvedCss = path.resolve(ws, cssPath);
    extraArgs.push("--css", resolvedCss);
  }

  if (standalone === false) {
    extraArgs.push("--no-standalone");
  }

  if (embedCss) {
    extraArgs.push("--embed-resources");
  }

  if (selfContained) {
    extraArgs.push("--self-contained");
  }

  if (highlightStyle) {
    extraArgs.push("--highlight-style", highlightStyle);
  }

  // Theme: pandoc has built-in themes for HTML
  if (theme && theme !== "default") {
    // Pandoc HTML doesn't have --theme flag; pass as metadata for reference
    extraArgs.push("--metadata", `title-note=Theme: ${theme}`);
  }

  // Call PandocConverter with ABSOLUTE paths
  const result = await PandocConverter.convert(
    resolvedInput,
    resolvedOutput,
    "markdown",
    "html",
    extraArgs
  );

  // Attach preflight warnings
  if (preflightWarnings.length > 0) {
    result.warnings = [...preflightWarnings, ...result.warnings];
  }

  return result;
}
