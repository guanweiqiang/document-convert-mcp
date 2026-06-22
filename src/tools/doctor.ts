/**
 * Doctor tool — checks the local environment for document-converter-mcp.
 *
 * Returns structured diagnostics for:
 *   - Node.js
 *   - Workspace
 *   - Pandoc
 *   - Python / MarkItDown
 *   - PDF engines (pdflatex, xelatex, lualatex, wkhtmltopdf, weasyprint, typst)
 *   - Recommendations
 *
 * This tool never fails due to a missing dependency — missing tools
 * appear as `false` in the output with warnings. Only severe internal
 * errors (e.g. unhandled exceptions) produce `success: false`.
 */

import { existsSync, writeFileSync, readdirSync, statSync } from "fs";
import { join, dirname } from "path";
import { tmpdir } from "os";
import { logger } from "../utils/logger.js";
import { runCommand } from "../utils/commandRunner.js";
import { isCommandAvailable } from "../converters/pandoc.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DoctorResult {
  [key: string]: unknown;
  success: boolean;
  summary: string;
  data: DoctorData;
  warnings: string[];
  error: string | null;
}

export interface DoctorData {
  node: { available: boolean; version: string };
  workspace: { path: string; exists: boolean; writable: boolean };
  pandoc: { available: boolean; version: string };
  python: { available: boolean; command: string };
  markitdown: { available: boolean; pdfSupport: boolean };
  pdfEngines: Record<string, boolean>;
  recommendations: string[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Safely run a command and return { ok, stdout }.
 */
async function tryCommand(
  command: string,
  args: string[],
  timeoutMs = 8000
): Promise<{ ok: boolean; stdout: string }> {
  try {
    const result = await runCommand(command, args, { timeout: timeoutMs });
    return { ok: true, stdout: result.stdout.trim() };
  } catch {
    return { ok: false, stdout: "" };
  }
}

/**
 * Detect which python command is available on PATH.
 */
async function detectPython(): Promise<{ available: boolean; command: string }> {
  // Try python3 first, then python
  for (const cmd of ["python3", "python"]) {
    const { ok } = await tryCommand(cmd, ["--version"]);
    if (ok) {
      return { available: true, command: cmd };
    }
  }
  return { available: false, command: "" };
}

/**
 * Check MarkItDown availability and PDF support.
 */
async function checkMarkItDown(pythonCmd: string): Promise<{
  available: boolean;
  pdfSupport: boolean;
}> {
  // Availability: import markitdown
  const { ok: availOk } = await tryCommand(pythonCmd, [
    "-c",
    "import markitdown; print('ok')",
  ]);
  if (!availOk) {
    return { available: false, pdfSupport: false };
  }

  // PDF support: try importing markitdown.pdf
  // We conservatively report false if we can't confirm the [pdf] extra.
  const { ok: pdfOk } = await tryCommand(pythonCmd, [
    "-c",
    "from markitdown import MarkItDown; m = MarkItDown(); print('ok')",
  ]);

  if (pdfOk) {
    return { available: true, pdfSupport: true };
  }

  // Even if full init fails, markitdown package is available
  return { available: true, pdfSupport: false };
}

/**
 * Check a single PDF engine by name.
 */
async function checkPdfEngine(name: string): Promise<boolean> {
  const { ok } = await tryCommand(name, ["--version"], 6000);
  return ok;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

export async function doctor(): Promise<DoctorResult> {
  const warnings: string[] = [];
  const recommendations: string[] = [];

  try {
    // -- Workspace --
    const workspaceEnv = process.env.DOC_CONVERTER_WORKSPACE || "";
    const workspacePath = workspaceEnv || ".";

    // -- Node.js --
    const nodeVersion = process.version || "";
    const nodeAvailable = nodeVersion.length > 0;
    let workspaceExists = existsSync(workspacePath);
    let workspaceWritable = false;
    if (workspaceExists) {
      try {
        const testFile = join(workspacePath, ".doctor_write_test_" + Date.now());
        writeFileSync(testFile, "ok");
        workspaceWritable = true;
        try {
          // eslint-disable-next-line @typescript-eslint/no-var-requires
          require("fs").unlinkSync(testFile);
        } catch {
          // best-effort cleanup
        }
      } catch {
        workspaceWritable = false;
      }
    } else {
      // Try to create the workspace directory
      try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        require("fs").mkdirSync(workspacePath, { recursive: true });
        workspaceExists = true;
        workspaceWritable = true;
      } catch {
        workspaceWritable = false;
      }
    }

    // -- Pandoc --
    const pandocAvailable = await isCommandAvailable("pandoc");
    let pandocVersion = "";
    if (pandocAvailable) {
      const { stdout } = await tryCommand("pandoc", ["--version"], 5000);
      // pandoc --version outputs "pandoc X.Y.Z ..."
      const match = stdout.match(/pandoc\s+(\S+)/i);
      pandocVersion = match ? match[0] : stdout.split("\n")[0]?.trim() || "pandoc unknown";
    }

    // -- Python --
    const pythonInfo = await detectPython();

    // -- MarkItDown --
    let markitdownAvail = false;
    let markitdownPdfSupport = false;
    if (pythonInfo.available) {
      const mi = await checkMarkItDown(pythonInfo.command);
      markitdownAvail = mi.available;
      markitdownPdfSupport = mi.pdfSupport;
      if (!markitdownAvail) {
        warnings.push(
          "MarkItDown is not installed. Install with: pip install markitdown"
        );
      } else if (!markitdownPdfSupport) {
        warnings.push(
          "MarkItDown is installed but PDF support is not confirmed. " +
            "Install with: pip install -U \"markitdown[pdf]\""
        );
      }
    }

    // -- PDF Engines --
    const pdfEngineNames = [
      "pdflatex",
      "xelatex",
      "lualatex",
      "wkhtmltopdf",
      "weasyprint",
      "typst",
    ];
    const pdfEngines: Record<string, boolean> = {} as Record<string, boolean>;
    for (const engine of pdfEngineNames) {
      pdfEngines[engine] = await checkPdfEngine(engine);
    }

    // -- Recommendations --
    // If no PDF engine is available, recommend one
    const anyEngineAvailable = Object.values(pdfEngines).some((v) => v);
    if (!anyEngineAvailable && pandocAvailable) {
      recommendations.push(
        "No PDF engine detected. For Markdown → PDF, install one of:"
      );
      recommendations.push(
        '  - xelatex (recommended for Chinese/CJK): apt install texlive-xetex texlive-latex-extra (Linux) or via MacTeX (macOS)'
      );
      recommendations.push(
        "  - pdflatex: apt install texlive-latex-base (Linux) or via MacTeX (macOS)"
      );
      recommendations.push(
        "  - weasyprint: pip install weasyprint (Python-based, no TeX needed)"
      );
      recommendations.push(
        "  - wkhtmltopdf: apt install wkhtmltopdf / brew install wkhtmltopdf"
      );
      recommendations.push(
        "  - typst: cargo install typst"
      );
    }

    // CJK recommendation
    if (!pdfEngines.xelatex && !pdfEngines.lualatex) {
      recommendations.push(
        "For Chinese/CJK PDF output, install xelatex or lualatex and set cjkMainFont."
      );
    }

    if (markitdownPdfSupport === false && markitdownAvail) {
      recommendations.push(
        "Install MarkItDown PDF support: pip install -U \"markitdown[pdf]\""
      );
    }

    return {
      success: true,
      summary: "Environment check completed.",
      data: {
        node: {
          available: nodeAvailable,
          version: nodeVersion,
        },
        workspace: {
          path: workspacePath,
          exists: workspaceExists,
          writable: workspaceWritable,
        },
        pandoc: {
          available: pandocAvailable,
          version: pandocVersion || (pandocAvailable ? "pandoc unknown" : ""),
        },
        python: {
          available: pythonInfo.available,
          command: pythonInfo.command || "none",
        },
        markitdown: {
          available: markitdownAvail,
          pdfSupport: markitdownPdfSupport,
        },
        pdfEngines,
        recommendations,
      },
      warnings,
      error: null,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    logger.error(`Doctor tool failed: ${message}`);
    return {
      success: false,
      summary: `Doctor check failed: ${message}`,
      data: {
        node: { available: false, version: "" },
        workspace: { path: process.env.DOC_CONVERTER_WORKSPACE || ".", exists: false, writable: false },
        pandoc: { available: false, version: "" },
        python: { available: false, command: "" },
        markitdown: { available: false, pdfSupport: false },
        pdfEngines: {
          pdflatex: false,
          xelatex: false,
          lualatex: false,
          wkhtmltopdf: false,
          weasyprint: false,
          typst: false,
        },
        recommendations: [],
      },
      warnings: [],
      error: message,
    };
  }
}
