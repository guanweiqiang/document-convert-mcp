# Installation Guide

## Prerequisites

- **Node.js** >= 18.0.0
- **npm** or **yarn**
- **Pandoc** >= 3.0 (see below)
- **Python 3** >= 3.8 (optional, for MarkItDown)

## Step 1: Install Pandoc

Pandoc is the primary conversion engine. Install it from the official site:

**macOS:**
```bash
brew install pandoc
```

**Ubuntu/Debian:**
```bash
sudo apt-get update
sudo apt-get install -y pandoc
```

**Windows:**
Download the installer from https://pandoc.org/installing.html

Verify installation:
```bash
pandoc --version
```

## Step 2: Install MarkItDown (optional)

MarkItDown provides better PDF-to-Markdown extraction.

```bash
pip install markitdown
```

Verify installation:
```bash
python3 -c "import markitdown; print('ok')"
```

## Step 3: Install the MCP Server

```bash
git clone <repository-url>
cd document-converter-mcp
npm install
npm run build
```

## Step 4: Configure Your MCP Client

Copy `examples/claude-desktop-config.json` and adjust the paths to match your environment.

See `docs/tool-schema.md` for the full tool reference.
