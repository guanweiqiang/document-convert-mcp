/**
 * Preflight validation for Markdown content.
 * Checks for structural issues like unclosed fenced code blocks.
 */

export interface MarkdownPreflightResult {
  ok: boolean;
  warnings: string[];
  error?: string;
}

/**
 * Check Markdown content for common structural issues.
 * Currently validates fenced code block closure.
 */
export function validateMarkdown(content: string): MarkdownPreflightResult {
  const warnings: string[] = [];

  // Check for unclosed fenced code blocks
  const unclosed = checkUnclosedFencedCodeBlocks(content);
  if (unclosed) {
    warnings.push(
      "Unclosed fenced code block detected. The output document may lose code block structure."
    );
  }

  return {
    ok: warnings.length === 0,
    warnings,
    error: warnings.length > 0 ? warnings.join(" ") : undefined,
  };
}

/**
 * Detect unclosed fenced code blocks (``` or ~~~).
 * A fenced code block opens with ``` or ~~~ on its own line and closes with the same delimiter.
 */
function checkUnclosedFencedCodeBlocks(content: string): boolean {
  const lines = content.split("\n");
  let inFencedBlock = false;
  let fenceChar = "";
  let fenceLen = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Check if this line is a fence opener or closer
    const match = trimmed.match(/^(`{3,}|~{3,})(.*)?$/);

    if (!match) continue;

    const fence = match[1];
    const after = match[2] ?? "";
    const currentChar = fence[0];

    if (!inFencedBlock) {
      // Opening a fenced code block
      inFencedBlock = true;
      fenceChar = currentChar;
      fenceLen = fence.length;
    } else {
      // Inside a fenced code block — check for close
      if (currentChar === fenceChar && fence.length >= fenceLen && !after.replace(/ /g, "")) {
        // Closing fence: same char, at least as long, no info string
        inFencedBlock = false;
        fenceChar = "";
        fenceLen = 0;
      }
    }
  }

  return inFencedBlock;
}
