# Roadmap

## v1.0 (Current)

- [x] `markdown_to_pdf` — Pandoc-based
- [x] `markdown_to_docx` — Pandoc-based
- [x] `docx_to_markdown` — Pandoc + MarkItDown
- [x] `pdf_to_markdown` — MarkItDown (primary) + Pandoc (fallback)
- [x] `markdown_to_html` — Pandoc-based
- [x] `batch_convert` — Directory-level batch processing
- [x] Path security (`pathGuard`)
- [x] Safe command execution (`commandRunner`)
- [x] Dependency detection (`dependencyCheck`)
- [x] Structured logging (`logger`)
- [x] LLM-friendly Markdown cleanup (`cleanForLLM`)

## v1.1 (Planned)

- [ ] Custom CSS/theme support for PDF output
- [ ] Image extraction improvements for DOCX → Markdown
- [ ] Additional formats: RTF, ODT, EPUB
- [ ] Progress callbacks for batch operations
- [ ] Configuration file support (`.document-converter.json`)

## v2.0 (Future)

- [ ] Streamable HTTP transport (in addition to stdio)
- [ ] Resource URIs for converted documents
- [ ] Prompt templates for common conversion workflows
- [ ] Plugin system for custom converters
