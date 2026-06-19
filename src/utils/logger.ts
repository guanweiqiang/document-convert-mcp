/**
 * Logger utility for structured console output.
 * All log lines include a timestamp and the server name for easy identification.
 */

import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const pkg = require('../../package.json');

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
}

const LEVEL_LABEL: Record<LogLevel, string> = {
  [LogLevel.DEBUG]: "DEBUG",
  [LogLevel.INFO]: "INFO",
  [LogLevel.WARN]: "WARN",
  [LogLevel.ERROR]: "ERROR",
};

const SERVER_NAME = pkg.name;
const SERVER_VERSION = pkg.version;

class Logger {
  private level: LogLevel;

  constructor(level: LogLevel = LogLevel.INFO) {
    this.level = level;
  }

  /** Set log level from environment variable or string. */
  static fromEnv(): LogLevel {
    const env = process.env.DOC_CONVERTER_LOG_LEVEL?.toLowerCase();
    switch (env) {
      case "debug": return LogLevel.DEBUG;
      case "warn": return LogLevel.WARN;
      case "error": return LogLevel.ERROR;
      case "info":
      default: return LogLevel.INFO;
    }
  }

  debug(...args: unknown[]): void {
    if (this.level <= LogLevel.DEBUG) this.log(LogLevel.DEBUG, ...args);
  }

  info(...args: unknown[]): void {
    if (this.level <= LogLevel.INFO) this.log(LogLevel.INFO, ...args);
  }

  warn(...args: unknown[]): void {
    if (this.level <= LogLevel.WARN) this.log(LogLevel.WARN, ...args);
  }

  error(...args: unknown[]): void {
    this.log(LogLevel.ERROR, ...args);
  }

  private log(level: LogLevel, ...args: unknown[]): void {
    const ts = new Date().toISOString();
    const prefix = `[${ts}] [${SERVER_NAME}@${SERVER_VERSION}] [${LEVEL_LABEL[level]}]`;
    const msg = `${prefix} ${args.map((a) => String(a)).join(" ")}`;
    if (level === LogLevel.ERROR) {
      process.stderr.write(msg + "\n");
    } else {
      process.stdout.write(msg + "\n");
    }
  }
}

export const logger = new Logger(Logger.fromEnv());
