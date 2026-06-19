# Security Guidelines

## Design Principles

This MCP server follows a **local-first, zero-trust** security model. All file paths are validated before any external command is executed.

## Path Security (`pathGuard`)

- **Workspace isolation**: All input and output paths must reside within the configured workspace directory (`DOC_CONVERTER_WORKSPACE` env var, or `cwd` by default).
- **Path traversal prevention**: Resolved paths are checked to ensure they don't escape the workspace via `..` sequences.
- **Sensitive file blocking**: Access to files like `.env`, `.ssh/id_rsa`, `.npmrc`, `.git/config`, etc. is explicitly denied.
- **File size limit**: Input files exceeding 50 MB are rejected by default (configurable via `DOC_CONVERTER_MAX_FILE_SIZE`).

## Command Execution (`commandRunner`)

- **No shell injection**: All external commands use `spawn(command, args)` with argument arrays. No `exec()` or string concatenation is used.
- **Timeout enforcement**: Every command has a configurable timeout (default 60 seconds) to prevent hung processes.
- **Structured errors**: Command failures return structured error objects with stdout, stderr, and exit codes — never raw shell output.

## Output Protection

- **No overwrite by default**: Existing output files are never overwritten unless `overwrite: true` is explicitly passed.
- **Workspace-bound output**: Output paths are validated to ensure they stay within the workspace directory.

## What Is NOT Implemented

- No arbitrary command execution tool is exposed.
- No file upload or network access.
- No OCR functionality (would require external services).
