import { spawn, ChildProcess } from "child_process";
import { logger } from "./logger.js";

export interface CommandResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  timedOut: boolean;
}

export interface CommandError extends Error {
  command: string;
  args: string[];
  exitCode: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
}

/**
 * Execute a command safely using spawn (never exec/string concatenation).
 * Returns structured result or rejects with a CommandError containing captured output.
 */
export async function runCommand(
  command: string,
  args: string[],
  options?: { timeout?: number; cwd?: string }
): Promise<CommandResult> {
  const timeoutMs = options?.timeout ?? parseInt(process.env.DOC_CONVERTER_CMD_TIMEOUT || "60000", 10);
  const cwd = options?.cwd;

  logger.debug(`Executing: ${command} ${args.join(" ")}`);

  return new Promise<CommandResult>((resolve, reject) => {
    const child: ChildProcess = spawn(command, args, {
      cwd,
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
    }, timeoutMs);

    child.stdout?.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });

    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    child.on("error", (err: Error) => {
      clearTimeout(timer);
      reject(makeError(command, args, null, stdout, stderr, false, err.message ?? "spawn error"));
    });

    child.on("close", (exitCode: number | null) => {
      clearTimeout(timer);
      if (timedOut) {
        reject(
          makeError(command, args, exitCode, stdout, stderr, true, `Command timed out after ${timeoutMs}ms`)
        );
        return;
      }

      if (exitCode !== 0 && exitCode !== null) {
        reject(
          makeError(
            command,
            args,
            exitCode,
            stdout,
            stderr,
            false,
            `Exited with code ${exitCode}`
          )
        );
        return;
      }

      resolve({ stdout, stderr, exitCode, timedOut: false });
    });
  });
}

function makeError(
  command: string,
  args: string[],
  exitCode: number | null,
  stdout: string,
  stderr: string,
  timedOut: boolean,
  message: string
): CommandError {
  const err = Object.assign(new Error(message), {
    command,
    args,
    exitCode,
    stdout,
    stderr,
    timedOut,
  }) as CommandError;
  return err;
}
