# @lifeng688/document-converter-mcp

A local-first MCP server for converting documents between Markdown, PDF, DOCX, and HTML, with environment diagnostics and workspace-level configuration.

> **English**: This project focuses on AI-friendly document conversion, not pixel-perfect layout reconstruction.
>
> **中文**: 本项目重点是 AI 友好的文档转换，而不是像素级版式还原。

## Features

- **7 conversion tools**: Markdown <-> PDF, Markdown <-> DOCX, Markdown <-> HTML, PDF -> Markdown
- **`doctor` tool**: Diagnose local environment (Node.js, Pandoc, Python, MarkItDown, PDF engines)
- **Configuration file**: `.document-converter.json` for workspace-level defaults
- **Dual engine support**: Pandoc (primary) + MarkItDown (enhanced PDF/DOCX extraction)
- **Safe file access**: Workspace-isolated path validation, sensitive file blocking, no-overwrite-by-default
- **Secure command execution**: Spawn-based, no shell injection, structured errors with timeouts
- **AI-friendly output**: Optional `cleanForLLM` flag for cleaner Markdown
- **Batch processing**: Convert entire directories with concurrency control, dry run, include/exclude filters
- **PDF style options**: Margin, section numbering, syntax highlighting, metadata
- **HTML style options**: Themes, embedded CSS, self-contained output, syntax highlighting
- **DOCX image extraction**: Extract embedded images with metadata reporting
- **PDF sidecar recovery**: Accurate Markdown restoration from PDFs generated with `preserveSource: true`
- **Structured results**: Consistent JSON response format across all tools

## Supported Formats

| Source | Targets |
|--------|---------|
| Markdown (`.md`) | PDF, DOCX, HTML |
| DOCX (`.docx`) | Markdown |
| PDF (`.pdf`) | Markdown |

## Installation

### Prerequisites

1. **Node.js** >= 18.0.0
2. **Pandoc** >= 3.0
3. **Python 3** >= 3.8 (optional, for MarkItDown)

#### PDF Engine (required for Markdown -> PDF)

Pandoc can convert Markdown to PDF, but it requires an external PDF engine.

| Engine | Install | Notes |
|--------|---------|-------|
| `pdflatex` (default) | MiKTeX (Windows), TeX Live (Linux/macOS) | Most common, ~2 GB install |
| `xelatex` | TeX Live / MiKTeX | Recommended for Chinese/CJK documents |
| `lualatex` | TeX Live / MiKTeX | Lua-based LaTeX engine |
| `wkhtmltopdf` | `apt install wkhtmltopdf` / `brew install wkhtmltopdf` | Lightweight HTML-to-PDF engine |
| `weasyprint` | `pip install weasyprint` | Python-based HTML-to-PDF |
| `typst` | `cargo install typst` | Modern, fast typesetting system |

> **Chinese documents**: Use `pdfEngine: "xelatex"` with a TeX Live / MiKTeX installation that includes the `ctex` package.
>
> - **Windows**: `cjkMainFont: "Microsoft YaHei"`
> - **macOS**: `cjkMainFont: "Songti SC"`
> - **Linux**: `cjkMainFont: "Noto Sans CJK SC"`

### Install Pandoc

**macOS:**
```bash
brew install pandoc
```

**Ubuntu/Debian:**
```bash
sudo apt-get update && sudo apt-get install -y pandoc
```

**Windows:**
Download from https://pandoc.org/installing.html

Verify:
```bash
pandoc --version
```

### Install MarkItDown (optional, recommended for PDF -> Markdown)

```bash
pip install markitdown
```

Verify:
```bash
python3 -c "import markitdown; print('ok')"
```

> **PDF support requires optional dependencies:**
> ```bash
> # For PDF extraction only:
> python -m pip install -U "markitdown[pdf]"
>
> # For DOCX extraction:
> python -m pip install -U "markitdown[docx]"
>
> # For all optional converters (PDF, EPUB, HTML, DOCX, etc.):
> python -m pip install -U "markitdown[all]"
> ```
>
> `markitdown` installed does not guarantee PDF or DOCX support is available.

### Install the Server

```bash
npm install -g @lifeng688/document-converter-mcp
```

Or use directly via npx:

```bash
npx @lifeng688/document-converter-mcp
```

For development, clone the repo and build locally:

```bash
git clone https://github.com/guanweiqiang/document-convert-mcp.git
cd document-convert-mcp
npm install
npm run build
```

## MCP Client Configuration

Install the package globally first:

```bash
npm install -g @lifeng688/document-converter-mcp
```

### Claude Desktop

Edit your Claude Desktop config (`~/Library/Application Support/Claude/claude_desktop_config.json` on macOS, or `%APPDATA%\Claude\claude_desktop_config.json` on Windows):

```json
{
  "mcpServers": {
    "document-converter": {
      "command": "npx",
      "args": ["-y", "@lifeng688/document-converter-mcp"],
      "env": {
        "DOC_CONVERTER_WORKSPACE": "E:/MCPWorkDir"
      }
    }
  }
}
```

Or if installed globally, use the local path:

```json
{
  "mcpServers": {
    "document-converter": {
      "command": "document-converter-mcp",
      "env": {
        "DOC_CONVERTER_WORKSPACE": "E:/MCPWorkDir"
      }
    }
  }
}
```

Sample configs are in `examples/`:
- `mcp.json` -- MCP Inspector config
- `claude-desktop-config.json` -- Claude Desktop config

## Configuration File

Place `.document-converter.json` in your workspace root to set defaults for all tools.

**Example:**

```json
{
  "defaults": {
    "pdfEngine": "xelatex",
    "cjkMainFont": "Microsoft YaHei",
    "pageSize": "A4",
    "theme": "github",
    "cleanForLLM": true,
    "overwrite": false
  },
  "batch": {
    "maxConcurrency": 2,
    "continueOnError": true
  },
  "security": {
    "maxFileSizeMB": 50
  }
}
```

**Precedence:**

```
tool args > .document-converter.json > built-in defaults
```

**Notes:**
- The config file is read from the workspace root only (not nested directories).
- Config values cannot bypass `pathGuard` -- paths must still be within the workspace.
- `overwrite` defaults to `false` in the config for safety; do not set it to `true` unless intentional.
- For Chinese/CJK PDF generation, recommended config:
  - **Windows**: `"pdfEngine": "xelatex", "cjkMainFont": "Microsoft YaHei"`
  - **macOS**: `"pdfEngine": "xelatex", "cjkMainFont": "Songti SC"`
  - **Linux**: `"pdfEngine": "xelatex", "cjkMainFont": "Noto Sans CJK SC"`

## Tools

### 1. `doctor`

Check the local environment for document-converter-mcp dependencies.

This tool never fails due to missing dependencies -- missing tools appear as `false` in the output with warnings.

Checks:
- Node.js version
- Workspace path, existence, writability
- Pandoc availability and version
- Python availability
- MarkItDown availability and PDF support
- PDF engines: `pdflatex`, `xelatex`, `lualatex`, `wkhtmltopdf`, `weasyprint`, `typst`
- Recommendations for missing dependencies

**Example output:**

```json
{
  "success": true,
  "summary": "Environment check completed.",
  "data": {
    "node": { "available": true, "version": "v22.18.0" },
    "workspace": { "path": "E:/MCPWorkDir", "exists": true, "writable": true },
    "pandoc": { "available": true, "version": "pandoc 3.8.2" },
    "python": { "available": true, "command": "python" },
    "markitdown": { "available": true, "pdfSupport": true },
    "pdfEngines": {
      "pdflatex": true,
      "xelatex": true,
      "lualatex": true,
      "wkhtmltopdf": false,
      "weasyprint": false,
      "typst": false
    },
    "recommendations": []
  },
  "warnings": [],
  "error": null
}
```

### 2. `markdown_to_pdf`

Convert Markdown to PDF using Pandoc.

> **Note**: Pandoc requires an external PDF engine (LaTeX distribution or alternative) to generate PDFs.

> **中文文档**：`pdflatex` 不支持中文 Unicode 字符。中文 Markdown 转 PDF 请使用 `pdfEngine: "xelatex"`（推荐）并设置 `cjkMainFont`。

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `inputPath` | string | Yes | -- | Input Markdown file path (relative to workspace) |
| `outputPath` | string | No | Auto-derived | Output PDF path |
| `title` | string | No | -- | PDF document title |
| `toc` | boolean | No | false | Include table of contents |
| `pageSize` | enum | No | A4 | Page size: `A4` or `Letter` |
| `theme` | enum | No | default | Theme: `default`, `github`, `academic` |
| `pdfEngine` | enum | No | Pandoc default | PDF engine: `pdflatex`, `xelatex`, `lualatex`, `wkhtmltopdf`, `weasyprint`, `typst` |
| `cjkMainFont` | string | No | -- | CJK main font for Chinese/Japanese/Korean documents (e.g. `"Microsoft YaHei"`, `"SimSun"`, `"Noto Sans CJK SC"`) |
| `preserveSource` | boolean | No | false | Save original Markdown as sidecar files (`sample.pdf.source.md`, `sample.pdf.meta.json`) for accurate PDF-to-Markdown recovery |
| `strictMarkdown` | boolean | No | false | Reject input if Markdown has structural issues like unclosed code blocks |
| `overwrite` | boolean | No | false | Allow overwriting existing files |
| `margin` | string | No | -- | Page margin in safe format (e.g. `'1in'`, `'2cm'`, `'20mm'`, `'72pt'`) |
| `numberSections` | boolean | No | false | Number section headings in the PDF |
| `highlightStyle` | string | No | -- | Code highlight theme: `default`, `tango`, `pygments`, `kate`, `monochrome`, `github`, `darkblue`, `emacs`, `friendly`, `fruity`, `native`, `trac`, `borland` |
| `metadata` | object | No | -- | Additional metadata key-value pairs |

**Sidecar files** (when `preserveSource=true`):
- `document.pdf.source.md` -- Original Markdown content
- `document.pdf.meta.json` -- Conversion metadata

### 3. `markdown_to_docx`

Convert Markdown to DOCX using Pandoc.

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `inputPath` | string | Yes | -- | Input Markdown file path |
| `outputPath` | string | No | Auto-derived | Output DOCX path |
| `referenceDocx` | string | No | -- | Word template file |
| `toc` | boolean | No | false | Include table of contents |
| `strictMarkdown` | boolean | No | false | Reject input if Markdown has structural issues |
| `overwrite` | boolean | No | false | Allow overwriting existing files |

### 4. `docx_to_markdown`

Convert DOCX to Markdown using Pandoc or MarkItDown.

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `inputPath` | string | Yes | -- | Input DOCX file path |
| `outputPath` | string | No | Auto-derived | Output Markdown path |
| `extractImages` | boolean | No | false | Extract embedded images from the DOCX |
| `imageDir` | string | No | Auto-derived | Directory for extracted images (must be within workspace). If omitted, defaults to `${outputBasename}_media` |
| `engine` | enum | No | pandoc | Engine: `pandoc` or `markitdown` |
| `markdownFlavor` | enum | No | gfm | Markdown dialect: `gfm` (GitHub Flavored), `commonmark`, or `pandoc` |
| `cleanForLLM` | boolean | No | false | Clean Markdown for AI consumption |
| `overwrite` | boolean | No | false | Allow overwriting existing files |

**Image extraction:**

When `extractImages=true`, the response includes:

```json
{
  "imageCount": 2,
  "imageDir": "out/document_media",
  "images": [
    {
      "filename": "media/image1.png",
      "sizeBytes": 12345
    }
  ]
}
```

Even if no images are found:

```json
{
  "imageCount": 0,
  "imageDir": "out/document_media",
  "images": []
}
```

Supported image extensions: `.png`, `.jpg`, `.jpeg`, `.gif`, `.webp`, `.svg`, `.bmp`, `.tif`, `.tiff`.

**Path safety:** `imageDir` is validated against path traversal. Values like `../outside-media` will be rejected with an error containing "Access denied" and "workspace".

### 5. `pdf_to_markdown`

Extract text from PDF to Markdown.

> **Warning**: This is **content extraction**, not layout reconstruction. Scanned PDFs, complex tables, two-column papers, and mathematical formulas may not convert reliably. For scanned PDFs, OCR is required (not included).
>
> **PDF 转 Markdown 是内容提取，不是版式或语义结构还原。**
>
> 普通 PDF 通常不保存 Markdown 语义。标题、表格、代码块、列表、阅读顺序都可能无法可靠恢复。

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `inputPath` | string | Yes | -- | Input PDF file path |
| `outputPath` | string | No | Auto-derived | Output Markdown path |
| `engine` | enum | No | markitdown | Engine: `markitdown` or `pandoc` |
| `cleanForLLM` | boolean | No | false | Clean Markdown for AI consumption |
| `preferSourceSidecar` | boolean | No | true | First check for a `.source.md` sidecar file. If found, return original Markdown instead of extracting PDF text. |
| `overwrite` | boolean | No | false | Allow overwriting existing files |

**Sidecar recovery:**

If the PDF was generated by this server with `preserveSource: true`, the original Markdown is available as sidecar files (`document.pdf.source.md`, `document.pdf.meta.json`). The default `preferSourceSidecar: true` will automatically find and return it.

**Quality report:**

Sidecar recovery mode:
```json
{
  "quality": {
    "mode": "source-sidecar",
    "layoutPreserved": true,
    "headingsReliable": true,
    "tablesReliable": true,
    "codeBlocksReliable": true,
    "readingOrderReliable": true
  }
}
```

Plain text extraction mode:
```json
{
  "quality": {
    "mode": "text-extraction",
    "layoutPreserved": false,
    "headingsReliable": false,
    "tablesReliable": false,
    "codeBlocksReliable": false,
    "readingOrderReliable": false
  }
}
```

### 6. `markdown_to_html`

Convert Markdown to HTML using Pandoc.

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `inputPath` | string | Yes | -- | Input Markdown file path |
| `outputPath` | string | No | Auto-derived | Output HTML path |
| `cssPath` | string | No | -- | External CSS file path (validated via workspace pathGuard) |
| `standalone` | boolean | No | true | Generate complete HTML document with head/body |
| `strictMarkdown` | boolean | No | false | Reject input if Markdown has structural issues |
| `overwrite` | boolean | No | false | Allow overwriting existing files |
| `theme` | string | No | -- | Pandoc HTML theme: `default`, `github`, `academic`, `monochrome`, `bookish`, `mangoe`, `slaper`, `quarto` |
| `embedCss` | boolean | No | false | Embed CSS and resources into the HTML document |
| `selfContained` | boolean | No | false | Generate a self-contained single-file HTML |
| `highlightStyle` | string | No | -- | Code highlight theme: `default`, `tango`, `pygments`, `kate`, `monochrome`, `github`, `darkblue`, `emacs`, `friendly`, `fruity`, `native`, `trac`, `borland` |

> **`theme=github`** is ideal for README-style documentation.
> **`embedCss=true`** embeds CSS directly into the HTML.
> **`selfContained=true`** produces a single HTML file with all resources inline.

### 7. `batch_convert`

Convert all matching files in a directory from one format to another.

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `inputDir` | string | Yes | -- | Source directory (relative to workspace) |
| `outputDir` | string | Yes | -- | Destination directory (relative to workspace) |
| `from` | enum | Yes | -- | Source format: `md`, `markdown`, `docx`, `pdf` |
| `to` | enum | Yes | -- | Target format: `md`, `markdown`, `docx`, `pdf`, `html` |
| `recursive` | boolean | No | false | Traverse subdirectories |
| `overwrite` | boolean | No | false | Overwrite existing files |
| `cleanForLLM` | boolean | No | false | Clean Markdown output for LLM consumption |
| `dryRun` | boolean | No | false | Generate a conversion plan without writing files |
| `include` | string[] | No | -- | Only convert files matching these glob patterns (e.g. `["report-*.md"]`) |
| `exclude` | string[] | No | -- | Skip files matching these glob patterns (e.g. `["draft-*"]`) |
| `maxConcurrency` | number | No | 1 | Max concurrent conversions (1-8). Useful for low-memory machines. |
| `continueOnError` | boolean | No | true | Continue processing other files when one fails |

**Dry run example:**

```json
{
  "inputDir": "docs/source",
  "outputDir": "docs/published",
  "from": "md",
  "to": "pdf",
  "dryRun": true
}
```

Returns a plan with `plannedCount` but does not write any files.

**Return structure:**

```json
{
  "success": true,
  "summary": "Batch conversion completed: 4 succeeded, 0 failed, 0 skipped.",
  "total": 4,
  "plannedCount": 4,
  "skippedCount": 0,
  "successCount": 4,
  "failedCount": 0,
  "durationMs": 1201,
  "results": [...]
}
```

## Usage Examples

### Run doctor

```
Tool: doctor
Args: {}
```

### Create `.document-converter.json`

```json
{
  "defaults": {
    "pdfEngine": "xelatex",
    "cjkMainFont": "Microsoft YaHei",
    "overwrite": false
  }
}
```

### Markdown to Chinese PDF using config

With `.document-converter.json` setting `pdfEngine: "xelatex"` and `cjkMainFont: "Microsoft YaHei"`:

```
Tool: markdown_to_pdf
Args: {
  "inputPath": "docs/chinese-report.md",
  "title": "季度报告",
  "toc": true,
  "pageSize": "A4",
  "preserveSource": true,
  "overwrite": true
}
```

### Markdown to PDF with `preserveSource`

```
Tool: markdown_to_pdf
Args: {
  "inputPath": "docs/report.md",
  "outputPath": "docs/report.pdf",
  "preserveSource": true,
  "overwrite": true
}
```

Generates `docs/report.pdf.source.md` and `docs/report.pdf.meta.json` for accurate recovery.

### PDF to Markdown using source sidecar

```
Tool: pdf_to_markdown
Args: {
  "inputPath": "docs/report.pdf",
  "preferSourceSidecar": true
}
```

Automatically finds and returns the original Markdown from the sidecar file.

### Markdown to HTML with GitHub theme

```
Tool: markdown_to_html
Args: {
  "inputPath": "docs/readme.md",
  "theme": "github",
  "standalone": true,
  "selfContained": true
}
```

### Batch convert with dry run

```
Tool: batch_convert
Args: {
  "inputDir": "docs/articles",
  "outputDir": "docs/html",
  "from": "md",
  "to": "html",
  "dryRun": true
}
```

### Batch convert with include/exclude

```
Tool: batch_convert
Args: {
  "inputDir": "docs/articles",
  "outputDir": "docs/published",
  "from": "md",
  "to": "pdf",
  "recursive": true,
  "include": ["report-*.md"],
  "exclude": ["draft-*", "internal-*"],
  "maxConcurrency": 2,
  "continueOnError": true,
  "overwrite": true
}
```

### DOCX to Markdown with image extraction

```
Tool: docx_to_markdown
Args: {
  "inputPath": "docs/presentation.docx",
  "extractImages": true,
  "imageDir": "docs/presentation_media",
  "overwrite": true
}
```

Returns `imageCount`, `imageDir`, and `images` array in the response.

## Security

This server implements strict security measures:

- **Workspace isolation**: All file access is confined to a configured workspace directory (`DOC_CONVERTER_WORKSPACE` env var)
- **Path traversal prevention**: `..` sequences and absolute path escapes are blocked
- **Sensitive file blocking**: `.env`, `.ssh/`, `.npmrc`, etc. are never accessible
- **File size limits**: Input files over 50 MB are rejected by default (configurable via config file)
- **No shell injection**: All commands use `spawn()` with argument arrays
- **No overwrite by default**: Existing files are protected unless explicitly allowed
- **Config file cannot bypass pathGuard**: Configuration defaults respect the same path safety rules as tool arguments

See `docs/security.md` for full details.

## Recommended Workflows

### Good

- **Markdown -> PDF** -- High-quality PDF output with Pandoc
- **Markdown -> DOCX** -- High-quality Word output
- **Markdown -> HTML** -- High-quality HTML output
- **DOCX -> Markdown** -- Good text extraction with image metadata
- **PDF -> Markdown** -- For text extraction only. Use `preferSourceSidecar: true` for PDFs generated by this server.

### Not recommended

- **Markdown -> PDF -> Markdown** for structure recovery
  - PDFs do not preserve Markdown semantics (headings, tables, code blocks, lists, reading order)
  - The round-trip will lose structural information
  - Use `preserveSource: true` instead when generating the PDF

## 推荐工作流

### 推荐

- **Markdown -> PDF** -- 高质量的 PDF 输出
- **Markdown -> DOCX** -- 高质量的 Word 输出
- **Markdown -> HTML** -- 高质量的 HTML 输出
- **DOCX -> Markdown** -- 良好的文本提取和图片元数据
- **PDF -> Markdown** -- 仅用于内容提取。对本服务生成的 PDF 请使用 `preferSourceSidecar: true` 精确恢复。

### 不推荐

- **Markdown -> PDF -> Markdown** 用于结构恢复
  - PDF 不保存 Markdown 语义（标题、表格、代码块、列表、阅读顺序）
  - 往返转换将丢失结构信息
  - 生成 PDF 时请使用 `preserveSource: true`

## Conversion Quality

> **This project focuses on AI-friendly document conversion, not pixel-perfect layout reconstruction.**

See `docs/conversion-quality.md` for format-specific quality notes and engine comparisons.

## Development

```bash
# Install dependencies
npm install

# Build TypeScript
npm run build

# Run in development mode (hot reload)
npm run dev

# Type check without emitting
npm run typecheck
```

## License

MIT
