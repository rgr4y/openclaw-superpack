/**
 * Tests for overlay hooks.ts — verifies that createHookRunner returns
 * runner methods for the 6 new superpack hooks, and that upstream runner
 * methods are preserved.
 */

import { describe, it, expect, vi } from "vitest";
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

describe("superpack startup banner", () => {
  it("hasHooks('gateway_start') is always true even with empty registry", () => {
    const runner = createHookRunner(makeEmptyRegistry());
    // Superpack overrides this so the upstream guard doesn't skip runGatewayStart
    expect(runner.hasHooks("gateway_start" as any)).toBe(true);
  });

  it("hasHooks returns false for other hooks with no registrations", () => {
    const runner = createHookRunner(makeEmptyRegistry());
    expect(runner.hasHooks("gateway_stop" as any)).toBe(false);
    expect(runner.hasHooks("session_start" as any)).toBe(false);
    expect(runner.hasHooks("system_prompt_footer" as any)).toBe(false);
  });

  it("emits banner via logger.warn when runGatewayStart is called (mimics upstream pattern)", async () => {
    // Upstream does: if (hookRunner?.hasHooks("gateway_start")) { void hookRunner.runGatewayStart(...) }
    const warnMessages: string[] = [];
    const mockLogger = {
      warn: (msg: string) => { warnMessages.push(msg); },
      error: (msg: string) => {},
    };

    const runner = createHookRunner(makeEmptyRegistry(), { logger: mockLogger });

    // Step 1: upstream guard check — must pass
    expect(runner.hasHooks("gateway_start" as any)).toBe(true);

    // Step 2: upstream calls runGatewayStart
    await runner.runGatewayStart({ port: 18789 }, { port: 18789 });

    // Step 3: banner should have been emitted
    expect(warnMessages.length).toBe(1);
    expect(warnMessages[0]).toContain("[superpack] loaded");
    expect(warnMessages[0]).toContain("0/7 hooks active");
    expect(warnMessages[0]).toContain("○ system_prompt_tools_filter");
    expect(warnMessages[0]).toContain("○ subagent_prompt_validate");
    expect(warnMessages[0]).toContain("○ sandbox_workspace_ready");
  });

  it("banner shows active hooks when plugins register handlers", async () => {
    const warnMessages: string[] = [];
    const mockLogger = {
      warn: (msg: string) => { warnMessages.push(msg); },
      error: (msg: string) => {},
    };

    const registry = makeEmptyRegistry();
    registry.typedHooks.push({
      pluginId: "my-plugin",
      hookName: "system_prompt_footer" as any,
      handler: (() => ({ append: "test" })) as any,
      priority: 0,
      source: "test",
    });
    registry.typedHooks.push({
      pluginId: "my-plugin",
      hookName: "workspace_bootstrap_before" as any,
      handler: (() => ({ files: [], skip: false })) as any,
      priority: 0,
      source: "test",
    });

    const runner = createHookRunner(registry, { logger: mockLogger });
    await runner.runGatewayStart({ port: 18789 }, { port: 18789 });

    expect(warnMessages[0]).toContain("2/7 hooks active");
    expect(warnMessages[0]).toContain("● system_prompt_footer");
    expect(warnMessages[0]).toContain("● workspace_bootstrap_before");
    expect(warnMessages[0]).toContain("○ system_prompt_tools_filter");
  });
});

describe("runSandboxWorkspaceReady", () => {
  it("returns runner with runSandboxWorkspaceReady method", () => {
    const runner = createHookRunner(makeEmptyRegistry());
    expect(typeof runner.runSandboxWorkspaceReady).toBe("function");
  });

  it("returns undefined when no hooks registered", async () => {
    const runner = createHookRunner(makeEmptyRegistry());
    const result = await runner.runSandboxWorkspaceReady(
      {
        workspaceDir: "/tmp/sandbox",
        agentWorkspaceDir: "/tmp/workspace",
        agentId: "code-only",
        sessionKey: "agent:main:subagent:code-only:abc",
        scopeKey: "abc",
      },
      { agentId: "main" },
    );
    expect(result).toBeUndefined();
  });

  it("calls handlers sequentially in priority order", async () => {
    const order: number[] = [];
    const registry = makeEmptyRegistry();
    registry.typedHooks.push({
      pluginId: "plugin-a",
      hookName: "sandbox_workspace_ready" as any,
      handler: (async () => { order.push(1); }) as any,
      priority: 10,
      source: "test",
    });
    registry.typedHooks.push({
      pluginId: "plugin-b",
      hookName: "sandbox_workspace_ready" as any,
      handler: (async () => { order.push(2); }) as any,
      priority: 0,
      source: "test",
    });

    const runnerWithHooks = createHookRunner(registry);
    await runnerWithHooks.runSandboxWorkspaceReady(
      {
        workspaceDir: "/tmp/sandbox",
        agentWorkspaceDir: "/tmp/workspace",
        agentId: "code-only",
        sessionKey: "agent:main:subagent:code-only:abc",
        scopeKey: "abc",
      },
      { agentId: "main" },
    );
    // Higher priority runs first
    expect(order).toEqual([1, 2]);
  });
});
