# document-converter-mcp

A local-first MCP server for converting documents between Markdown, PDF, DOCX, and HTML, with AI-friendly Markdown output and safe file access.

> **English**: This project focuses on AI-friendly document conversion, not pixel-perfect layout reconstruction.
>
> **中文**: 本项目重点是 AI 友好的文档转换，而不是像素级版式还原。

## Features

- **6 conversion tools**: Markdown ↔ PDF, Markdown ↔ DOCX, Markdown ↔ HTML, PDF → Markdown
- **Dual engine support**: Pandoc (primary) + MarkItDown (enhanced PDF/DOCX extraction)
- **Safe file access**: Workspace-isolated path validation, sensitive file blocking, no-overwrite-by-default
- **Secure command execution**: Spawn-based, no shell injection, structured errors with timeouts
- **AI-friendly output**: Optional `cleanForLLM` flag for cleaner Markdown
- **Batch processing**: Convert entire directories with per-file error tolerance
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

#### PDF Engine (required for Markdown → PDF)

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

### Install MarkItDown (optional, recommended for PDF → Markdown)

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
> # For all optional converters (PDF, EPUB, HTML, etc.):
> python -m pip install -U "markitdown[all]"
> ```
>
> `markitdown` exists does not guarantee PDF support is installed.

### Install the Server

```bash
git clone https://github.com/your-org/document-converter-mcp.git
cd document-converter-mcp
npm install
npm run build
```

## MCP Client Configuration

### Claude Desktop

Edit your Claude Desktop config (`~/Library/Application Support/Claude/claude_desktop_config.json` on macOS, or `%APPDATA%\Claude\claude_desktop_config.json` on Windows):

```json
{
  "mcpServers": {
    "document-converter": {
      "command": "node",
      "args": [
        "/absolute/path/to/document-converter-mcp/dist/index.js"
      ],
      "env": {
        "DOC_CONVERTER_WORKSPACE": "/absolute/path/to/your/documents"
      }
    }
  }
}
```

A sample config is provided in `examples/claude-desktop-config.json`.

## Tools

### 1. `markdown_to_pdf`

Convert Markdown to PDF using Pandoc.

> **Note**: Pandoc requires an external PDF engine (LaTeX distribution or alternative) to generate PDFs. See [Installation](#prerequisites) for setup instructions.
>
> **中文文档**：`pdflatex` 不支持中文 Unicode 字符。中文 Markdown 转 PDF 请使用 `pdfEngine: "xelatex"`（推荐）或 `lualatex`。

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `inputPath` | string | Yes | — | Input Markdown file path |
| `outputPath` | string | No | Auto-derived | Output PDF path |
| `title` | string | No | — | PDF document title |
| `toc` | boolean | No | false | Include table of contents |
| `pageSize` | enum | No | A4 | Page size: `A4` or `Letter` |
| `theme` | enum | No | default | Theme: `default`, `github`, `academic` |
| `pdfEngine` | enum | No | Pandoc default | PDF engine: `pdflatex`, `xelatex`, `lualatex`, `wkhtmltopdf`, `weasyprint`, `typst`. Leave unset to let Pandoc choose. |
| `cjkMainFont` | string | No | — | CJK main font name for Chinese/Japanese/Korean documents (e.g. `"Microsoft YaHei"`, `"SimSun"`, `"Noto Sans CJK SC"`). Passed as `-V CJKmainfont:<font>`. |
| `preserveSource` | boolean | No | false | Save original Markdown as sidecar files (`sample.pdf.source.md`, `sample.pdf.meta.json`) for accurate PDF-to-Markdown recovery. |
| `strictMarkdown` | boolean | No | false | Reject input if Markdown has structural issues like unclosed code blocks. |
| `overwrite` | boolean | No | false | Allow overwriting existing files |

### 2. `markdown_to_docx`

Convert Markdown to DOCX using Pandoc.

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `inputPath` | string | Yes | — | Input Markdown file path |
| `outputPath` | string | No | Auto-derived | Output DOCX path |
| `referenceDocx` | string | No | — | Word template file |
| `toc` | boolean | No | false | Include table of contents. Note: when converting back to Markdown, the TOC may appear as plain content. |
| `strictMarkdown` | boolean | No | false | Reject input if Markdown has structural issues like unclosed code blocks. |
| `overwrite` | boolean | No | false | Allow overwriting existing files |

### 3. `docx_to_markdown`

Convert DOCX to Markdown using Pandoc or MarkItDown.

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `inputPath` | string | Yes | — | Input DOCX file path |
| `outputPath` | string | No | Auto-derived | Output Markdown path |
| `extractImages` | boolean | No | false | Extract embedded images |
| `imageDir` | string | No | — | Directory for extracted images |
| `engine` | enum | No | pandoc | Engine: `pandoc` or `markitdown` |
| `markdownFlavor` | enum | No | gfm | Markdown dialect: `gfm` (GitHub Flavored), `commonmark`, or `pandoc` |
| `cleanForLLM` | boolean | No | false | Clean Markdown for AI consumption |
| `overwrite` | boolean | No | false | Allow overwriting existing files |

### 4. `pdf_to_markdown`

Extract text from PDF to Markdown.

> **Warning**: This is content extraction, not layout reconstruction. Scanned PDFs, complex tables, two-column papers, and mathematical formulas may not convert reliably. For scanned PDFs, OCR is required (not included).
>
> **PDF → Markdown is content extraction, not layout or semantic structure reconstruction.**
>
> **PDF 转 Markdown 是内容提取，不是版式或语义结构还原。**
>
> **普通 PDF 通常不保存 Markdown 语义。**
>
> **标题、表格、代码块、列表、阅读顺序都可能无法可靠恢复。**
>
> **MarkItDown PDF support**: By default `pip install markitdown` installs only core text/DOCX support. PDF extraction requires the optional `[pdf]` extra.
>
> **Sidecar recovery**: If the PDF was generated by this server with `preserveSource: true`, the original Markdown is available as a sidecar file. The default `preferSourceSidecar: true` will automatically find and return it.

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `inputPath` | string | Yes | — | Input PDF file path |
| `outputPath` | string | No | Auto-derived | Output Markdown path |
| `engine` | enum | No | markitdown | Engine: `markitdown` or `pandoc` |
| `cleanForLLM` | boolean | No | false | Clean Markdown for AI consumption |
| `preferSourceSidecar` | boolean | No | true | First check for a `.source.md` sidecar file. If found, return original Markdown instead of extracting PDF text. |
| `overwrite` | boolean | No | false | Allow overwriting existing files |

### 5. `markdown_to_html`

Convert Markdown to HTML using Pandoc.

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `inputPath` | string | Yes | — | Input Markdown file path |
| `outputPath` | string | No | Auto-derived | Output HTML path |
| `cssPath` | string | No | — | External CSS file path |
| `standalone` | boolean | No | true | Generate complete HTML document |
| `strictMarkdown` | boolean | No | false | Reject input if Markdown has structural issues like unclosed code blocks. |
| `overwrite` | boolean | No | false | Allow overwriting existing files |

### 6. `batch_convert`

Convert all matching files in a directory.

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `inputDir` | string | Yes | — | Source directory |
| `outputDir` | string | Yes | — | Destination directory |
| `from` | enum | Yes | — | Source format: `md`, `markdown`, `docx`, `pdf` |
| `to` | enum | Yes | — | Target format: `md`, `markdown`, `docx`, `pdf`, `html` |
| `recursive` | boolean | No | false | Traverse subdirectories |
| `overwrite` | boolean | No | false | Overwrite existing files |
| `cleanForLLM` | boolean | No | false | Clean Markdown for AI consumption |

## Usage Examples

### Convert a single Markdown file to PDF

```
Tool: markdown_to_pdf
Args: {
  "inputPath": "reports/quarterly.md",
  "toc": true,
  "pageSize": "Letter"
}
```

### Convert Markdown to PDF with xelatex (for Chinese documents)

> **pdflatex 不适合中文文档**，会报 `LaTeX Error: Unicode character not set up for use with LaTeX`。
> 中文 Markdown 转 PDF 推荐使用 `xelatex`，并指定 CJK 字体。
>
> - **Windows**: `cjkMainFont: "Microsoft YaHei"` 或 `"SimSun"` 或 `"SimHei"`
> - **macOS**: `cjkMainFont: "Songti SC"` 或 `"Heiti SC"`
> - **Linux**: `cjkMainFont: "Noto Sans CJK SC"` (需安装 fonts-noto-cjk 包)
>
> For Chinese Markdown documents, use `pdfEngine='xelatex'` and set `cjkMainFont`.
> On Windows, recommended fonts are Microsoft YaHei, SimSun, or SimHei.

```
Tool: markdown_to_pdf
Args: {
  "inputPath": "sample.md",
  "outputPath": "sample.pdf",
  "toc": true,
  "pageSize": "A4",
  "pdfEngine": "xelatex",
  "cjkMainFont": "Microsoft YaHei",
  "preserveSource": true,
  "overwrite": true
}
```

### Extract text from a PDF for AI analysis

```
Tool: pdf_to_markdown
Args: {
  "inputPath": "papers/research.pdf",
  "engine": "markitdown",
  "cleanForLLM": true
}
```

### Batch convert all Markdown files to PDF

```
Tool: batch_convert
Args: {
  "inputDir": "docs/source",
  "outputDir": "docs/published",
  "from": "md",
  "to": "pdf",
  "recursive": true,
  "overwrite": true
}
```

## Security

This server implements strict security measures:

- **Workspace isolation**: All file access is confined to a configured workspace directory
- **Path traversal prevention**: `..` sequences and absolute path escapes are blocked
- **Sensitive file blocking**: `.env`, `.ssh/`, `.npmrc`, etc. are never accessible
- **File size limits**: Input files over 50 MB are rejected by default
- **No shell injection**: All commands use `spawn()` with argument arrays
- **No overwrite by default**: Existing files are protected unless explicitly allowed

See `docs/security.md` for full details.

## Recommended Workflows

### Good

- **Markdown → PDF** — High-quality PDF output with Pandoc
- **Markdown → DOCX** — High-quality Word output
- **Markdown → HTML** — High-quality HTML output
- **DOCX → Markdown** — Good text extraction
- **PDF → Markdown** — For text extraction only. See [Conversion Quality](#conversion-quality) for limitations.

### Not recommended

- **Markdown → PDF → Markdown** for structure recovery
  - PDFs do not preserve Markdown semantics (headings, tables, code blocks, lists, reading order)
  - The round-trip will lose structural information

### Accurate recovery from PDF

If you need to recover the original Markdown from a PDF generated by this server, use `preserveSource: true` when calling `markdown_to_pdf`:

```json
{
  "inputPath": "sample.md",
  "outputPath": "sample.pdf",
  "preserveSource": true,
  "overwrite": true
}
```

This generates sidecar files (`sample.pdf.source.md`, `sample.pdf.meta.json`). Then when calling `pdf_to_markdown`, the default `preferSourceSidecar: true` will automatically find and return the original Markdown.

## 推荐工作流

### 推荐

- **Markdown → PDF** — 高质量的 PDF 输出
- **Markdown → DOCX** — 高质量的 Word 输出
- **Markdown → HTML** — 高质量的 HTML 输出
- **DOCX → Markdown** — 良好的文本提取
- **PDF → Markdown** — 仅用于内容提取。有关限制请参见 [Conversion Quality](#conversion-quality) 部分。

### 不推荐

- **Markdown → PDF → Markdown** 用于结构恢复
  - PDF 不保存 Markdown 语义（标题、表格、代码块、列表、阅读顺序）
  - 往返转换将丢失结构信息

### 从 PDF 精确恢复

如果需要从本工具生成的 PDF 恢复原始 Markdown，请在生成 PDF 时启用 `preserveSource: true`：

```json
{
  "inputPath": "sample.md",
  "outputPath": "sample.pdf",
  "preserveSource": true,
  "overwrite": true
}
```

这将生成 sidecar 文件（`sample.pdf.source.md`, `sample.pdf.meta.json`）。然后在调用 `pdf_to_markdown` 时，默认的 `preferSourceSidecar: true` 会自动查找并返回原始 Markdown。

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
