import { logger } from "./logger.js";
import { PandocConverter } from "../converters/pandoc.js";
import { MarkItDownConverter } from "../converters/markitdown.js";

/**
 * Check availability of all conversion dependencies on startup.
 * Returns an object indicating which engines are available.
 */
export async function checkDependencies(): Promise<{
  pandoc: boolean;
  markitdown: boolean;
}> {
  const pandoc = await PandocConverter.isAvailable();
  const markitdown = await MarkItDownConverter.isAvailable();

  logger.info(`Dependencies check: pandoc=${pandoc}, markitdown=${markitdown}`);

  if (!pandoc) {
    logger.warn("Pandoc is not installed. PDF/DOCX/HTML conversions will fail.");
    logger.warn("Install Pandoc: https://pandoc.org/installing.html");
  }

  if (!markitdown) {
    logger.warn("MarkItDown is not installed. PDF-to-Markdown will fall back to Pandoc or fail.");
    logger.warn("Install MarkItDown: pip install markitdown");
  } else {
    logger.info(
      "Note: markitdown exists does not guarantee PDF support is installed. " +
        "PDF extraction requires: pip install -U \"markitdown[pdf]\" or \"markitdown[all]\""
    );
  }

  return { pandoc, markitdown };
}
