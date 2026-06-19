import type { ConvertResult, MarkdownToPdfParams } from "../types/convert.js";
import { logger } from "../utils/logger.js";
import { validateInputPath, validateOutputPath, outputExists, getWorkspaceDir } from "../utils/pathGuard.js";
import { resolveOutputPath } from "../utils/outputPath.js";
import { PandocConverter } from "../converters/pandoc.js";
import { validateMarkdown } from "../utils/markdownPreflight.js";
import fs from "fs";
import path from "path";

/**
 * Detect whether content contains CJK (Chinese/Japanese/Korean) characters.
 */
function hasCjk(content: string): boolean {
  return /[㐀-䶿一-鿿豈-﫿]/.test(content);
}

/**
 * Sidecar filenames for source preservation.
 */
const SOURCE_SIDECAR_EXT = ".source.md";
const META_SIDECAR_EXT = ".meta.json";

/**
 * Build sidecar file paths from the PDF output path.
 */
function buildSidecarPaths(pdfOutputPath: string): { sourcePath: string; metaPath: string } {
  const dir = path.dirname(pdfOutputPath);
  const base = path.basename(pdfOutputPath, ".pdf");
  return {
    sourcePath: path.join(dir, `${base}${SOURCE_SIDECAR_EXT}`),
    metaPath: path.join(dir, `${base}${META_SIDECAR_EXT}`),
  };
}

/**
 * Build source sidecar path from a PDF input path.
 */
function buildSourceSidecarPath(pdfInputPath: string): string {
  const dir = path.dirname(pdfInputPath);
  const base = path.basename(pdfInputPath, ".pdf");
  return path.join(dir, `${base}${SOURCE_SIDECAR_EXT}`);
}

/**
 * Tool handler: markdown_to_pdf
 * Converts a Markdown file to PDF using Pandoc.
 */
export async function markdownToPdf(params: MarkdownToPdfParams): Promise<ConvertResult> {
  const { inputPath, outputPath, title, toc, pageSize, theme, pdfEngine, cjkMainFont, preserveSource, overwrite, strictMarkdown } = params;

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
  const ws = getWorkspaceDir();
  const fullPath = path.resolve(ws, inputPath);
  let preflightWarnings: string[] = [];
  let markdownContent = "";
  if (fs.existsSync(fullPath)) {
    markdownContent = fs.readFileSync(fullPath, "utf-8");
    const preflight = validateMarkdown(markdownContent);
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
  const resolvedOutput = resolveOutputPath(inputPath, outputPath, "pdf");

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

  logger.info(`markdown_to_pdf: ${inputPath} -> ${resolvedOutput}`);

  // Build extra pandoc args
  const extraArgs: string[] = [];
  if (title) extraArgs.push("--metadata", `title=${title}`);
  if (toc) extraArgs.push("--toc");
  if (pageSize) {
    const paperSize = pageSize.toLowerCase();
    extraArgs.push("-V", `papersize:${paperSize}`);
  }
  if (pdfEngine) extraArgs.push("--pdf-engine", pdfEngine);

  // CJK font handling
  const hasChineseContent = markdownContent !== "" && hasCjk(markdownContent);
  const shouldUseDefaultCjkFont =
    pdfEngine === "xelatex" &&
    hasChineseContent &&
    !cjkMainFont;

  if (cjkMainFont) {
    extraArgs.push("-V", `CJKmainfont:${cjkMainFont}`);
  } else if (shouldUseDefaultCjkFont) {
    extraArgs.push("-V", "CJKmainfont:Microsoft YaHei");
    preflightWarnings.push("CJK characters detected in document. Using default CJK font: Microsoft YaHei.");
  }

  // Theme: use a CSS stylesheet for github/academic themes
  if (theme && theme !== "default") {
    const cssPath = getThemeCssPath(theme);
    if (cssPath) {
      extraArgs.push("--css", cssPath);
    }
  }

  // Debug: log the final pandoc command and args
  logger.debug(
    `pandoc command: pandoc ${JSON.stringify(extraArgs)}`
  );

  const result = await PandocConverter.convert(inputPath, resolvedOutput, "markdown", "pdf", extraArgs);

  // Enhance PDF-engine-specific errors
  const enhanced = enhancePdfError(result);

  // Attach preflight warnings (including CJK warnings)
  if (preflightWarnings.length > 0) {
    enhanced.warnings = [...preflightWarnings, ...enhanced.warnings];
  }

  // Post-conversion: check for "Missing character" in stderr (CJK font warning)
  if (enhanced.success && enhanced.details?.stderr) {
    const missingCharMatch = enhanced.details.stderr.match(/Missing character:.*in font ([\w-]+)/);
    if (missingCharMatch) {
      const fontFamily = missingCharMatch[1];
      if (
        fontFamily.includes("lmroman") ||
        fontFamily.includes("lmmono") ||
        fontFamily.includes("lmsans")
      ) {
        // It's a Latin Modern font — likely CJK falling back to missing glyph
        enhanced.warnings.push(
          "CJK characters may not be rendered correctly. Use pdfEngine='xelatex' and set cjkMainFont, for example 'Microsoft YaHei' or 'SimSun'."
        );
      }
    }
  }

  // Sidecar: preserve original Markdown when preserveSource=true
  if (preserveSource && enhanced.success) {
    const sidecars = buildSidecarPaths(resolvedOutput);
    const sourceWarnings: string[] = [];

    // Validate sidecar paths through pathGuard
    const sidecarOutputValidation = validateOutputPath(sidecars.sourcePath);
    if (sidecarOutputValidation.ok) {
      // Check overwrite for sidecar files
      const sourceExists = fs.existsSync(sidecars.sourcePath);
      const metaExists = fs.existsSync(sidecars.metaPath);
      if (sourceExists && !overwrite) {
        sourceWarnings.push(`Source sidecar already exists: ${sidecars.sourcePath}. Set overwrite=true to replace it.`);
      } else if (metaExists && !overwrite) {
        sourceWarnings.push(`Meta sidecar already exists: ${sidecars.metaPath}. Set overwrite=true to replace it.`);
      } else {
        try {
          // Write source sidecar
          fs.writeFileSync(sidecars.sourcePath, markdownContent, "utf-8");

          // Write metadata sidecar
          const meta = {
            source: inputPath,
            output: resolvedOutput,
            createdAt: new Date().toISOString(),
            converter: "document-converter-mcp",
            sourceType: "markdown",
            recovery: "source-sidecar",
          };
          fs.writeFileSync(sidecars.metaPath, JSON.stringify(meta, null, 2), "utf-8");

          sourceWarnings.push("Source Markdown sidecar generated for accurate PDF-to-Markdown recovery.");
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          sourceWarnings.push(`Source sidecar write failed (${msg}). PDF was generated successfully.`);
        }
      }
    } else {
      sourceWarnings.push(`Source sidecar path validation failed: ${sidecarOutputValidation.error}`);
    }

    if (sourceWarnings.length > 0) {
      enhanced.warnings = [...enhanced.warnings, ...sourceWarnings];
    }
  }

  return enhanced;
}

/**
 * Get the CSS path for a named theme (bundled or external).
 * Returns undefined if no CSS is available for the theme.
 */
function getThemeCssPath(_theme: string): string | undefined {
  // In production, these would be bundled with the package.
  // For now, return undefined — the user can provide custom --css via extra args.
  return undefined;
}

/**
 * Wrap Pandoc PDF engine errors with friendly, actionable messages.
 */
function enhancePdfError(result: ConvertResult): ConvertResult {
  if (result.success) return result;

  const stderr = result.details?.stderr ?? "";
  const stdout = result.details?.stdout ?? "";
  const combined = (stderr + "\n" + stdout).toLowerCase();

  // Detect PDF engine not found errors (Pandoc exit code 47)
  const engineNotFound =
    combined.includes("pdflatex not found") ||
    combined.includes("xelatex not found") ||
    combined.includes("lualatex not found") ||
    combined.includes("pdf engine not found") ||
    combined.includes("latex not found") ||
    combined.includes("need to install pandoc-pdf");

  if (engineNotFound) {
    return {
      success: false,
      input: result.input,
      output: result.output,
      engine: "pandoc",
      warnings: ["Pandoc requires a PDF engine to generate PDF files."],
      error:
        "PDF engine not found. Install MiKTeX/TeX Live, or pass pdfEngine as 'xelatex', 'wkhtmltopdf', 'weasyprint', or 'typst'.",
      details: result.details,
    };
  }

  return result;
}
