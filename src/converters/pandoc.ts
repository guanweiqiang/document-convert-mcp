import { logger } from "../utils/logger.js";
import { runCommand, type CommandError } from "../utils/commandRunner.js";
import type { ConvertResult } from "../types/convert.js";

/**
 * Check if a CLI command is available on the system PATH.
 */
export async function isCommandAvailable(name: string): Promise<boolean> {
  try {
    await runCommand("which", [name], { timeout: 5000 });
    return true;
  } catch {
    // On Windows, 'which' won't exist — fall back to 'where'
    try {
      await runCommand("where", [name], { timeout: 5000 });
      return true;
    } catch {
      logger.debug(`Command "${name}" not found on PATH`);
      return false;
    }
  }
}

/**
 * Pandoc converter — wraps the pandoc CLI for document transformations.
 */
export class PandocConverter {
  private static _available: boolean | null = null;

  static async isAvailable(): Promise<boolean> {
    if (this._available === null) {
      this._available = await isCommandAvailable("pandoc");
    }
    return this._available;
  }

  /**
   * Run pandoc with the given source and target formats.
   */
  static async convert(
    inputPath: string,
    outputPath: string,
    fromFormat: string,
    toFormat: string,
    extraArgs: string[] = []
  ): Promise<ConvertResult> {
    const available = await this.isAvailable();
    if (!available) {
      return {
        success: false,
        input: inputPath,
        output: outputPath,
        engine: "pandoc",
        warnings: [],
        error:
          "Pandoc is not installed or not available on PATH. Please install Pandoc to use this converter.",
      };
    }

    const args = [
      `-f`,
      fromFormat,
      `-t`,
      toFormat,
      `-i`,
      inputPath,
      `-o`,
      outputPath,
      ...extraArgs,
    ];

    // Debug: log the full pandoc command
    logger.debug(`pandoc args: ${JSON.stringify(args)}`);

    try {
      const result = await runCommand("pandoc", args);
      return {
        success: true,
        input: inputPath,
        output: outputPath,
        engine: "pandoc",
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

      // Extract warnings from pandoc stderr
      if (cmdErr.stderr) {
        const warningLines = cmdErr.stderr
          .split("\n")
          .filter((l) => l.toLowerCase().includes("warning"));
        for (const wl of warningLines.slice(0, 5)) {
          warnings.push(wl.trim());
        }
      }

      return {
        success: false,
        input: inputPath,
        output: outputPath,
        engine: "pandoc",
        warnings,
        error: `Pandoc conversion failed: ${cmdErr.message || "unknown error"}`,
        details: {
          stdout: cmdErr.stdout?.trim(),
          stderr: cmdErr.stderr?.trim(),
          exitCode: cmdErr.exitCode ?? undefined,
        },
      };
    }
  }
}
