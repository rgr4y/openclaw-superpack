/**
 * openclaw-superpack: Feature flags
 *
 * Independent of log levels. Toggle specific diagnostic outputs.
 * Set via:
 *   - env: SUPERPACK_FLAGS=dump_system_prompt,dump_bootstrap_files
 *   - env: SUPERPACK_PRESET=debug_prompts
 *   - config: superpack.flags: ["dump_system_prompt"]
 *   - config: superpack.preset: "debug_prompts"
 */

// ---------------------------------------------------------------------------
// Flag definitions
// ---------------------------------------------------------------------------

export const FLAGS = {
  // Prompt diagnostics
  dump_system_prompt: "Log full system prompt on every build",
  dump_system_prompt_diff: "Log diff when system prompt changes between runs",
  dump_bootstrap_files: "Log which workspace files loaded, filtered, injected",
  dump_skills_resolution: "Log skill discovery and <available_skills> content",
  dump_subagent_prompt: "Log full prompt for every subagent spawn with agentId",

  // Tool diagnostics
  dump_tool_resolution: "Log which tools passed policy filter and why",
  dump_tool_calls: "Log every tool call name + params before execution",
  dump_tool_results: "Log tool results after execution",

  // Workspace diagnostics
  dump_sandbox_copy: "Log every file copied to subagent sandbox with content hash",
  dump_template_writes: "Log when template .md files are written or skipped",

  // Hook diagnostics
  dump_hook_events: "Log every hook fired, handlers invoked, results returned",
  dump_hook_timing: "Log execution time for each hook handler",

  // Network / model diagnostics
  dump_llm_payload: "Log full LLM request payload (system + messages)",
  dump_llm_response: "Log full LLM response content",
} as const;

export type FlagName = keyof typeof FLAGS;
export const ALL_FLAG_NAMES = Object.keys(FLAGS) as FlagName[];

// ---------------------------------------------------------------------------
// Presets — convenience groups
// ---------------------------------------------------------------------------

export const PRESETS = {
  debug_prompts: [
    "dump_system_prompt",
    "dump_system_prompt_diff",
    "dump_bootstrap_files",
    "dump_skills_resolution",
    "dump_subagent_prompt",
  ],
  debug_tools: [
    "dump_tool_resolution",
    "dump_tool_calls",
    "dump_tool_results",
    "dump_hook_events",
  ],
  debug_workspace: [
    "dump_bootstrap_files",
    "dump_sandbox_copy",
    "dump_template_writes",
  ],
  debug_hooks: [
    "dump_hook_events",
    "dump_hook_timing",
  ],
  debug_llm: [
    "dump_llm_payload",
    "dump_llm_response",
  ],
  debug_all: ALL_FLAG_NAMES,
} as const satisfies Record<string, readonly FlagName[]>;

export type PresetName = keyof typeof PRESETS;

// ---------------------------------------------------------------------------
// Resolution — env + config merge
// ---------------------------------------------------------------------------

let activeFlags: Set<FlagName> | null = null;
let configFlags: FlagName[] = [];
let configPreset: PresetName | undefined;

/**
 * Called once at startup (or from overlay code) to inject config-driven flags.
 * Can be called again to update at runtime.
 */
export function setConfigFlags(flags?: string[], preset?: string): void {
  configFlags = (flags ?? []).filter((f): f is FlagName => f in FLAGS);
  configPreset = preset && preset in PRESETS ? (preset as PresetName) : undefined;
  activeFlags = null; // bust cache
}

function resolve(): Set<FlagName> {
  if (activeFlags) return activeFlags;

  const result = new Set<FlagName>();

  // 1. Config preset
  if (configPreset) {
    for (const f of PRESETS[configPreset]) result.add(f);
  }

  // 2. Config flags
  for (const f of configFlags) result.add(f);

  // 3. Env preset (overrides config)
  const envPreset = process.env.SUPERPACK_PRESET?.trim();
  if (envPreset && envPreset in PRESETS) {
    for (const f of PRESETS[envPreset as PresetName]) result.add(f);
  }

  // 4. Env flags (additive)
  const envFlags = process.env.SUPERPACK_FLAGS?.trim();
  if (envFlags) {
    for (const raw of envFlags.split(",")) {
      const f = raw.trim();
      if (f in FLAGS) result.add(f as FlagName);
    }
  }

  activeFlags = result;
  return result;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Check if a specific flag is active */
export function flag(name: FlagName): boolean {
  return resolve().has(name);
}

/** Get all active flags */
export function activeFlags_(): readonly FlagName[] {
  return [...resolve()];
}

/** Reset cache (for testing or runtime config reload) */
export function resetFlags(): void {
  activeFlags = null;
}
