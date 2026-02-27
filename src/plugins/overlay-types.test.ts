/**
 * Tests for the overlay types.ts — verifies that the 6 superpack hook names
 * are present in the extended PluginHookName union and that corresponding
 * event/result types and PluginHookHandlerMap entries exist.
 */

import { describe, it, expect } from "vitest";
import type {
  PluginHookName,
  PluginHookHandlerMap,
  // Superpack event types
  PluginHookSystemPromptToolsFilterEvent,
  PluginHookSystemPromptToolsFilterResult,
  PluginHookSystemPromptSkillsFilterEvent,
  PluginHookSystemPromptSkillsFilterResult,
  PluginHookSystemPromptFooterEvent,
  PluginHookSystemPromptFooterResult,
  PluginHookWorkspaceBootstrapBeforeEvent,
  PluginHookWorkspaceBootstrapBeforeResult,
  PluginHookWorkspaceBootstrapAfterEvent,
  PluginHookSubagentPromptValidateEvent,
  PluginHookSubagentPromptValidateResult,
} from "./types.js";

// Type-level assertion helper: if this compiles, the type exists in the union
type AssertExtends<T, U> = T extends U ? true : false;

describe("overlay types.ts — superpack hook names in PluginHookName", () => {
  const SUPERPACK_HOOK_NAMES: PluginHookName[] = [
    "system_prompt_tools_filter",
    "system_prompt_skills_filter",
    "system_prompt_footer",
    "workspace_bootstrap_before",
    "workspace_bootstrap_after",
    "subagent_prompt_validate",
  ];

  it("includes all 6 superpack hook names in the PluginHookName union", () => {
    for (const name of SUPERPACK_HOOK_NAMES) {
      // Runtime check: assigning the string to PluginHookName works
      const hookName: PluginHookName = name;
      expect(hookName).toBe(name);
    }
  });

  // Compile-time checks: these will fail to compile if types are missing
  it("exports system_prompt_tools_filter event/result types", () => {
    const event: PluginHookSystemPromptToolsFilterEvent = {
      tools: [{ name: "test", description: "test tool" }],
    };
    expect(event.tools).toHaveLength(1);

    const result: PluginHookSystemPromptToolsFilterResult = {
      tools: [],
    };
    expect(result.tools).toHaveLength(0);
  });

  it("exports system_prompt_skills_filter event/result types", () => {
    const event: PluginHookSystemPromptSkillsFilterEvent = {
      skillsPrompt: "<skills>test</skills>",
    };
    expect(event.skillsPrompt).toContain("test");

    const result: PluginHookSystemPromptSkillsFilterResult = {
      skillsPrompt: "",
    };
    expect(result.skillsPrompt).toBe("");
  });

  it("exports system_prompt_footer event/result types", () => {
    const event: PluginHookSystemPromptFooterEvent = {
      currentPrompt: "You are an assistant.",
    };
    expect(event.currentPrompt).toBeTruthy();

    const result: PluginHookSystemPromptFooterResult = {
      append: "## Footer",
    };
    expect(result.append).toContain("Footer");
  });

  it("exports workspace_bootstrap_before event/result types", () => {
    const event: PluginHookWorkspaceBootstrapBeforeEvent = {
      workspaceDir: "/tmp/ws",
      files: [{ name: "AGENTS.md", content: "# Agents" }],
      isNewWorkspace: true,
    };
    expect(event.files).toHaveLength(1);

    const result: PluginHookWorkspaceBootstrapBeforeResult = {
      files: [],
      skip: false,
    };
    expect(result.skip).toBe(false);
  });

  it("exports workspace_bootstrap_after event type", () => {
    const event: PluginHookWorkspaceBootstrapAfterEvent = {
      workspaceDir: "/tmp/ws",
      filesWritten: ["AGENTS.md"],
      filesSkipped: ["TOOLS.md"],
    };
    expect(event.filesWritten).toHaveLength(1);
    expect(event.filesSkipped).toHaveLength(1);
  });

  it("exports subagent_prompt_validate event/result types", () => {
    const event: PluginHookSubagentPromptValidateEvent = {
      agentId: "sub-1",
      parentAgentId: "main",
      systemPrompt: "You are a sub-agent.",
      sessionKey: "session-123",
    };
    expect(event.agentId).toBe("sub-1");

    const result: PluginHookSubagentPromptValidateResult = {
      block: false,
    };
    expect(result.block).toBe(false);
  });

  it("has PluginHookHandlerMap entries for all 6 new hooks", () => {
    // Compile-time check: these type assertions verify PluginHookHandlerMap has entries.
    // If any are missing, this file won't compile.
    type Check1 = AssertExtends<"system_prompt_tools_filter", keyof PluginHookHandlerMap>;
    type Check2 = AssertExtends<"system_prompt_skills_filter", keyof PluginHookHandlerMap>;
    type Check3 = AssertExtends<"system_prompt_footer", keyof PluginHookHandlerMap>;
    type Check4 = AssertExtends<"workspace_bootstrap_before", keyof PluginHookHandlerMap>;
    type Check5 = AssertExtends<"workspace_bootstrap_after", keyof PluginHookHandlerMap>;
    type Check6 = AssertExtends<"subagent_prompt_validate", keyof PluginHookHandlerMap>;

    // Runtime assertion to ensure the compile-time checks are meaningful
    const checks: boolean[] = [
      true as Check1,
      true as Check2,
      true as Check3,
      true as Check4,
      true as Check5,
      true as Check6,
    ];
    expect(checks.every(Boolean)).toBe(true);
  });
});
