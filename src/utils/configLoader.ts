import fs from "fs";
import path from "path";

export interface ConfigDefaults {
  pdfEngine?: string;
  cjkMainFont?: string;
  pageSize?: string;
  theme?: string;
  cleanForLLM?: boolean;
  overwrite?: boolean;
  toc?: boolean;
  title?: string;
  preserveSource?: boolean;
  numberSections?: boolean;
  highlightStyle?: string;
  margin?: string;
  metadata?: Record<string, string>;
}

export interface ConfigBatch {
  maxConcurrency?: number;
  continueOnError?: boolean;
}

export interface ConfigSecurity {
  maxFileSizeMB?: number;
}

export interface AppConfig {
  defaults?: ConfigDefaults;
  batch?: ConfigBatch;
  security?: ConfigSecurity;
}

const CONFIG_FILE_NAME = ".document-converter.json";

/**
 * Load the project config file from the workspace root.
 * Returns undefined if the file does not exist or is invalid JSON.
 */
export function loadConfig(workspaceDir: string): AppConfig | undefined {
  const configPath = path.join(workspaceDir, CONFIG_FILE_NAME);
  try {
    if (!fs.existsSync(configPath)) {
      return undefined;
    }
    let raw = fs.readFileSync(configPath, "utf-8");
    // Strip BOM if present (Node.js JSON.parse does not handle BOM)
    if (raw.charCodeAt(0) === 0xFEFF) {
      raw = raw.slice(1);
    }
    const parsed = JSON.parse(raw) as AppConfig;
    return parsed;
  } catch {
    return undefined;
  }
}

/**
 * Merge tool arguments with config defaults for markdown_to_pdf.
 * Tool args take priority over config, config fills in gaps.
 */
export function mergePdfParamsWithConfig(
  args: {
    inputPath: string;
    outputPath?: string;
    title?: string;
    toc?: boolean;
    pageSize?: string;
    theme?: string;
    pdfEngine?: string;
    cjkMainFont?: string;
    preserveSource?: boolean;
    overwrite?: boolean;
    strictMarkdown?: boolean;
    margin?: string;
    highlightStyle?: string;
    numberSections?: boolean;
    metadata?: Record<string, string>;
  },
  config: AppConfig | undefined,
): typeof args {
  const cfg = config?.defaults;
  if (!cfg) return args;

  return {
    ...args,
    pdfEngine: args.pdfEngine ?? cfg.pdfEngine,
    cjkMainFont: args.cjkMainFont ?? cfg.cjkMainFont,
    pageSize: args.pageSize ?? cfg.pageSize,
    theme: args.theme ?? cfg.theme,
    overwrite: args.overwrite ?? cfg.overwrite,
    toc: args.toc ?? cfg.toc,
    title: args.title ?? cfg.title,
    preserveSource: args.preserveSource ?? cfg.preserveSource,
    numberSections: args.numberSections ?? cfg.numberSections,
    highlightStyle: args.highlightStyle ?? cfg.highlightStyle,
    margin: args.margin ?? cfg.margin,
    metadata: args.metadata ?? cfg.metadata,
  };
}
