import { tmpdir } from "os";
import { join } from "path";
import { writeFileSync, unlinkSync } from "fs";
import { execFileSync } from "child_process";
import { logger } from "../utils/logger.js";
import { runCommand, type CommandError } from "../utils/commandRunner.js";
import type { ConvertResult } from "../types/convert.js";

/**
 * Check if markitdown CLI is available on the system.
 * Requires Python 3 and the markitdown pip package.
 */
async function isMarkItDownAvailable(): Promise<boolean> {
  try {
    await runCommand("python3", ["-c", "import markitdown"], { timeout: 10000 });
    return true;
  } catch {
    try {
      await runCommand("python", ["-c", "import markitdown"], { timeout: 10000 });
      return true;
    } catch {
      logger.debug("markitdown Python package not found on PATH");
      return false;
    }
  }
}

/**
 * MarkItDown converter — wraps markitdown for document-to-markdown extraction.
 * Uses a temporary Python script to avoid shell injection via file paths.
 */
export class MarkItDownConverter {
  private static _available: boolean | null = null;

  static async isAvailable(): Promise<boolean> {
    if (this._available === null) {
      this._available = await isMarkItDownAvailable();
    }
    return this._available;
  }

  /**
   * Convert a document file to Markdown using markitdown.
   * Writes a small Python script to a temp file so file paths are never
   * interpolated into the command string.
   */
  static async convert(
    inputPath: string,
    outputPath?: string,
  ): Promise<ConvertResult> {
    const available = await this.isAvailable();
    if (!available) {
      return {
        success: false,
        input: inputPath,
        output: outputPath,
        engine: "markitdown",
        warnings: [],
        error:
          "MarkItDown is not available. Install with: pip install markitdown\nAlso ensure Python 3 is installed and on PATH.",
      };
    }

    const pythonCmd = this.detectPythonCommand();

    // Write a small Python script to a temp file so file paths are never interpolated into the command string.
    const scriptPath = join(tmpdir(), `markitdown_${Date.now()}.py`);
    const scriptLines: string[] = [
      "import sys",
      "from markitdown import MarkItDown",
      'input_path = sys.argv[1]',
      ...(outputPath ? ['output_path = sys.argv[2]'] : []),
      "try:",
      "    m = MarkItDown()",
      "    result = m.convert(input_path)",
      "    text = result.text_content",
      ...(outputPath
        ? ['    with open(output_path, "w", encoding="utf-8") as f:']
        : ["    print(text)"]),
      ...(outputPath ? ["        f.write(text)"] : []),
      "except Exception as e:",
      '    print(f"Error: {e}", file=sys.stderr)',
      "    sys.exit(1)",
    ];
    const script = scriptLines.join("\n");

    writeFileSync(scriptPath, script);
    const scriptArgs = [scriptPath, inputPath];
    if (outputPath) scriptArgs.push(outputPath);

    try {
      const result = await runCommand(pythonCmd, scriptArgs);
      return {
        success: true,
        input: inputPath,
        output: outputPath,
        engine: "markitdown",
        warnings: [],
        details: {
          stdout: result.stdout.trim(),
          stderr: result.stderr.trim(),
          exitCode: result.exitCode ?? undefined,
        },
      };
    } catch (err: unknown) {
      const cmdErr = err as CommandError;
      const warnings: string[] = [];
      const stderr = (cmdErr.stderr ?? "").toLowerCase();
      const stdout = (cmdErr.stdout ?? "").toLowerCase();

      // Friendly error for missing PDF optional dependencies
      if (stderr.includes("missingdependencyexception")) {
        return {
          success: false,
          input: inputPath,
          output: outputPath,
          engine: "markitdown",
          warnings: ["MarkItDown is installed, but PDF support requires optional dependencies."],
          error:
            "MarkItDown PDF support is not installed. Run: python -m pip install -U \"markitdown[pdf]\"",
          details: {
            stdout: cmdErr.stdout?.trim(),
            stderr: cmdErr.stderr?.trim(),
            exitCode: cmdErr.exitCode ?? undefined,
          },
        };
      }

      // Detect optional dependency [pdf] warnings in stderr/stdout
      if (stderr.includes("optional dependency") && (stderr.includes("[pdf]") || stderr.includes("markitdown"))) {
        return {
          success: false,
          input: inputPath,
          output: outputPath,
          engine: "markitdown",
          warnings: ["MarkItDown is installed, but PDF support requires optional dependencies."],
          error:
            "MarkItDown PDF support is not installed. Run: python -m pip install -U \"markitdown[pdf]\"",
          details: {
            stdout: cmdErr.stdout?.trim(),
            stderr: cmdErr.stderr?.trim(),
            exitCode: cmdErr.exitCode ?? undefined,
          },
        };
      }

      // Detect "pip install markitdown[pdf]" suggestions
      if (stdout.includes("pip install") && stdout.includes("markitdown")) {
        return {
          success: false,
          input: inputPath,
          output: outputPath,
          engine: "markitdown",
          warnings: ["MarkItDown is installed, but PDF support requires optional dependencies."],
          error:
            "MarkItDown PDF support is not installed. Run: python -m pip install -U \"markitdown[pdf]\"",
          details: {
            stdout: cmdErr.stdout?.trim(),
            stderr: cmdErr.stderr?.trim(),
            exitCode: cmdErr.exitCode ?? undefined,
          },
        };
      }

      return {
        success: false,
        input: inputPath,
        output: outputPath,
        engine: "markitdown",
        warnings,
        error: `MarkItDown conversion failed: ${cmdErr.message || "unknown error"}`,
        details: {
          stdout: cmdErr.stdout?.trim(),
          stderr: cmdErr.stderr?.trim(),
          exitCode: cmdErr.exitCode ?? undefined,
        },
      };
    } finally {
      // Clean up temp script
      try { unlinkSync(scriptPath); } catch { /* ignore */ }
    }
  }

  /**
   * Extract text content from PDF using markitdown.
   */
  static async extractPdf(inputPath: string, outputPath?: string): Promise<ConvertResult> {
    return this.convert(inputPath, outputPath);
  }

  /**
   * Extract text content from DOCX using markitdown.
   */
  static async extractDocx(inputPath: string, outputPath?: string): Promise<ConvertResult> {
    return this.convert(inputPath, outputPath);
  }

  private static detectPythonCommand(): string {
    try {
      execFileSync("python3", ["--version"], { stdio: "ignore" });
      return "python3";
    } catch {
      return "python";
    }
  }
}
