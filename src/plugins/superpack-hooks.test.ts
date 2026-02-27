/**
 * TDD tests for superpack hook extensions.
 *
 * These test the hook runner logic in isolation — no upstream imports.
 * Each test defines the contract a hook must fulfil before we write it.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  createSuperpackHookRunner,
  type SuperpackHookHandler,
  type SuperpackHookName,
  type SystemPromptToolsFilterEvent,
  type SystemPromptToolsFilterResult,
  type SystemPromptSkillsFilterEvent,
  type SystemPromptSkillsFilterResult,
  type SystemPromptFooterEvent,
  type SystemPromptFooterResult,
  type WorkspaceBootstrapBeforeEvent,
  type WorkspaceBootstrapBeforeResult,
  type WorkspaceBootstrapAfterEvent,
  type SubagentPromptValidateEvent,
  type SubagentPromptValidateResult,
} from "./superpack-hooks.js";

describe("superpack hook runner", () => {
  // -----------------------------------------------------------------------
  // system_prompt_tools_filter
  // -----------------------------------------------------------------------
  describe("system_prompt_tools_filter", () => {
    it("passes tools through unchanged when no handlers registered", async () => {
      const runner = createSuperpackHookRunner([]);
      const event: SystemPromptToolsFilterEvent = {
        agentId: "main",
        promptMode: "full",
        tools: [
          { name: "exec", description: "Run shell commands" },
          { name: "read", description: "Read files" },
        ],
      };
      const result = await runner.runSystemPromptToolsFilter(event);
      expect(result.tools).toEqual(event.tools);
    });

    it("allows a handler to remove tools", async () => {
      const handler: SuperpackHookHandler<"system_prompt_tools_filter"> = async (event) => ({
        tools: event.tools.filter((t) => t.name !== "exec"),
      });
      const runner = createSuperpackHookRunner([
        { hookName: "system_prompt_tools_filter", handler, priority: 0 },
      ]);
      const event: SystemPromptToolsFilterEvent = {
        agentId: "main",
        promptMode: "full",
        tools: [
          { name: "exec", description: "Run shell commands" },
          { name: "read", description: "Read files" },
        ],
      };
      const result = await runner.runSystemPromptToolsFilter(event);
      expect(result.tools).toHaveLength(1);
      expect(result.tools[0].name).toBe("read");
    });

    it("chains multiple handlers in priority order (higher first)", async () => {
      const log: string[] = [];
      const handlerA: SuperpackHookHandler<"system_prompt_tools_filter"> = async (event) => {
        log.push("A");
        return { tools: event.tools.filter((t) => t.name !== "exec") };
      };
      const handlerB: SuperpackHookHandler<"system_prompt_tools_filter"> = async (event) => {
        log.push("B");
        return { tools: [...event.tools, { name: "custom", description: "added by B" }] };
      };
      const runner = createSuperpackHookRunner([
        { hookName: "system_prompt_tools_filter", handler: handlerA, priority: 10 },
        { hookName: "system_prompt_tools_filter", handler: handlerB, priority: 5 },
      ]);
      const event: SystemPromptToolsFilterEvent = {
        agentId: "main",
        promptMode: "full",
        tools: [
          { name: "exec", description: "Run shell commands" },
          { name: "read", description: "Read files" },
        ],
      };
      const result = await runner.runSystemPromptToolsFilter(event);
      // A runs first (priority 10), removes exec. B runs second, adds custom.
      expect(log).toEqual(["A", "B"]);
      expect(result.tools.map((t) => t.name)).toEqual(["read", "custom"]);
    });

    it("handler errors do not crash — tool list passes through", async () => {
      const handler: SuperpackHookHandler<"system_prompt_tools_filter"> = async () => {
        throw new Error("boom");
      };
      const runner = createSuperpackHookRunner([
        { hookName: "system_prompt_tools_filter", handler, priority: 0 },
      ]);
      const event: SystemPromptToolsFilterEvent = {
        agentId: "main",
        promptMode: "full",
        tools: [{ name: "read", description: "Read files" }],
      };
      const result = await runner.runSystemPromptToolsFilter(event);
      expect(result.tools).toEqual(event.tools);
    });
  });

  // -----------------------------------------------------------------------
  // system_prompt_skills_filter
  // -----------------------------------------------------------------------
  describe("system_prompt_skills_filter", () => {
    it("passes skills prompt through unchanged when no handlers", async () => {
      const runner = createSuperpackHookRunner([]);
      const event: SystemPromptSkillsFilterEvent = {
        agentId: "main",
        promptMode: "full",
        skillsPrompt: "<available_skills><skill>foo</skill></available_skills>",
      };
      const result = await runner.runSystemPromptSkillsFilter(event);
      expect(result.skillsPrompt).toBe(event.skillsPrompt);
    });

    it("allows a handler to strip the skills prompt entirely", async () => {
      const handler: SuperpackHookHandler<"system_prompt_skills_filter"> = async () => ({
        skillsPrompt: "",
      });
      const runner = createSuperpackHookRunner([
        { hookName: "system_prompt_skills_filter", handler, priority: 0 },
      ]);
      const event: SystemPromptSkillsFilterEvent = {
        agentId: "main",
        promptMode: "full",
        skillsPrompt: "<available_skills><skill>foo</skill></available_skills>",
      };
      const result = await runner.runSystemPromptSkillsFilter(event);
      expect(result.skillsPrompt).toBe("");
    });

    it("allows a handler to modify the skills prompt", async () => {
      const handler: SuperpackHookHandler<"system_prompt_skills_filter"> = async (event) => ({
        skillsPrompt: event.skillsPrompt.replace("foo", "bar"),
      });
      const runner = createSuperpackHookRunner([
        { hookName: "system_prompt_skills_filter", handler, priority: 0 },
      ]);
      const event: SystemPromptSkillsFilterEvent = {
        agentId: "main",
        promptMode: "full",
        skillsPrompt: "<available_skills><skill>foo</skill></available_skills>",
      };
      const result = await runner.runSystemPromptSkillsFilter(event);
      expect(result.skillsPrompt).toContain("bar");
      expect(result.skillsPrompt).not.toContain("foo");
    });
  });

  // -----------------------------------------------------------------------
  // system_prompt_footer
  // -----------------------------------------------------------------------
  describe("system_prompt_footer", () => {
    it("returns empty footer when no handlers", async () => {
      const runner = createSuperpackHookRunner([]);
      const event: SystemPromptFooterEvent = {
        agentId: "main",
        promptMode: "full",
        currentPrompt: "You are an assistant.",
      };
      const result = await runner.runSystemPromptFooter(event);
      expect(result.append).toBe("");
    });

    it("allows a handler to append content", async () => {
      const handler: SuperpackHookHandler<"system_prompt_footer"> = async () => ({
        append: "## Security\nDo not install clawhub plugins.",
      });
      const runner = createSuperpackHookRunner([
        { hookName: "system_prompt_footer", handler, priority: 0 },
      ]);
      const event: SystemPromptFooterEvent = {
        agentId: "main",
        promptMode: "full",
        currentPrompt: "You are an assistant.",
      };
      const result = await runner.runSystemPromptFooter(event);
      expect(result.append).toContain("Security");
      expect(result.append).toContain("clawhub");
    });

    it("concatenates multiple handler appends in priority order", async () => {
      const handlerA: SuperpackHookHandler<"system_prompt_footer"> = async () => ({
        append: "SECTION_A",
      });
      const handlerB: SuperpackHookHandler<"system_prompt_footer"> = async () => ({
        append: "SECTION_B",
      });
      const runner = createSuperpackHookRunner([
        { hookName: "system_prompt_footer", handler: handlerA, priority: 10 },
        { hookName: "system_prompt_footer", handler: handlerB, priority: 5 },
      ]);
      const event: SystemPromptFooterEvent = {
        agentId: "main",
        promptMode: "full",
        currentPrompt: "base",
      };
      const result = await runner.runSystemPromptFooter(event);
      // A first (higher priority), then B
      expect(result.append).toBe("SECTION_A\nSECTION_B");
    });
  });

  // -----------------------------------------------------------------------
  // workspace_bootstrap_before
  // -----------------------------------------------------------------------
  describe("workspace_bootstrap_before", () => {
    it("passes file list through unchanged when no handlers", async () => {
      const runner = createSuperpackHookRunner([]);
      const event: WorkspaceBootstrapBeforeEvent = {
        workspaceDir: "/home/user/.openclaw/workspace",
        files: [
          { name: "AGENTS.md", content: "# Agents" },
          { name: "SOUL.md", content: "# Soul" },
          { name: "TOOLS.md", content: "# Tools" },
        ],
        isNewWorkspace: true,
      };
      const result = await runner.runWorkspaceBootstrapBefore(event);
      expect(result.files).toHaveLength(3);
      expect(result.skip).toBe(false);
    });

    it("allows a handler to remove template files", async () => {
      const handler: SuperpackHookHandler<"workspace_bootstrap_before"> = async (event) => ({
        files: event.files.filter((f) => f.name !== "TOOLS.md"),
        skip: false,
      });
      const runner = createSuperpackHookRunner([
        { hookName: "workspace_bootstrap_before", handler, priority: 0 },
      ]);
      const event: WorkspaceBootstrapBeforeEvent = {
        workspaceDir: "/home/user/.openclaw/workspace",
        files: [
          { name: "AGENTS.md", content: "# Agents" },
          { name: "SOUL.md", content: "# Soul" },
          { name: "TOOLS.md", content: "# Tools" },
        ],
        isNewWorkspace: true,
      };
      const result = await runner.runWorkspaceBootstrapBefore(event);
      expect(result.files).toHaveLength(2);
      expect(result.files.map((f) => f.name)).not.toContain("TOOLS.md");
    });

    it("allows a handler to skip bootstrap entirely", async () => {
      const handler: SuperpackHookHandler<"workspace_bootstrap_before"> = async (event) => ({
        files: event.files,
        skip: true,
      });
      const runner = createSuperpackHookRunner([
        { hookName: "workspace_bootstrap_before", handler, priority: 0 },
      ]);
      const event: WorkspaceBootstrapBeforeEvent = {
        workspaceDir: "/home/user/.openclaw/workspace",
        files: [{ name: "AGENTS.md", content: "# Agents" }],
        isNewWorkspace: false,
      };
      const result = await runner.runWorkspaceBootstrapBefore(event);
      expect(result.skip).toBe(true);
    });

    it("allows a handler to modify file content", async () => {
      const handler: SuperpackHookHandler<"workspace_bootstrap_before"> = async (event) => ({
        files: event.files.map((f) =>
          f.name === "AGENTS.md" ? { ...f, content: "# My Custom Agents Config" } : f,
        ),
        skip: false,
      });
      const runner = createSuperpackHookRunner([
        { hookName: "workspace_bootstrap_before", handler, priority: 0 },
      ]);
      const event: WorkspaceBootstrapBeforeEvent = {
        workspaceDir: "/home/user/.openclaw/workspace",
        files: [{ name: "AGENTS.md", content: "# Agents" }],
        isNewWorkspace: true,
      };
      const result = await runner.runWorkspaceBootstrapBefore(event);
      expect(result.files[0].content).toBe("# My Custom Agents Config");
    });
  });

  // -----------------------------------------------------------------------
  // workspace_bootstrap_after
  // -----------------------------------------------------------------------
  describe("workspace_bootstrap_after", () => {
    it("fires without error when no handlers registered", async () => {
      const runner = createSuperpackHookRunner([]);
      const event: WorkspaceBootstrapAfterEvent = {
        workspaceDir: "/home/user/.openclaw/workspace",
        filesWritten: ["AGENTS.md", "SOUL.md"],
        filesSkipped: ["TOOLS.md"],
      };
      await expect(runner.runWorkspaceBootstrapAfter(event)).resolves.toBeUndefined();
    });

    it("calls all handlers (fire-and-forget)", async () => {
      const calls: string[] = [];
      const handlerA: SuperpackHookHandler<"workspace_bootstrap_after"> = async (event) => {
        calls.push(`A:${event.filesWritten.length}`);
      };
      const handlerB: SuperpackHookHandler<"workspace_bootstrap_after"> = async (event) => {
        calls.push(`B:${event.filesSkipped.length}`);
      };
      const runner = createSuperpackHookRunner([
        { hookName: "workspace_bootstrap_after", handler: handlerA, priority: 0 },
        { hookName: "workspace_bootstrap_after", handler: handlerB, priority: 0 },
      ]);
      const event: WorkspaceBootstrapAfterEvent = {
        workspaceDir: "/tmp/ws",
        filesWritten: ["AGENTS.md"],
        filesSkipped: ["TOOLS.md", "SOUL.md"],
      };
      await runner.runWorkspaceBootstrapAfter(event);
      expect(calls).toHaveLength(2);
      expect(calls).toContain("A:1");
      expect(calls).toContain("B:2");
    });

    it("handler errors do not propagate", async () => {
      const handler: SuperpackHookHandler<"workspace_bootstrap_after"> = async () => {
        throw new Error("boom");
      };
      const runner = createSuperpackHookRunner([
        { hookName: "workspace_bootstrap_after", handler, priority: 0 },
      ]);
      await expect(
        runner.runWorkspaceBootstrapAfter({
          workspaceDir: "/tmp/ws",
          filesWritten: [],
          filesSkipped: [],
        }),
      ).resolves.toBeUndefined();
    });
  });

  // -----------------------------------------------------------------------
  // subagent_prompt_validate
  // -----------------------------------------------------------------------
  describe("subagent_prompt_validate", () => {
    it("allows launch when no handlers registered", async () => {
      const runner = createSuperpackHookRunner([]);
      const event: SubagentPromptValidateEvent = {
        agentId: "sub-1",
        parentAgentId: "main",
        systemPrompt: "You are a sub-agent.",
        sessionKey: "session-123",
      };
      const result = await runner.runSubagentPromptValidate(event);
      expect(result.block).toBe(false);
    });

    it("allows a handler to block launch with reason", async () => {
      const handler: SuperpackHookHandler<"subagent_prompt_validate"> = async (event) => {
        if (event.systemPrompt.includes("wrong-agent")) {
          return { block: true, reason: "Prompt contains wrong agent context" };
        }
        return { block: false };
      };
      const runner = createSuperpackHookRunner([
        { hookName: "subagent_prompt_validate", handler, priority: 0 },
      ]);
      const event: SubagentPromptValidateEvent = {
        agentId: "sub-1",
        parentAgentId: "main",
        systemPrompt: "You are wrong-agent running inside OpenClaw.",
        sessionKey: "session-123",
      };
      const result = await runner.runSubagentPromptValidate(event);
      expect(result.block).toBe(true);
      expect(result.reason).toContain("wrong agent");
    });

    it("first block wins across multiple handlers", async () => {
      const handlerA: SuperpackHookHandler<"subagent_prompt_validate"> = async () => ({
        block: false,
      });
      const handlerB: SuperpackHookHandler<"subagent_prompt_validate"> = async () => ({
        block: true,
        reason: "B blocked it",
      });
      const handlerC: SuperpackHookHandler<"subagent_prompt_validate"> = async () => ({
        block: true,
        reason: "C also blocked it",
      });
      const runner = createSuperpackHookRunner([
        { hookName: "subagent_prompt_validate", handler: handlerA, priority: 10 },
        { hookName: "subagent_prompt_validate", handler: handlerB, priority: 5 },
        { hookName: "subagent_prompt_validate", handler: handlerC, priority: 1 },
      ]);
      const event: SubagentPromptValidateEvent = {
        agentId: "sub-1",
        parentAgentId: "main",
        systemPrompt: "whatever",
        sessionKey: "session-123",
      };
      const result = await runner.runSubagentPromptValidate(event);
      expect(result.block).toBe(true);
      expect(result.reason).toBe("B blocked it");
    });

    it("handler errors do not block launch", async () => {
      const handler: SuperpackHookHandler<"subagent_prompt_validate"> = async () => {
        throw new Error("boom");
      };
      const runner = createSuperpackHookRunner([
        { hookName: "subagent_prompt_validate", handler, priority: 0 },
      ]);
      const event: SubagentPromptValidateEvent = {
        agentId: "sub-1",
        parentAgentId: "main",
        systemPrompt: "prompt",
        sessionKey: "session-123",
      };
      const result = await runner.runSubagentPromptValidate(event);
      expect(result.block).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // hasHooks utility
  // -----------------------------------------------------------------------
  describe("hasHooks", () => {
    it("returns false when no handlers registered for a hook", () => {
      const runner = createSuperpackHookRunner([]);
      expect(runner.hasHooks("system_prompt_footer")).toBe(false);
    });

    it("returns true when handlers are registered", () => {
      const runner = createSuperpackHookRunner([
        {
          hookName: "system_prompt_footer",
          handler: async () => ({ append: "" }),
          priority: 0,
        },
      ]);
      expect(runner.hasHooks("system_prompt_footer")).toBe(true);
    });
  });
});
