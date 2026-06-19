import fs from "fs";
import path from "path";

// Sensitive file basenames and directory names that must never be accessed.
const SENSITIVE_BASENAMES = new Set([
  ".env",
  ".env.local",
  ".env.production",
  ".ssh",
  "id_rsa",
  "id_ed25519",
  ".npmrc",
  ".git",
  ".git/config",
  ".gitignore",
  ".npm",
  ".config",
  ".bash_history",
  ".zsh_history",
  "authorized_keys",
  "known_hosts",
]);

const MAX_INPUT_SIZE = 50 * 1024 * 1024; // 50 MB default

/** Resolve workspace directory from env or default to cwd. */
export function getWorkspaceDir(): string {
  return process.env.DOC_CONVERTER_WORKSPACE || process.cwd();
}

/**
 * Validate that an input path is safe:
 * - Within workspace directory
 * - Not a sensitive file or directory
 * - Under the maximum file size limit
 */
export function validateInputPath(inputPath: string): { ok: true } | { ok: false; error: string } {
  const workspace = getWorkspaceDir();
  const resolved = path.resolve(workspace, inputPath);
  const rel = path.relative(workspace, resolved);

  // Reject path traversal outside workspace
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    return { ok: false, error: `Access denied: path escapes workspace directory (${inputPath})` };
  }

  const basename = path.basename(resolved);
  if (SENSITIVE_BASENAMES.has(basename) || SENSITIVE_BASENAMES.has(path.basename(path.dirname(resolved)))) {
    return { ok: false, error: `Access denied: sensitive file or directory blocked (${basename})` };
  }

  // Check file size
  try {
    const stat = fs.statSync(resolved);
    if (!stat.isFile()) {
      return { ok: false, error: `Not a file: ${resolved}` };
    }
    if (stat.size > MAX_INPUT_SIZE) {
      return { ok: false, error: `File too large (${formatBytes(stat.size)}). Maximum allowed: ${formatBytes(MAX_INPUT_SIZE)}.` };
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `Cannot read file: ${msg}` };
  }

  return { ok: true };
}

/**
 * Validate output path: must reside within workspace and directory must exist.
 */
export function validateOutputPath(outputPath: string, workspace?: string): { ok: true } | { ok: false; error: string } {
  const ws = workspace ?? getWorkspaceDir();
  const resolved = path.resolve(ws, outputPath);
  const rel = path.relative(ws, resolved);

  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    return { ok: false, error: `Output path escapes workspace directory (${outputPath})` };
  }

  const dirname = path.dirname(resolved);
  try {
    if (!fs.existsSync(dirname)) {
      return { ok: false, error: `Output directory does not exist: ${dirname}. Create it first.` };
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `Cannot check output directory: ${msg}` };
  }

  return { ok: true };
}

/** Check if an output file already exists (for overwrite protection). */
export function outputExists(outputPath: string, workspace?: string): boolean {
  const ws = workspace ?? getWorkspaceDir();
  const resolved = path.resolve(ws, outputPath);
  return fs.existsSync(resolved);
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
