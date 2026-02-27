/**
 * Tests for overlay hooks.ts — verifies that createHookRunner returns
 * runner methods for the 6 new superpack hooks, and that upstream runner
 * methods are preserved.
 */

import { describe, it, expect } from "vitest";
import type { PluginRegistry } from "/opt/openclaw-git/src/plugins/registry.js";
import { createHookRunner } from "./hooks.js";

function makeEmptyRegistry(): PluginRegistry {
  return {
    plugins: [],
    tools: [],
    hooks: [],
    typedHooks: [],
    channels: [],
    gatewayMethods: [],
    httpHandlers: [],
    httpRoutes: [],
    cliRegistrars: [],
    services: [],
    providers: [],
    commands: [],
    diagnostics: [],
  };
}

describe("overlay hooks.ts — superpack runner methods", () => {
  it("returns runner with all 6 new superpack methods", () => {
    const runner = createHookRunner(makeEmptyRegistry());
    expect(typeof runner.runSystemPromptToolsFilter).toBe("function");
    expect(typeof runner.runSystemPromptSkillsFilter).toBe("function");
    expect(typeof runner.runSystemPromptFooter).toBe("function");
    expect(typeof runner.runWorkspaceBootstrapBefore).toBe("function");
    expect(typeof runner.runWorkspaceBootstrapAfter).toBe("function");
    expect(typeof runner.runSubagentPromptValidate).toBe("function");
  });

  it("preserves upstream runner methods", () => {
    const runner = createHookRunner(makeEmptyRegistry());
    // Spot-check a few upstream methods
    expect(typeof runner.runBeforeModelResolve).toBe("function");
    expect(typeof runner.runBeforePromptBuild).toBe("function");
    expect(typeof runner.runBeforeAgentStart).toBe("function");
    expect(typeof runner.runLlmInput).toBe("function");
    expect(typeof runner.runLlmOutput).toBe("function");
    expect(typeof runner.runAgentEnd).toBe("function");
    expect(typeof runner.runBeforeToolCall).toBe("function");
    expect(typeof runner.runAfterToolCall).toBe("function");
    expect(typeof runner.runSessionStart).toBe("function");
    expect(typeof runner.runSessionEnd).toBe("function");
    expect(typeof runner.runGatewayStart).toBe("function");
    expect(typeof runner.runGatewayStop).toBe("function");
    expect(typeof runner.hasHooks).toBe("function");
    expect(typeof runner.getHookCount).toBe("function");
  });

  it("runSystemPromptToolsFilter returns undefined when no hooks registered", async () => {
    const runner = createHookRunner(makeEmptyRegistry());
    const result = await runner.runSystemPromptToolsFilter(
      { tools: [{ name: "exec", description: "run" }] },
      { agentId: "main" },
    );
    expect(result).toBeUndefined();
  });

  it("runSystemPromptToolsFilter delegates to registered handlers", async () => {
    const registry = makeEmptyRegistry();
    registry.typedHooks.push({
      pluginId: "test-plugin",
      hookName: "system_prompt_tools_filter" as any,
      handler: ((event: any) => ({
        tools: event.tools.filter((t: any) => t.name !== "exec"),
      })) as any,
      priority: 0,
      source: "test",
    });

    const runner = createHookRunner(registry);
    const result = await runner.runSystemPromptToolsFilter(
      { tools: [{ name: "exec", description: "run" }, { name: "read", description: "read" }] },
      { agentId: "main" },
    );
    expect(result).toBeDefined();
    expect(result!.tools).toHaveLength(1);
    expect(result!.tools[0].name).toBe("read");
  });

  it("runSystemPromptSkillsFilter returns undefined when no hooks", async () => {
    const runner = createHookRunner(makeEmptyRegistry());
    const result = await runner.runSystemPromptSkillsFilter(
      { skillsPrompt: "test" },
      { agentId: "main" },
    );
    expect(result).toBeUndefined();
  });

  it("runSystemPromptFooter returns undefined when no hooks", async () => {
    const runner = createHookRunner(makeEmptyRegistry());
    const result = await runner.runSystemPromptFooter(
      { currentPrompt: "base" },
      { agentId: "main" },
    );
    expect(result).toBeUndefined();
  });

  it("runWorkspaceBootstrapBefore returns undefined when no hooks", async () => {
    const runner = createHookRunner(makeEmptyRegistry());
    const result = await runner.runWorkspaceBootstrapBefore(
      { workspaceDir: "/tmp", files: [], isNewWorkspace: true },
      {},
    );
    expect(result).toBeUndefined();
  });

  it("runWorkspaceBootstrapAfter resolves without error when no hooks", async () => {
    const runner = createHookRunner(makeEmptyRegistry());
    await expect(
      runner.runWorkspaceBootstrapAfter(
        { workspaceDir: "/tmp", filesWritten: [], filesSkipped: [] },
        {},
      ),
    ).resolves.toBeUndefined();
  });

  it("runSubagentPromptValidate returns undefined when no hooks", async () => {
    const runner = createHookRunner(makeEmptyRegistry());
    const result = await runner.runSubagentPromptValidate(
      { agentId: "sub-1", parentAgentId: "main", systemPrompt: "prompt", sessionKey: "s1" },
      { agentId: "main" },
    );
    expect(result).toBeUndefined();
  });

  it("runSubagentPromptValidate delegates to handler that blocks", async () => {
    const registry = makeEmptyRegistry();
    registry.typedHooks.push({
      pluginId: "test-plugin",
      hookName: "subagent_prompt_validate" as any,
      handler: (() => ({ block: true, reason: "test block" })) as any,
      priority: 0,
      source: "test",
    });

    const runner = createHookRunner(registry);
    const result = await runner.runSubagentPromptValidate(
      { agentId: "sub-1", parentAgentId: "main", systemPrompt: "prompt", sessionKey: "s1" },
      { agentId: "main" },
    );
    expect(result).toBeDefined();
    expect(result!.block).toBe(true);
    expect(result!.reason).toBe("test block");
  });
});
