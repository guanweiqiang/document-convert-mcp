/**
 * Shared types for document conversion results and tool parameters.
 */

export interface PdfConversionQuality {
  mode: "source-sidecar" | "text-extraction";
  layoutPreserved: boolean;
  headingsReliable: boolean;
  tablesReliable: boolean;
  codeBlocksReliable: boolean;
  readingOrderReliable: boolean;
}

export interface ConvertResult {
  [key: string]: unknown;
  success: boolean;
  input: string;
  output?: string;
  engine: "pandoc" | "markitdown";
  warnings: string[];
  error?: string;
  details?: {
    stdout?: string;
    stderr?: string;
    exitCode?: number;
  };
  quality?: PdfConversionQuality;
}

export interface BatchConvertResult {
  success: boolean;
  total: number;
  successCount: number;
  failedCount: number;
  results: ConvertResult[];
}

// --- Tool input schemas (Zod-compatible shapes) ---

export interface MarkdownToPdfParams {
  inputPath: string;
  outputPath?: string;
  title?: string;
  toc?: boolean;
  pageSize?: "A4" | "Letter";
  theme?: "default" | "github" | "academic";
  pdfEngine?: "pdflatex" | "xelatex" | "lualatex" | "wkhtmltopdf" | "weasyprint" | "typst";
  cjkMainFont?: string;
  preserveSource?: boolean;
  overwrite?: boolean;
  strictMarkdown?: boolean;
}

export interface MarkdownToDocxParams {
  inputPath: string;
  outputPath?: string;
  referenceDocx?: string;
  toc?: boolean;
  overwrite?: boolean;
  strictMarkdown?: boolean;
}

export interface DocxToMarkdownParams {
  inputPath: string;
  outputPath?: string;
  extractImages?: boolean;
  imageDir?: string;
  engine?: "pandoc" | "markitdown";
  markdownFlavor?: "gfm" | "commonmark" | "pandoc";
  cleanForLLM?: boolean;
  overwrite?: boolean;
}

export interface PdfToMarkdownParams {
  inputPath: string;
  outputPath?: string;
  engine?: "markitdown" | "pandoc";
  cleanForLLM?: boolean;
  preferSourceSidecar?: boolean;
  overwrite?: boolean;
}

export interface MarkdownToHtmlParams {
  inputPath: string;
  outputPath?: string;
  cssPath?: string;
  standalone?: boolean;
  overwrite?: boolean;
  strictMarkdown?: boolean;
}

export interface BatchConvertParams {
  inputDir: string;
  outputDir: string;
  from: "md" | "markdown" | "docx" | "pdf";
  to: "md" | "markdown" | "docx" | "pdf" | "html";
  recursive?: boolean;
  overwrite?: boolean;
  cleanForLLM?: boolean;
}
