/**
 * openclaw-superpack: Diagnostic logger
 *
 * Used by overlay files to emit flag-gated diagnostic output.
 * Writes to stderr so it never pollutes agent responses.
 */

import { createHash } from "node:crypto";
import { flag, type FlagName } from "./flags.js";

const GRAY = "\x1b[90m";
const CYAN = "\x1b[36m";
const YELLOW = "\x1b[33m";
const GREEN = "\x1b[32m";
const RED = "\x1b[31m";
const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";
const DIM = "\x1b[2m";

function ts(): string {
  return new Date().toISOString().slice(11, 23);
}

function write(color: string, label: string, msg: string): void {
  process.stderr.write(
    `${GRAY}${ts()}${RESET} ${color}${BOLD}[superpack:${label}]${RESET} ${msg}\n`,
  );
}

/**
 * Emit a diagnostic message if the given flag is active.
 */
export function diag(f: FlagName, label: string, msg: string): void {
  if (!flag(f)) return;
  write(CYAN, label, msg);
}

/**
 * Emit a diagnostic warning (always shown if flag active).
 */
export function diagWarn(f: FlagName, label: string, msg: string): void {
  if (!flag(f)) return;
  write(YELLOW, label, `⚠ ${msg}`);
}

/**
 * Emit a diagnostic error (always shown if flag active).
 */
export function diagError(f: FlagName, label: string, msg: string): void {
  if (!flag(f)) return;
  write(RED, label, `✖ ${msg}`);
}

/**
 * Dump a large block of text (e.g. system prompt) with header/footer markers.
 */
export function diagDump(f: FlagName, label: string, title: string, content: string): void {
  if (!flag(f)) return;
  const hash = createHash("sha256").update(content).digest("hex").slice(0, 12);
  const lines = content.split("\n").length;
  const bytes = Buffer.byteLength(content, "utf-8");
  const header = `${CYAN}${BOLD}[superpack:${label}]${RESET} ${GREEN}▼ ${title}${RESET} ${DIM}(${lines} lines, ${bytes} bytes, sha256:${hash})${RESET}`;
  const footer = `${CYAN}${BOLD}[superpack:${label}]${RESET} ${GREEN}▲ end ${title}${RESET}`;
  process.stderr.write(`${GRAY}${ts()}${RESET} ${header}\n`);
  process.stderr.write(content);
  if (!content.endsWith("\n")) process.stderr.write("\n");
  process.stderr.write(`${GRAY}${ts()}${RESET} ${footer}\n`);
}

/**
 * Dump a list of items (e.g. file names, tool names).
 */
export function diagList(f: FlagName, label: string, title: string, items: string[]): void {
  if (!flag(f)) return;
  write(CYAN, label, `${title} (${items.length}):`);
  for (const item of items) {
    process.stderr.write(`  ${DIM}•${RESET} ${item}\n`);
  }
}

/**
 * Log a file operation (copy, write, skip) for workspace diagnostics.
 */
export function diagFile(
  f: FlagName,
  label: string,
  op: "write" | "skip" | "copy" | "filter",
  filePath: string,
  detail?: string,
): void {
  if (!flag(f)) return;
  const opColor = op === "skip" || op === "filter" ? YELLOW : GREEN;
  const opLabel = op.toUpperCase().padEnd(6);
  const extra = detail ? ` ${DIM}(${detail})${RESET}` : "";
  write(opColor, label, `${opLabel} ${filePath}${extra}`);
}
