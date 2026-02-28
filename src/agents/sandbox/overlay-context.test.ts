/**
 * Tests for overlay context.ts — verifies the sandbox_workspace_ready
 * hook integration point exists and follows the overlay pattern.
 * Static analysis only (can't import upstream deps in vitest).
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const contextSrc = readFileSync(
  path.join(__dirname, "context.ts"),
  "utf-8",
);

describe("overlay context.ts — sandbox_workspace_ready hook (static analysis)", () => {
  it("exists and is non-empty", () => {
    expect(contextSrc.length).toBeGreaterThan(100);
  });

  it("imports getGlobalHookRunner", () => {
    expect(contextSrc).toContain("getGlobalHookRunner");
  });

  it("calls runSandboxWorkspaceReady", () => {
    expect(contextSrc).toContain("runSandboxWorkspaceReady");
  });

  it("hook call appears after ensureSandboxWorkspace and syncSkillsToWorkspace", () => {
    const ensureIdx = contextSrc.indexOf("ensureSandboxWorkspace(");
    const syncIdx = contextSrc.indexOf("syncSkillsToWorkspace(");
    const hookIdx = contextSrc.indexOf("runSandboxWorkspaceReady(");
    const containerIdx = contextSrc.indexOf("ensureSandboxContainer(");
    expect(ensureIdx).toBeGreaterThan(-1);
    expect(syncIdx).toBeGreaterThan(-1);
    expect(hookIdx).toBeGreaterThan(-1);
    expect(containerIdx).toBeGreaterThan(-1);
    // Hook fires after workspace setup, before container
    expect(hookIdx).toBeGreaterThan(syncIdx);
    expect(hookIdx).toBeLessThan(containerIdx);
  });

  it("guards hook call with hasHooks check", () => {
    expect(contextSrc).toContain('hasHooks("sandbox_workspace_ready")');
  });

  it("wraps hook call in try/catch", () => {
    const hookIdx = contextSrc.indexOf("runSandboxWorkspaceReady");
    const surroundingCode = contextSrc.slice(Math.max(0, hookIdx - 200), hookIdx + 400);
    expect(surroundingCode).toContain("try");
    expect(surroundingCode).toContain("catch");
  });

  it("preserves upstream exports", () => {
    expect(contextSrc).toContain("export async function resolveSandboxContext");
    expect(contextSrc).toContain("export async function ensureSandboxWorkspaceForSession");
    expect(contextSrc).toContain("export async function resolveSandboxDockerUser");
  });
});
