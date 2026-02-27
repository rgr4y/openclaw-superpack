/**
 * openclaw-superpack: Hook extensions
 *
 * Self-contained hook runner for superpack-specific events.
 * Designed to run alongside (not replace) upstream's HookRunner.
 * The overlay files for types.ts and hooks.ts will wire these into
 * the upstream plugin system; this module is the standalone implementation.
 */

// ---------------------------------------------------------------------------
// Hook names
// ---------------------------------------------------------------------------

export type SuperpackHookName =
  | "system_prompt_tools_filter"
  | "system_prompt_skills_filter"
  | "system_prompt_footer"
  | "workspace_bootstrap_before"
  | "workspace_bootstrap_after"
  | "subagent_prompt_validate";

// ---------------------------------------------------------------------------
// Event & result types
// ---------------------------------------------------------------------------

export type ToolEntry = {
  name: string;
  description?: string;
};

// system_prompt_tools_filter
export type SystemPromptToolsFilterEvent = {
  agentId: string;
  promptMode: string;
  tools: ToolEntry[];
};

export type SystemPromptToolsFilterResult = {
  tools: ToolEntry[];
};

// system_prompt_skills_filter
export type SystemPromptSkillsFilterEvent = {
  agentId: string;
  promptMode: string;
  skillsPrompt: string;
};

export type SystemPromptSkillsFilterResult = {
  skillsPrompt: string;
};

// system_prompt_footer
export type SystemPromptFooterEvent = {
  agentId: string;
  promptMode: string;
  currentPrompt: string;
};

export type SystemPromptFooterResult = {
  append: string;
};

// workspace_bootstrap_before
export type BootstrapFile = {
  name: string;
  content: string;
};

export type WorkspaceBootstrapBeforeEvent = {
  workspaceDir: string;
  files: BootstrapFile[];
  isNewWorkspace: boolean;
};

export type WorkspaceBootstrapBeforeResult = {
  files: BootstrapFile[];
  skip: boolean;
};

// workspace_bootstrap_after (fire-and-forget)
export type WorkspaceBootstrapAfterEvent = {
  workspaceDir: string;
  filesWritten: string[];
  filesSkipped: string[];
};

// subagent_prompt_validate
export type SubagentPromptValidateEvent = {
  agentId: string;
  parentAgentId: string;
  systemPrompt: string;
  sessionKey: string;
};

export type SubagentPromptValidateResult = {
  block: boolean;
  reason?: string;
};

// ---------------------------------------------------------------------------
// Handler type map
// ---------------------------------------------------------------------------

type HandlerMap = {
  system_prompt_tools_filter: (
    event: SystemPromptToolsFilterEvent,
  ) => Promise<SystemPromptToolsFilterResult | void> | SystemPromptToolsFilterResult | void;

  system_prompt_skills_filter: (
    event: SystemPromptSkillsFilterEvent,
  ) => Promise<SystemPromptSkillsFilterResult | void> | SystemPromptSkillsFilterResult | void;

  system_prompt_footer: (
    event: SystemPromptFooterEvent,
  ) => Promise<SystemPromptFooterResult | void> | SystemPromptFooterResult | void;

  workspace_bootstrap_before: (
    event: WorkspaceBootstrapBeforeEvent,
  ) => Promise<WorkspaceBootstrapBeforeResult | void> | WorkspaceBootstrapBeforeResult | void;

  workspace_bootstrap_after: (
    event: WorkspaceBootstrapAfterEvent,
  ) => Promise<void> | void;

  subagent_prompt_validate: (
    event: SubagentPromptValidateEvent,
  ) => Promise<SubagentPromptValidateResult | void> | SubagentPromptValidateResult | void;
};

export type SuperpackHookHandler<K extends SuperpackHookName> = HandlerMap[K];

// ---------------------------------------------------------------------------
// Registration entry
// ---------------------------------------------------------------------------

export type HookRegistration<K extends SuperpackHookName = SuperpackHookName> = {
  hookName: K;
  handler: HandlerMap[K];
  priority: number;
};

// ---------------------------------------------------------------------------
// Hook runner
// ---------------------------------------------------------------------------

function sortByPriority<T extends { priority: number }>(hooks: T[]): T[] {
  return [...hooks].sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
}

function getHooks<K extends SuperpackHookName>(
  registrations: HookRegistration[],
  name: K,
): HookRegistration<K>[] {
  return sortByPriority(
    registrations.filter((r) => r.hookName === name) as HookRegistration<K>[],
  );
}

export function createSuperpackHookRunner(registrations: HookRegistration[]) {
  // -- Sequential modifying: tools filter --
  async function runSystemPromptToolsFilter(
    event: SystemPromptToolsFilterEvent,
  ): Promise<SystemPromptToolsFilterResult> {
    const hooks = getHooks(registrations, "system_prompt_tools_filter");
    let current = event.tools;
    for (const hook of hooks) {
      try {
        const result = await hook.handler({ ...event, tools: current });
        if (result?.tools) current = result.tools;
      } catch {
        // Error: pass through current state
      }
    }
    return { tools: current };
  }

  // -- Sequential modifying: skills filter --
  async function runSystemPromptSkillsFilter(
    event: SystemPromptSkillsFilterEvent,
  ): Promise<SystemPromptSkillsFilterResult> {
    const hooks = getHooks(registrations, "system_prompt_skills_filter");
    let current = event.skillsPrompt;
    for (const hook of hooks) {
      try {
        const result = await hook.handler({ ...event, skillsPrompt: current });
        if (result && "skillsPrompt" in result) current = result.skillsPrompt;
      } catch {
        // Error: pass through
      }
    }
    return { skillsPrompt: current };
  }

  // -- Sequential accumulating: footer --
  async function runSystemPromptFooter(
    event: SystemPromptFooterEvent,
  ): Promise<SystemPromptFooterResult> {
    const hooks = getHooks(registrations, "system_prompt_footer");
    const parts: string[] = [];
    for (const hook of hooks) {
      try {
        const result = await hook.handler(event);
        if (result?.append) parts.push(result.append);
      } catch {
        // Error: skip
      }
    }
    return { append: parts.join("\n") };
  }

  // -- Sequential modifying: workspace bootstrap before --
  async function runWorkspaceBootstrapBefore(
    event: WorkspaceBootstrapBeforeEvent,
  ): Promise<WorkspaceBootstrapBeforeResult> {
    const hooks = getHooks(registrations, "workspace_bootstrap_before");
    let currentFiles = event.files;
    let skip = false;
    for (const hook of hooks) {
      try {
        const result = await hook.handler({ ...event, files: currentFiles });
        if (result) {
          if (result.files) currentFiles = result.files;
          if (result.skip) skip = true;
        }
      } catch {
        // Error: pass through
      }
    }
    return { files: currentFiles, skip };
  }

  // -- Fire-and-forget: workspace bootstrap after --
  async function runWorkspaceBootstrapAfter(
    event: WorkspaceBootstrapAfterEvent,
  ): Promise<void> {
    const hooks = getHooks(registrations, "workspace_bootstrap_after");
    await Promise.all(
      hooks.map(async (hook) => {
        try {
          await hook.handler(event);
        } catch {
          // Error: swallow
        }
      }),
    );
  }

  // -- Sequential blocking: subagent prompt validate --
  async function runSubagentPromptValidate(
    event: SubagentPromptValidateEvent,
  ): Promise<SubagentPromptValidateResult> {
    const hooks = getHooks(registrations, "subagent_prompt_validate");
    for (const hook of hooks) {
      try {
        const result = await hook.handler(event);
        if (result?.block) {
          return { block: true, reason: result.reason };
        }
      } catch {
        // Error: do not block
      }
    }
    return { block: false };
  }

  // -- Utility --
  function hasHooks(name: SuperpackHookName): boolean {
    return registrations.some((r) => r.hookName === name);
  }

  return {
    runSystemPromptToolsFilter,
    runSystemPromptSkillsFilter,
    runSystemPromptFooter,
    runWorkspaceBootstrapBefore,
    runWorkspaceBootstrapAfter,
    runSubagentPromptValidate,
    hasHooks,
  };
}

export type SuperpackHookRunner = ReturnType<typeof createSuperpackHookRunner>;
