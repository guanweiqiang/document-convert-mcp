/**
 * Detect file type from extension.
 * Returns a lowercase extension without the dot, or "unknown".
 */
export function detectFileType(filePath: string): string {
  const ext = filePath.split(".").pop()?.toLowerCase() ?? "";
  switch (ext) {
    case "md":
    case "markdown":
      return "markdown";
    case "pdf":
      return "pdf";
    case "docx":
      return "docx";
    case "html":
    case "htm":
      return "html";
    case "doc":
      return "doc";
    default:
      return ext || "unknown";
  }
}

/** Map file type to pandoc format name. */
export function fileTypeToFormat(fileType: string): string {
  switch (fileType) {
    case "markdown":
      return "markdown";
    case "pdf":
      return "pdf";
    case "docx":
      return "docx";
    case "html":
      return "html";
    default:
      return fileType;
  }
}
