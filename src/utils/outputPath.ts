import path from "path";
import { getWorkspaceDir } from "./pathGuard.js";

/**
 * Derive a sensible output path when the user doesn't provide one.
 * Example: for input "docs/readme.md" → output "docs/readme.pdf"
 */
export function deriveOutputPath(inputPath: string, newExtension: string): string {
  const dir = path.dirname(inputPath);
  const baseName = path.basename(inputPath, path.extname(inputPath));
  return path.join(dir, baseName + "." + newExtension);
}

/**
 * Resolve a potentially-optional output path to an absolute workspace-relative path.
 * If outputPath is undefined, derive one from the input file name.
 */
export function resolveOutputPath(
  inputPath: string,
  outputPath: string | undefined,
  newExtension: string
): string {
  const ws = getWorkspaceDir();
  const resolvedInput = path.resolve(ws, inputPath);

  if (outputPath) {
    return path.resolve(ws, outputPath);
  }

  const derived = deriveOutputPath(resolvedInput, newExtension);
  // Return relative to workspace so pathGuard can validate it
  return path.relative(ws, derived);
}
