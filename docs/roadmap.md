# Roadmap

## v0.1.0 — Initial Release

**Status: Released**

**Positioning:** Basic conversion capabilities available.

### Tools

- `markdown_to_pdf` — Markdown to PDF using Pandoc
- `markdown_to_docx` — Markdown to DOCX using Pandoc
- `markdown_to_html` — Markdown to HTML using Pandoc
- `docx_to_markdown` — DOCX to Markdown using Pandoc or MarkItDown
- `pdf_to_markdown` — PDF text extraction using MarkItDown or Pandoc
- `batch_convert` — Directory-level batch conversion

### Safety & Structure

- Workspace path isolation
- Path traversal protection
- Sensitive file blocking
- No-overwrite-by-default
- Structured JSON responses

### Configuration

- `cleanForLLM` — AI-friendly Markdown cleanup
- `pdfEngine` — Selectable PDF engine
- `cjkMainFont` — CJK font support
- `preserveSource` — Sidecar file generation for PDF recovery
- `preferSourceSidecar` — Automatic sidecar detection in `pdf_to_markdown`

---

## v0.2.0 — Usability & Diagnostics

**Status: Released**

**Positioning:** Make local conversions easier to diagnose and better suited for real-world batch usage.

### Environment Diagnostics

- Add `doctor` tool
  - Check Node.js version
  - Check workspace existence and writability
  - Check Pandoc availability and version
  - Check Python availability
  - Check MarkItDown availability
  - Check MarkItDown PDF support
  - Check available PDF engines:
    - `pdflatex`
    - `xelatex`
    - `lualatex`
    - `wkhtmltopdf`
    - `weasyprint`
    - `typst`
  - Provide recommendations for Chinese/CJK PDF generation

### Configuration File Support

- Add optional `.document-converter.json`
- Support defaults for:
  - `pdfEngine`
  - `cjkMainFont`
  - `pageSize`
  - `theme`
  - `cleanForLLM`
  - `overwrite`
- Support batch defaults:
  - `maxConcurrency`
  - `continueOnError`
- Define precedence clearly:

```
tool args > .document-converter.json > built-in defaults
```

### Batch Conversion Improvements

- Add `dryRun` — plan without executing
- Add `include` — glob-based file filtering
- Add `exclude` — glob-based exclusions
- Add `maxConcurrency` — parallel conversion control
- Add `continueOnError` — skip failures and continue
- Add better batch result summary:
  - `plannedCount`
  - `skippedCount`
  - `successCount`
  - `failedCount`
  - `durationMs`

### PDF Output Improvements

Enhance `markdown_to_pdf` with:

- `margin` — page margin control
- `numberSections` — numbered section headings
- `highlightStyle` — code highlight theme
- `metadata` — custom document metadata

Keep existing behavior compatible:

- `pdfEngine`
- `cjkMainFont`
- `preserveSource`
- `strictMarkdown`
- `overwrite`

### HTML Output Improvements

Enhance `markdown_to_html` with:

- `theme` — output theme selection
- `embedCss` — inline CSS into HTML
- `selfContained` — single-file HTML output
- `highlightStyle` — code highlight theme

Keep existing behavior compatible:

- `cssPath`
- `standalone`
- `strictMarkdown`
- `overwrite`

### DOCX Image Extraction Improvements

Improve `docx_to_markdown` image extraction:

- Stable image output directory
- Safe image file names
- Relative Markdown image links
- Return image extraction metadata:
  - `imageCount`
  - `imageDir`
  - `images`

### Documentation and Tests

- Update README -- Done
- Update tool schema docs -- Done
- Update conversion quality docs
- Add release notes for v0.2.0 -- Done
- Add MCP JSON tests for:
  - `doctor` tool -- Done
  - config loading -- Done
  - batch dry run -- Done
  - batch include/exclude -- Done
  - PDF style options -- Done
  - HTML style options -- Done
  - DOCX image extraction -- Done
  - PDF sidecar roundtrip -- Done

---

## v0.3.0 — More Formats

**Status: Planned**

**Positioning:** Expand document format support while maintaining stability-first approach.

### Candidate Features

1. HTML → Markdown
2. EPUB → Markdown
3. Markdown → EPUB
4. ODT → Markdown
5. Markdown → ODT
6. RTF → Markdown

### Guidelines

- Do not sacrifice conversion quality for format count.
- Every new format must have clear quality notes.
- Unsupported or unstable formats must return explicit warnings.

---

## v0.4.0 — PDF Extraction Improvements

**Status: Planned**

**Positioning:** Improve credibility and interpretability of PDF → Markdown extraction.

### Candidate Features

- PDF page range extraction:
  - `pages`
  - `startPage`
  - `endPage`
- Better PDF quality report
- Scanned PDF detection
- Two-column PDF warning
- Table extraction warnings
- Optional OCR integration
- Optional Tesseract support
- Better failure messages for image-only PDFs

### Guidelines

- OCR must NOT be enabled by default.
- OCR dependencies must be explicitly installed by the user.
- Continue emphasizing: PDF → Markdown is content extraction, not layout restoration.

---

## v0.5.0 — MCP Workflow Experience

**Status: Planned**

**Positioning:** Improve usability within MCP clients.

### Candidate Features

- Resource URI support for converted documents
- List recent converted files
- Preview converted Markdown/HTML output
- Prompt templates for common workflows
- Workflow helpers:
  - `convert_for_llm`
  - `extract_for_summary`
  - `prepare_pdf_report`
- Better structured error codes
- Better warnings for unsupported workflows

---

## v1.0.0 — Stable Release

**Status: Future Stable**

**Positioning:** Stable API and long-term maintainable version.

### Release Criteria

- Tool schemas are stable
- Backward compatibility policy is documented
- README is complete
- Security documentation is complete
- Conversion quality documentation is complete
- Windows/macOS/Linux usage notes are complete
- Common workflows are tested
- MCP JSON tests cover all core tools
- Error codes are documented
- Release notes are complete
