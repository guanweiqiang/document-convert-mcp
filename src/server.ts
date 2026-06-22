/**
 * MCP Server for document conversion.
 * Registers all conversion tools with the Model Context Protocol.
 */

import type { ConvertResult } from "./types/convert.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { logger } from "./utils/logger.js";
import { checkDependencies } from "./utils/dependencyCheck.js";
import { markdownToPdf } from "./tools/markdownToPdf.js";
import { markdownToDocx } from "./tools/markdownToDocx.js";
import { docxToMarkdown } from "./tools/docxToMarkdown.js";
import { pdfToMarkdown } from "./tools/pdfToMarkdown.js";
import { markdownToHtml } from "./tools/markdownToHtml.js";
import { batchConvert } from "./tools/batchConvert.js";
import { doctor } from "./tools/doctor.js";

/**
 * Create the MCP server instance with all conversion tools registered.
 */
export function createServer(): McpServer {
  const server = new McpServer({
    name: "document-converter",
    version: "1.0.0",
  });

  // --- markdown_to_pdf ---
  server.registerTool(
    "markdown_to_pdf",
    {
      title: "Convert Markdown to PDF",
      description:
        "Convert a Markdown file to PDF format using Pandoc.\n" +
        "Arguments:\n" +
        "- inputPath (string, required): Path to the input Markdown file (relative to workspace)\n" +
        "- outputPath (string, optional): Path for the output PDF. Defaults to same name with .pdf extension\n" +
        "- title (string, optional): Document title for the PDF metadata\n" +
        "- toc (boolean, optional): Include a table of contents\n" +
        "- pageSize (enum, optional): Page size — 'A4' or 'Letter'. Defaults to 'A4'\n" +
        "- theme (enum, optional): Theme — 'default', 'github', or 'academic'. Currently informational\n" +
        "- pdfEngine (enum, optional): PDF engine — 'pdflatex', 'xelatex', 'lualatex', 'wkhtmltopdf', 'weasyprint', or 'typst'. Leave unset to let Pandoc choose\n" +
        "- cjkMainFont (string, optional): CJK main font used by xelatex for Chinese/Japanese/Korean PDF output. Example: 'Microsoft YaHei', 'SimSun', 'Noto Sans CJK SC'\n" +
        "- preserveSource (boolean, optional): When true, save the original Markdown as a sidecar file (e.g. sample.pdf.source.md) for accurate PDF-to-Markdown recovery. Defaults to false\n" +
        "- strictMarkdown (boolean, optional): If true, reject files with structural issues (unclosed code blocks). Defaults to false\n" +
        "- overwrite (boolean, optional): Allow overwriting existing output. Defaults to false\n" +
        "- margin (string, optional): Page margin (e.g. '1in', '2cm', '20mm', '72pt'). Validated against safe format\n" +
        "- highlightStyle (string, optional): Code highlight theme — 'default', 'tango', 'pygments', 'kate', 'monochrome', 'github', 'darkblue', 'emacs', 'friendly', 'fruity', 'native', 'trac', 'borland'\n" +
        "- numberSections (boolean, optional): Number sections. Defaults to false\n" +
        "- metadata (object, optional): Additional metadata key-value pairs",
      inputSchema: {
        inputPath: z.string().describe("Path to the input Markdown file (relative to workspace)"),
        outputPath: z.string().optional().describe("Path for the output PDF file (relative to workspace). Auto-derived if omitted."),
        title: z.string().optional().describe("Document title for PDF metadata"),
        toc: z.boolean().optional().describe("Include a table of contents"),
        pageSize: z.enum(["A4", "Letter"]).optional().describe("Page size for the PDF"),
        theme: z.enum(["default", "github", "academic"]).optional().describe("Visual theme (via CSS)"),
        pdfEngine: z.enum(["pdflatex", "xelatex", "lualatex", "wkhtmltopdf", "weasyprint", "typst"]).optional().describe("PDF rendering engine to use. Leave unset to let Pandoc choose automatically."),
        cjkMainFont: z.string().optional().describe("CJK main font for Chinese/Japanese/Korean PDF output (used by xelatex). Example: 'Microsoft YaHei', 'SimSun', 'Noto Sans CJK SC'."),
        preserveSource: z.boolean().optional().describe("When true, save the original Markdown as a sidecar file (e.g. sample.pdf.source.md) for accurate PDF-to-Markdown recovery. Defaults to false."),
        strictMarkdown: z.boolean().optional().describe("If true, reject input if Markdown has structural issues like unclosed code blocks."),
        overwrite: z.boolean().optional().describe("Allow overwriting existing output file. Defaults to false."),
        margin: z.string().optional().describe("Page margin in safe format (e.g. '1in', '2cm', '20mm', '72pt')."),
        highlightStyle: z.string().optional().describe("Code highlight theme. Valid values: default, tango, pygments, kate, monochrome, github, darkblue, emacs, friendly, fruity, native, trac, borland."),
        numberSections: z.boolean().optional().describe("Number sections in the PDF."),
        metadata: z.record(z.string()).optional().describe("Additional metadata key-value pairs."),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (args) => {
      const result = await markdownToPdf({
        inputPath: args.inputPath,
        outputPath: args.outputPath,
        title: args.title,
        toc: args.toc,
        pageSize: args.pageSize,
        theme: args.theme,
        pdfEngine: args.pdfEngine,
        cjkMainFont: args.cjkMainFont,
        preserveSource: args.preserveSource,
        strictMarkdown: args.strictMarkdown,
        overwrite: args.overwrite ?? false,
        margin: args.margin,
        highlightStyle: args.highlightStyle,
        numberSections: args.numberSections,
        metadata: args.metadata,
      });
      return formatResponse(result);
    }
  );

  // --- markdown_to_docx ---
  server.registerTool(
    "markdown_to_docx",
    {
      title: "Convert Markdown to DOCX",
      description:
        "Convert a Markdown file to DOCX (Word) format using Pandoc.\n" +
        "Arguments:\n" +
        "- inputPath (string, required): Path to the input Markdown file\n" +
        "- outputPath (string, optional): Output path. Defaults to same name with .docx\n" +
        "- referenceDocx (string, optional): Path to a reference DOCX template for styling\n" +
        "- toc (boolean, optional): Include a table of contents in the DOCX\n" +
        "- strictMarkdown (boolean, optional): If true, reject files with structural issues (unclosed code blocks). Defaults to false\n" +
        "- overwrite (boolean, optional): Allow overwriting. Defaults to false",
      inputSchema: {
        inputPath: z.string().describe("Path to the input Markdown file (relative to workspace)"),
        outputPath: z.string().optional().describe("Output DOCX path (relative to workspace). Auto-derived if omitted."),
        referenceDocx: z.string().optional().describe("Path to a reference DOCX template file for styling"),
        toc: z.boolean().optional().describe("Include a table of contents in the DOCX. Defaults to false."),
        strictMarkdown: z.boolean().optional().describe("If true, reject input if Markdown has structural issues like unclosed code blocks."),
        overwrite: z.boolean().optional().describe("Allow overwriting existing output file. Defaults to false."),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (args) => {
      const result = await markdownToDocx({
        inputPath: args.inputPath,
        outputPath: args.outputPath,
        referenceDocx: args.referenceDocx,
        toc: args.toc,
        strictMarkdown: args.strictMarkdown,
        overwrite: args.overwrite ?? false,
      });
      return formatResponse(result);
    }
  );

  // --- docx_to_markdown ---
  server.registerTool(
    "docx_to_markdown",
    {
      title: "Convert DOCX to Markdown",
      description:
        "Convert a DOCX file to Markdown format using Pandoc or MarkItDown.\n" +
        "Arguments:\n" +
        "- inputPath (string, required): Path to the input DOCX file\n" +
        "- outputPath (string, optional): Output path. Defaults to same name with .md\n" +
        "- extractImages (boolean, optional): Extract embedded images. Defaults to false\n" +
        "- imageDir (string, optional): Directory to store extracted images\n" +
        "- engine (enum, optional): Conversion engine — 'pandoc' or 'markitdown'. Defaults to 'pandoc'\n" +
        "- markdownFlavor (enum, optional): Markdown dialect for Pandoc output — 'gfm', 'commonmark', or 'pandoc'. Defaults to 'gfm'\n" +
        "- cleanForLLM (boolean, optional): Clean up the Markdown for LLM consumption. Defaults to false\n" +
        "- overwrite (boolean, optional): Allow overwriting. Defaults to false",
      inputSchema: {
        inputPath: z.string().describe("Path to the input DOCX file (relative to workspace)"),
        outputPath: z.string().optional().describe("Output Markdown path (relative to workspace). Auto-derived if omitted."),
        extractImages: z.boolean().optional().describe("Extract embedded images from the DOCX"),
        imageDir: z.string().optional().describe("Directory to store extracted images (relative to workspace)"),
        engine: z.enum(["pandoc", "markitdown"]).optional().describe("Conversion engine to use"),
        markdownFlavor: z.enum(["gfm", "commonmark", "pandoc"]).optional().describe("Markdown dialect for Pandoc output. Defaults to 'gfm'."),
        cleanForLLM: z.boolean().optional().describe("Clean up the Markdown output for LLM consumption"),
        overwrite: z.boolean().optional().describe("Allow overwriting existing output file. Defaults to false."),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (args) => {
      const result = await docxToMarkdown({
        inputPath: args.inputPath,
        outputPath: args.outputPath,
        extractImages: args.extractImages ?? false,
        imageDir: args.imageDir,
        engine: args.engine,
        markdownFlavor: args.markdownFlavor,
        cleanForLLM: args.cleanForLLM ?? false,
        overwrite: args.overwrite ?? false,
      });
      return formatResponse(result);
    }
  );

  // --- pdf_to_markdown ---
  server.registerTool(
    "pdf_to_markdown",
    {
      title: "Convert PDF to Markdown",
      description:
        "Extract text content from a PDF file into Markdown format.\n\n" +
        "IMPORTANT: This is CONTENT EXTRACTION, not layout reconstruction.\n" +
        "- Scanned PDFs, complex tables, two-column papers, and mathematical formulas may not convert reliably.\n" +
        "- For scanned PDFs, an OCR engine is required (not included).\n" +
        "- Default engine is MarkItDown (better text extraction). Falls back to Pandoc if unavailable.\n\n" +
        "Arguments:\n" +
        "- inputPath (string, required): Path to the input PDF file\n" +
        "- outputPath (string, optional): Output path. Defaults to same name with .md\n" +
        "- engine (enum, optional): Engine — 'markitdown' (default) or 'pandoc'\n" +
        "- cleanForLLM (boolean, optional): Clean up Markdown for LLM consumption\n" +
        "- preferSourceSidecar (boolean, optional): When true (default), first check for a source sidecar file (sample.pdf.source.md) and return it instead of extracting PDF text. This is the only reliable way to recover original Markdown structure.\n" +
        "- overwrite (boolean, optional): Allow overwriting. Defaults to false",
      inputSchema: {
        inputPath: z.string().describe("Path to the input PDF file (relative to workspace)"),
        outputPath: z.string().optional().describe("Output Markdown path (relative to workspace). Auto-derived if omitted."),
        engine: z.enum(["markitdown", "pandoc"]).optional().describe("Conversion engine. Defaults to 'markitdown'."),
        cleanForLLM: z.boolean().optional().describe("Clean up the Markdown output for LLM consumption"),
        preferSourceSidecar: z.boolean().optional().describe("When true (default), first check for a source sidecar file (.source.md) generated by markdown_to_pdf with preserveSource=true. If found, return the original Markdown instead of extracting PDF text. This is the only reliable way to recover structure."),
        overwrite: z.boolean().optional().describe("Allow overwriting existing output file. Defaults to false."),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (args) => {
      const result = await pdfToMarkdown({
        inputPath: args.inputPath,
        outputPath: args.outputPath,
        engine: args.engine,
        cleanForLLM: args.cleanForLLM ?? false,
        preferSourceSidecar: args.preferSourceSidecar,
        overwrite: args.overwrite ?? false,
      });
      return formatResponse(result);
    }
  );

  // --- markdown_to_html ---
  server.registerTool(
    "markdown_to_html",
    {
      title: "Convert Markdown to HTML",
      description:
        "Convert a Markdown file to HTML format using Pandoc.\n" +
        "Arguments:\n" +
        "- inputPath (string, required): Path to the input Markdown file\n" +
        "- outputPath (string, optional): Output path. Defaults to same name with .html\n" +
        "- cssPath (string, optional): Path to a CSS stylesheet to embed\n" +
        "- standalone (boolean, optional): Generate a complete HTML document with head/body. Defaults to true\n" +
        "- theme (string, optional): Pandoc HTML theme — 'default', 'github', 'academic', 'monochrome', 'bookish', 'mangoe', 'slaper', 'quarto'\n" +
        "- embedCss (boolean, optional): Embed CSS/resources into the HTML document\n" +
        "- selfContained (boolean, optional): Generate a self-contained HTML file with all resources embedded\n" +
        "- highlightStyle (string, optional): Code highlight theme — 'default', 'tango', 'pygments', 'kate', 'monochrome', 'github', 'darkblue', 'emacs', 'friendly', 'fruity', 'native', 'trac', 'borland'\n" +
        "- strictMarkdown (boolean, optional): If true, reject files with structural issues (unclosed code blocks). Defaults to false\n" +
        "- overwrite (boolean, optional): Allow overwriting. Defaults to false",
      inputSchema: {
        inputPath: z.string().describe("Path to the input Markdown file (relative to workspace)"),
        outputPath: z.string().optional().describe("Output HTML path (relative to workspace). Auto-derived if omitted."),
        cssPath: z.string().optional().describe("Path to a CSS stylesheet file (relative to workspace)"),
        standalone: z.boolean().optional().describe("Generate a standalone HTML document with head/body"),
        theme: z.string().optional().describe("Pandoc HTML theme. Valid values: default, github, academic, monochrome, bookish, mangoe, slaper, quarto."),
        embedCss: z.boolean().optional().describe("Embed CSS and other resources into the HTML output"),
        selfContained: z.boolean().optional().describe("Generate a self-contained HTML file with all resources embedded"),
        highlightStyle: z.string().optional().describe("Code highlight style/theme. Valid values: default, tango, pygments, kate, monochrome, github, darkblue, emacs, friendly, fruity, native, trac, borland."),
        strictMarkdown: z.boolean().optional().describe("If true, reject input if Markdown has structural issues like unclosed code blocks."),
        overwrite: z.boolean().optional().describe("Allow overwriting existing output file. Defaults to false."),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (args) => {
      const result = await markdownToHtml({
        inputPath: args.inputPath,
        outputPath: args.outputPath,
        cssPath: args.cssPath,
        standalone: args.standalone ?? true,
        strictMarkdown: args.strictMarkdown,
        overwrite: args.overwrite ?? false,
        theme: args.theme,
        embedCss: args.embedCss,
        selfContained: args.selfContained,
        highlightStyle: args.highlightStyle,
      });
      return formatResponse(result);
    }
  );

  // --- batch_convert ---
  server.registerTool(
    "batch_convert",
    {
      title: "Batch Convert Documents",
      description:
        "Convert all matching files in a directory from one format to another.\n" +
        "Individual file failures do NOT abort the entire batch.\n" +
        "Arguments:\n" +
        "- inputDir (string, required): Source directory (relative to workspace)\n" +
        "- outputDir (string, required): Destination directory (relative to workspace)\n" +
        "- from (string, required): Source format — 'md', 'markdown', 'docx', or 'pdf'\n" +
        "- to (string, required): Target format — 'md', 'markdown', 'docx', 'pdf', or 'html'\n" +
        "- recursive (boolean, optional): Traverse subdirectories. Defaults to false\n" +
        "- overwrite (boolean, optional): Overwrite existing files. Defaults to false\n" +
        "- cleanForLLM (boolean, optional): Clean Markdown output for LLM consumption\n" +
        "- dryRun (boolean, optional): Only generate plan, do not write files. Defaults to false\n" +
        "- include (string[], optional): Only convert files matching these glob patterns (e.g. ['a.md'])\n" +
        "- exclude (string[], optional): Skip files matching these glob patterns (e.g. ['skip-*'])\n" +
        "- maxConcurrency (number, optional): Max concurrent conversions (1-8, default 1)\n" +
        "- continueOnError (boolean, optional): Continue on individual file failures. Defaults to true",
      inputSchema: {
        inputDir: z.string().describe("Source directory path (relative to workspace)"),
        outputDir: z.string().describe("Destination directory path (relative to workspace)"),
        from: z.string().describe("Source file format: md, markdown, docx, or pdf"),
        to: z.string().describe("Target file format: md, markdown, docx, pdf, or html"),
        recursive: z.boolean().optional().describe("Traverse subdirectories recursively"),
        overwrite: z.boolean().optional().describe("Overwrite existing output files. Defaults to false."),
        cleanForLLM: z.boolean().optional().describe("Clean Markdown output for LLM consumption"),
        dryRun: z.boolean().optional().describe("Only generate a plan without writing files. Defaults to false."),
        include: z.array(z.string()).optional().describe("Only convert files matching these glob patterns (e.g. ['a.md', '*.txt'])"),
        exclude: z.array(z.string()).optional().describe("Skip files matching these glob patterns (e.g. ['skip-*', 'draft-*'])"),
        maxConcurrency: z.number().int().min(1).max(8).optional().describe("Maximum concurrent conversions (1-8, default 1)"),
        continueOnError: z.boolean().optional().describe("Continue processing on individual file failures. Defaults to true."),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async (args) => {
      const result = await batchConvert({
        inputDir: args.inputDir,
        outputDir: args.outputDir,
        from: args.from,
        to: args.to,
        recursive: args.recursive ?? false,
        overwrite: args.overwrite ?? false,
        cleanForLLM: args.cleanForLLM ?? false,
        dryRun: args.dryRun ?? false,
        include: args.include,
        exclude: args.exclude,
        maxConcurrency: args.maxConcurrency,
        continueOnError: args.continueOnError ?? true,
      });
      return formatBatchResponse(result);
    }
  );

  // --- doctor ---
  server.registerTool(
    "doctor",
    {
      title: "Environment Diagnostics",
      description:
        "Check the local environment for document-converter-mcp dependencies.\n" +
        "Verifies Node.js, workspace, Pandoc, Python, MarkItDown, and PDF engines.\n" +
        "This tool never fails due to missing dependencies — missing tools appear as false in the output with warnings.",
      inputSchema: {},
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async () => {
      const result = await doctor();
      if (result.success) {
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
          structuredContent: result,
        };
      }
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        isError: true,
        structuredContent: result,
      };
    }
  );

  return server;
}

/**
 * Format a single-file ConvertResult into MCP tool response.
 */
function formatResponse(result: ConvertResult): {
  content: Array<{ type: "text"; text: string }>;
  structuredContent: ConvertResult;
  isError?: boolean;
} {
  if (result.success) {
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      structuredContent: result,
    };
  }

  return {
    content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    isError: true,
    structuredContent: result,
  };
}

/**
 * Format a batch ConvertResult into MCP tool response.
 */
function formatBatchResponse(result: {
  success: boolean;
  summary: string;
  total: number;
  plannedCount: number;
  skippedCount: number;
  successCount: number;
  failedCount: number;
  durationMs: number;
  results: Array<Record<string, unknown>>;
  error?: string;
}): {
  content: Array<{ type: "text"; text: string }>;
  structuredContent: typeof result;
  isError?: boolean;
} {
  return {
    content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    structuredContent: result,
    isError: !result.success,
  };
}

/**
 * Main entry point: start the MCP server over stdio transport.
 */
export async function main() {
  logger.info("Starting document-converter MCP server...");

  // Check dependencies on startup
  const deps = await checkDependencies();

  // Create and connect the server
  const server = createServer();
  const transport = new StdioServerTransport();

  await server.connect(transport);

  logger.info(`document-converter MCP server started (pandoc=${deps.pandoc}, markitdown=${deps.markitdown})`);
}
