# Tool Schema Reference

## 0. `doctor`

Check the local environment for document-converter-mcp dependencies.

This tool takes no arguments. It never fails due to missing dependencies -- missing tools appear as `false` in the output with warnings.

**Output:**

```json
{
  "success": true,
  "summary": "Environment check completed.",
  "data": {
    "node": { "available": true, "version": "v22.18.0" },
    "workspace": { "path": "/workspace", "exists": true, "writable": true },
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

## 1. `markdown_to_pdf`

Convert a Markdown file to PDF.

> **Note**: Pandoc requires an external PDF engine (LaTeX distribution or alternative) to generate PDFs.
>
> **中文文档**：`pdflatex` 不支持中文 Unicode 字符。中文 Markdown 转 PDF 请使用 `pdfEngine: "xelatex"`（推荐）并设置 `cjkMainFont`。

**Input:**

```json
{
  "inputPath": "string (required)",
  "outputPath": "string (optional, auto-derived)",
  "title": "string (optional)",
  "toc": "boolean (optional, default false)",
  "pageSize": "'A4' | 'Letter' (optional, default 'A4')",
  "theme": "'default' | 'github' | 'academic' (optional, default 'default')",
  "pdfEngine": "'pdflatex' | 'xelatex' | 'lualatex' | 'wkhtmltopdf' | 'weasyprint' | 'typst' (optional)",
  "cjkMainFont": "string (optional) -- CJK main font for xelatex, e.g. 'Microsoft YaHei', 'SimSun', 'Noto Sans CJK SC'",
  "preserveSource": "boolean (optional, default false) -- Save original Markdown as sidecar files for accurate PDF-to-Markdown recovery",
  "strictMarkdown": "boolean (optional, default false)",
  "overwrite": "boolean (optional, default false)",
  "margin": "string (optional) -- Page margin in safe format, e.g. '1in', '2cm', '20mm', '72pt'",
  "numberSections": "boolean (optional, default false) -- Number section headings",
  "highlightStyle": "string (optional) -- Code highlight theme: default, tango, pygments, kate, monochrome, github, darkblue, emacs, friendly, fruity, native, trac, borland",
  "metadata": "object (optional) -- Additional metadata key-value pairs"
}
```

**Output:**

```json
{
  "success": true,
  "input": "document.md",
  "output": "document.pdf",
  "engine": "pandoc",
  "warnings": [],
  "details": { "exitCode": 0 }
}
```

**Sidecar files** (when `preserveSource=true`):

- `document.pdf.source.md` -- Original Markdown content
- `document.pdf.meta.json` -- Conversion metadata

## 2. `markdown_to_docx`

Convert a Markdown file to DOCX.

**Input:**

```json
{
  "inputPath": "string (required)",
  "outputPath": "string (optional, auto-derived)",
  "referenceDocx": "string (optional)",
  "toc": "boolean (optional, default false)",
  "strictMarkdown": "boolean (optional, default false)",
  "overwrite": "boolean (optional, default false)"
}
```

## 3. `docx_to_markdown`

Convert a DOCX file to Markdown.

**Input:**

```json
{
  "inputPath": "string (required)",
  "outputPath": "string (optional, auto-derived)",
  "extractImages": "boolean (optional, default false)",
  "imageDir": "string (optional) -- Directory for extracted images. If omitted, defaults to '${outputBasename}_media'. Must be within workspace.",
  "engine": "'pandoc' | 'markitdown' (optional, default 'pandoc')",
  "markdownFlavor": "'gfm' | 'commonmark' | 'pandoc' (optional, default 'gfm')",
  "cleanForLLM": "boolean (optional, default false)",
  "overwrite": "boolean (optional, default false)"
}
```

**Output with image metadata** (when `extractImages=true`):

```json
{
  "success": true,
  "input": "document.docx",
  "output": "document.md",
  "engine": "pandoc",
  "imageCount": 2,
  "imageDir": "out/document_media",
  "images": [
    { "filename": "media/image1.png", "sizeBytes": 12345 },
    { "filename": "media/image2.jpg", "sizeBytes": 67890 }
  ],
  "warnings": [],
  "details": { "exitCode": 0 }
}
```

Even when no images are found:

```json
{
  "imageCount": 0,
  "imageDir": "out/document_media",
  "images": []
}
```

**Path safety:** `imageDir` is validated against path traversal. Values escaping the workspace (e.g. `../outside-media`) are rejected with an error containing "Access denied" and "workspace".

## 4. `pdf_to_markdown`

Extract text from a PDF to Markdown.

> **Warning**: PDF to Markdown is **content extraction**, not layout or semantic structure reconstruction.
> PDF files usually do not preserve Markdown semantics.
> Tables, headings, code blocks, lists, and reading order may not be reliably recovered.
>
> **PDF 转 Markdown 是内容提取，不是版式或语义结构还原。**
> 普通 PDF 通常不保存 Markdown 语义。
> 标题、表格、代码块、列表、阅读顺序都可能无法可靠恢复。

**Input:**

```json
{
  "inputPath": "string (required)",
  "outputPath": "string (optional, auto-derived)",
  "engine": "'markitdown' | 'pandoc' (optional, default 'markitdown')",
  "cleanForLLM": "boolean (optional, default false)",
  "preferSourceSidecar": "boolean (optional, default true) -- First check for a .source.md sidecar file. If found, return original Markdown instead of extracting PDF text.",
  "overwrite": "boolean (optional, default false)"
}
```

**Output with quality report** (plain text extraction):

```json
{
  "success": true,
  "input": "document.pdf",
  "output": "document.md",
  "engine": "markitdown",
  "warnings": ["PDF to Markdown is content extraction..."],
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

**Output with sidecar recovery** (when PDF was generated with `preserveSource: true`):

```json
{
  "success": true,
  "input": "document.pdf",
  "output": "document.md",
  "engine": "markitdown",
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

## 5. `markdown_to_html`

Convert a Markdown file to HTML.

**Input:**

```json
{
  "inputPath": "string (required)",
  "outputPath": "string (optional, auto-derived)",
  "cssPath": "string (optional) -- External CSS file path (validated via workspace pathGuard)",
  "standalone": "boolean (optional, default true)",
  "strictMarkdown": "boolean (optional, default false)",
  "overwrite": "boolean (optional, default false)",
  "theme": "string (optional) -- Pandoc HTML theme: default, github, academic, monochrome, bookish, mangoe, slaper, quarto",
  "embedCss": "boolean (optional, default false) -- Embed CSS and resources into the HTML",
  "selfContained": "boolean (optional, default false) -- Generate a self-contained single-file HTML",
  "highlightStyle": "string (optional) -- Code highlight theme: default, tango, pygments, kate, monochrome, github, darkblue, emacs, friendly, fruity, native, trac, borland"
}
```

## 6. `batch_convert`

Convert all matching files in a directory.

**Input:**

```json
{
  "inputDir": "string (required)",
  "outputDir": "string (required)",
  "from": "'md' | 'markdown' | 'docx' | 'pdf' (required)",
  "to": "'md' | 'markdown' | 'docx' | 'pdf' | 'html' (required)",
  "recursive": "boolean (optional, default false)",
  "overwrite": "boolean (optional, default false)",
  "cleanForLLM": "boolean (optional, default false)",
  "dryRun": "boolean (optional, default false) -- Generate plan without writing files",
  "include": "string[] (optional) -- Glob patterns to include files, e.g. ['report-*.md']",
  "exclude": "string[] (optional) -- Glob patterns to exclude files, e.g. ['draft-*']",
  "maxConcurrency": "number (optional, default 1, range 1-8) -- Max concurrent conversions",
  "continueOnError": "boolean (optional, default true) -- Continue processing when individual files fail"
}
```

**Output:**

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
  "results": [
    { "success": true, "input": "a.md", "output": "a.pdf", "engine": "pandoc", "warnings": [] },
    { "success": false, "input": "b.md", "output": "b.pdf", "engine": "pandoc", "error": "..." }
  ]
}
```

**Dry run** (`dryRun=true`) returns the same structure with `status: "planned"` for each file but does not write any files.
