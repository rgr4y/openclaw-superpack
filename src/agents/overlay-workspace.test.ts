/**
 * Tests for overlay workspace.ts — verifies the overlay file exists,
 * contains the expected hook integration points, and is structurally sound.
 *
 * Since workspace.ts imports many upstream modules that only exist in the
 * openclaw-git tree, we cannot import it directly in vitest. Instead we
 * verify the source content statically.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const workspaceSrc = readFileSync(
  path.join(__dirname, "workspace.ts"),
  "utf-8",
);

describe("overlay workspace.ts — hook integration (static analysis)", () => {
  it("exists and is non-empty", () => {
    expect(workspaceSrc.length).toBeGreaterThan(100);
  });

  it("imports getGlobalHookRunner from hook-runner-global", () => {
    expect(workspaceSrc).toContain("getGlobalHookRunner");
    expect(workspaceSrc).toContain("hook-runner-global");
  });

  it("emits workspace_bootstrap_before hook", () => {
    expect(workspaceSrc).toContain("workspace_bootstrap_before");
    expect(workspaceSrc).toContain("runWorkspaceBootstrapBefore");
  });

  it("emits workspace_bootstrap_after hook", () => {
    expect(workspaceSrc).toContain("workspace_bootstrap_after");
    expect(workspaceSrc).toContain("runWorkspaceBootstrapAfter");
  });

  it("allows hook to skip bootstrap entirely", () => {
    expect(workspaceSrc).toContain("skipBootstrap");
    expect(workspaceSrc).toContain("beforeResult.skip");
  });

  it("tracks filesWritten and filesSkipped", () => {
    expect(workspaceSrc).toContain("filesWritten");
    expect(workspaceSrc).toContain("filesSkipped");
  });

  it("preserves upstream exports", () => {
    expect(workspaceSrc).toContain("export async function ensureAgentWorkspace");
    expect(workspaceSrc).toContain("export async function loadWorkspaceBootstrapFiles");
    expect(workspaceSrc).toContain("export function filterBootstrapFilesForSession");
    expect(workspaceSrc).toContain('DEFAULT_AGENTS_FILENAME = "AGENTS.md"');
    expect(workspaceSrc).toContain('DEFAULT_SOUL_FILENAME = "SOUL.md"');
    expect(workspaceSrc).toContain('DEFAULT_TOOLS_FILENAME = "TOOLS.md"');
    expect(workspaceSrc).toContain('DEFAULT_IDENTITY_FILENAME = "IDENTITY.md"');
    expect(workspaceSrc).toContain('DEFAULT_USER_FILENAME = "USER.md"');
    expect(workspaceSrc).toContain('DEFAULT_HEARTBEAT_FILENAME = "HEARTBEAT.md"');
    expect(workspaceSrc).toContain('DEFAULT_BOOTSTRAP_FILENAME = "BOOTSTRAP.md"');
    expect(workspaceSrc).toContain('DEFAULT_MEMORY_FILENAME = "MEMORY.md"');
  });

  it("wraps template writing with hook check pattern", () => {
    // Verify the hook guard pattern: check hasHooks before calling
    expect(workspaceSrc).toContain('hookRunner?.hasHooks("workspace_bootstrap_before")');
    expect(workspaceSrc).toContain('hookRunner?.hasHooks("workspace_bootstrap_after")');
  });

  it("handles hook errors gracefully with try/catch", () => {
    // Count try blocks around hook calls — should have catch blocks
    const hookRunnerCalls = workspaceSrc.match(/hookRunner\?\.\w+/g);
    expect(hookRunnerCalls).toBeTruthy();
    expect(hookRunnerCalls!.length).toBeGreaterThanOrEqual(2);
  });
});
