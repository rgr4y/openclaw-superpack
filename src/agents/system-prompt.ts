/**
 * openclaw-superpack: system-prompt overlay
 *
 * Replaces src/agents/system-prompt.ts from upstream openclaw.
 * Must export: buildAgentSystemPrompt, buildRuntimeLine, PromptMode
 *
 * buildRuntimeLine is upstream-compatible and kept as-is.
 * buildAgentSystemPrompt is yours — edit freely.
 */

import type { ReasoningLevel, ThinkLevel } from "../auto-reply/thinking.js";
import type { MemoryCitationsMode } from "../config/types.memory.js";
import type { ResolvedTimeFormat } from "./date-time.js";
import type { EmbeddedContextFile } from "./pi-embedded-helpers.js";
import type { EmbeddedSandboxInfo } from "./pi-embedded-runner/types.js";

export type PromptMode = "full" | "minimal" | "none";

// ---------------------------------------------------------------------------
// Superpack feature flags — inline to avoid import path issues in overlay
// ---------------------------------------------------------------------------

function superpackFlag(name: string): boolean {
  const env = process.env.SUPERPACK_FLAGS?.trim();
  if (env && env.split(",").map((s) => s.trim()).includes(name)) return true;
  const preset = process.env.SUPERPACK_PRESET?.trim();
  if (preset === "debug_all") return true;
  if (preset === "debug_prompts") {
    return [
      "dump_system_prompt",
      "dump_system_prompt_diff",
      "dump_bootstrap_files",
      "dump_skills_resolution",
      "dump_subagent_prompt",
    ].includes(name);
  }
  return false;
}

function diagDump(label: string, title: string, content: string): void {
  const lines = content.split("\n").length;
  const bytes = Buffer.byteLength(content, "utf-8");
  const ts = new Date().toISOString().slice(11, 23);
  process.stderr.write(
    `\x1b[90m${ts}\x1b[0m \x1b[36m\x1b[1m[superpack:${label}]\x1b[0m \x1b[32m▼ ${title}\x1b[0m \x1b[2m(${lines} lines, ${bytes} bytes)\x1b[0m\n`,
  );
  process.stderr.write(content);
  if (!content.endsWith("\n")) process.stderr.write("\n");
  process.stderr.write(
    `\x1b[90m${ts}\x1b[0m \x1b[36m\x1b[1m[superpack:${label}]\x1b[0m \x1b[32m▲ end ${title}\x1b[0m\n`,
  );
}

function diagList(label: string, title: string, items: string[]): void {
  const ts = new Date().toISOString().slice(11, 23);
  process.stderr.write(
    `\x1b[90m${ts}\x1b[0m \x1b[36m\x1b[1m[superpack:${label}]\x1b[0m ${title} (${items.length}):\n`,
  );
  for (const item of items) {
    process.stderr.write(`  \x1b[2m•\x1b[0m ${item}\n`);
  }
}

// ---------------------------------------------------------------------------
// buildRuntimeLine — upstream-compatible, do not change signature
// ---------------------------------------------------------------------------

export function buildRuntimeLine(
  runtimeInfo?: {
    agentId?: string;
    host?: string;
    os?: string;
    arch?: string;
    node?: string;
    model?: string;
    defaultModel?: string;
    shell?: string;
    repoRoot?: string;
  },
  runtimeChannel?: string,
  runtimeCapabilities: string[] = [],
  defaultThinkLevel?: ThinkLevel,
): string {
  return `Runtime: ${[
    runtimeInfo?.agentId ? `agent=${runtimeInfo.agentId}` : "",
    runtimeInfo?.host ? `host=${runtimeInfo.host}` : "",
    runtimeInfo?.repoRoot ? `repo=${runtimeInfo.repoRoot}` : "",
    runtimeInfo?.os
      ? `os=${runtimeInfo.os}${runtimeInfo?.arch ? ` (${runtimeInfo.arch})` : ""}`
      : runtimeInfo?.arch
        ? `arch=${runtimeInfo.arch}`
        : "",
    runtimeInfo?.node ? `node=${runtimeInfo.node}` : "",
    runtimeInfo?.model ? `model=${runtimeInfo.model}` : "",
    runtimeInfo?.defaultModel ? `default_model=${runtimeInfo.defaultModel}` : "",
    runtimeInfo?.shell ? `shell=${runtimeInfo.shell}` : "",
    runtimeChannel ? `channel=${runtimeChannel}` : "",
    runtimeChannel
      ? `capabilities=${runtimeCapabilities.length > 0 ? runtimeCapabilities.join(",") : "none"}`
      : "",
    `thinking=${defaultThinkLevel ?? "off"}`,
  ]
    .filter(Boolean)
    .join(" | ")}`;
}

// ---------------------------------------------------------------------------
// buildAgentSystemPrompt — your territory
// ---------------------------------------------------------------------------

export function buildAgentSystemPrompt(params: {
  workspaceDir: string;
  defaultThinkLevel?: ThinkLevel;
  reasoningLevel?: ReasoningLevel;
  extraSystemPrompt?: string;
  ownerNumbers?: string[];
  ownerDisplay?: "raw" | "hash";
  ownerDisplaySecret?: string;
  reasoningTagHint?: boolean;
  toolNames?: string[];
  toolSummaries?: Record<string, string>;
  modelAliasLines?: string[];
  userTimezone?: string;
  userTime?: string;
  userTimeFormat?: ResolvedTimeFormat;
  contextFiles?: EmbeddedContextFile[];
  skillsPrompt?: string;
  heartbeatPrompt?: string;
  docsPath?: string;
  workspaceNotes?: string[];
  ttsHint?: string;
  promptMode?: PromptMode;
  acpEnabled?: boolean;
  runtimeInfo?: {
    agentId?: string;
    host?: string;
    os?: string;
    arch?: string;
    node?: string;
    model?: string;
    defaultModel?: string;
    shell?: string;
    channel?: string;
    capabilities?: string[];
    repoRoot?: string;
  };
  messageToolHints?: string[];
  sandboxInfo?: EmbeddedSandboxInfo;
  restartEnabled?: boolean;
  reactionGuidance?: {
    level: "minimal" | "extensive";
    channel: string;
  };
  memoryCitationsMode?: MemoryCitationsMode;
}): string {
  const promptMode = params.promptMode ?? "full";
  const agentId = params.runtimeInfo?.agentId ?? "unknown";
  const channel = params.runtimeInfo?.channel?.trim().toLowerCase();
  const runtimeLine = buildRuntimeLine(
    params.runtimeInfo,
    channel,
    params.runtimeInfo?.capabilities ?? [],
    params.defaultThinkLevel,
  );

  if (promptMode === "none") {
    return "You are a personal assistant running inside OpenClaw.";
  }

  // --- Diagnostics: tool resolution ---
  if (superpackFlag("dump_tool_resolution")) {
    const tools = params.toolNames ?? [];
    const summaries = params.toolSummaries ?? {};
    diagList("tools", `Tool resolution for agent=${agentId}`, [
      ...tools.map((t) => `${t}${summaries[t] ? ` — ${summaries[t]}` : ""}`),
      ...(tools.length === 0 ? ["(no tools)"] : []),
    ]);
  }

  // --- Diagnostics: skills resolution ---
  if (superpackFlag("dump_skills_resolution")) {
    const skills = params.skillsPrompt?.trim();
    if (skills) {
      diagDump("skills", `Skills for agent=${agentId}`, skills);
    } else {
      diagList("skills", `Skills for agent=${agentId}`, ["(none)"]);
    }
  }

  // --- Build prompt ---
  // Branch on promptMode, channel, agentId — whatever you need.
  // This is the placeholder; replace with your actual sections.

  const lines: string[] = [
    "You are a personal assistant running inside OpenClaw.",
    "",
    `## Workspace`,
    `Working directory: ${params.workspaceDir}`,
    "",
    "## Runtime",
    runtimeLine,
    `Reasoning: ${params.reasoningLevel ?? "off"}`,
  ];

  // Tools section
  const toolNames = params.toolNames ?? [];
  if (toolNames.length > 0) {
    const summaries = params.toolSummaries ?? {};
    lines.push("", "## Tools");
    for (const tool of toolNames) {
      const desc = summaries[tool];
      lines.push(desc ? `- ${tool}: ${desc}` : `- ${tool}`);
    }
  }

  // Skills section
  const skills = params.skillsPrompt?.trim();
  if (skills) {
    lines.push("", "## Skills", skills);
  }

  // Context files
  const contextFiles = (params.contextFiles ?? []).filter(
    (f) => typeof f.path === "string" && f.path.trim().length > 0,
  );
  if (contextFiles.length > 0) {
    lines.push("", "# Project Context");
    for (const file of contextFiles) {
      lines.push("", `## ${file.path}`, "", file.content);
    }
  }

  // Extra system prompt (group chat context, subagent context)
  if (params.extraSystemPrompt?.trim()) {
    const header = promptMode === "minimal" ? "## Subagent Context" : "## Context";
    lines.push("", header, params.extraSystemPrompt.trim());
  }

  const result = lines.filter((l) => l !== undefined).join("\n");

  // --- Diagnostics: full prompt dump ---
  if (superpackFlag("dump_system_prompt")) {
    diagDump("prompt", `System prompt for agent=${agentId} mode=${promptMode}`, result);
  }

  return result;
}
