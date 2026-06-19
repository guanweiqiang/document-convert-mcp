#!/usr/bin/env node
/**
 * Entry point for document-converter-mcp.
 * Starts the MCP server over stdio transport.
 */

export { createServer } from "./server.js";

// When run directly, start the server
import("./server.js").then(({ main }) => main().catch((err) => {
  process.stderr.write("Failed to start server: " + err.message + "\n");
  process.exit(1);
}));
