# `sandbox_workspace_ready` Hook Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a `sandbox_workspace_ready` superpack hook that fires after workspace bootstrap + skill sync but before Docker container starts, giving plugins a clean point to inject files into sandbox workdirs.

**Architecture:** New overlay of `src/agents/sandbox/context.ts` that inserts a hook call into `ensureSandboxWorkspaceLayout()`. Types and runner added to existing overlay files. Sequential void hook — handlers run one at a time, fully awaited, errors caught per-handler.

**Tech Stack:** TypeScript, superpack overlay system, vitest for tests.

---

### Task 1: Add hook types to `superpack-hooks.ts`

**Files:**
- Modify: `/Volumes/opt/openclaw-superpack/src/plugins/superpack-hooks.ts`

**Step 1: Write the failing test**

Add to `/Volumes/opt/openclaw-superpack/src/plugins/superpack-hooks.test.ts`:

```typescript
it("includes sandbox_workspace_ready in SuperpackHookName", async () => {
  const src = readFileSync(
    path.join(__dirname, "superpack-hooks.ts"),
    "utf-8",
  );
  expect(src).toContain('"sandbox_workspace_ready"');
});
```

**Step 2: Run test to verify it fails**

Run: `ssh claw-rob 'cd /opt/openclaw-superpack && npx vitest run src/plugins/superpack-hooks.test.ts'`
Expected: FAIL — `"sandbox_workspace_ready"` not found in source

**Step 3: Add the types**

In `superpack-hooks.ts`:

1. Add `"sandbox_workspace_ready"` to `SuperpackHookName` union
2. Add event type after the `WorkspaceBootstrapAfterEvent` block:

```typescript
// sandbox_workspace_ready (sequential void — fires before Docker starts)
export type SandboxWorkspaceReadyEvent = {
  workspaceDir: string;
  agentWorkspaceDir: string;
  agentId: string;
  sessionKey: string;
  scopeKey: string;
};
```

3. Add handler to `HandlerMap`:

```typescript
sandbox_workspace_ready: (
  event: SandboxWorkspaceReadyEvent,
) => Promise<void> | void;
```

4. Add `runSandboxWorkspaceReady` to `createSuperpackHookRunner`:

```typescript
// -- Sequential void: sandbox workspace ready --
async function runSandboxWorkspaceReady(
  event: SandboxWorkspaceReadyEvent,
): Promise<void> {
  const hooks = getHooks(registrations, "sandbox_workspace_ready");
  for (const hook of hooks) {
    try {
      await hook.handler(event);
    } catch {
      // Error: swallow, don't block container creation
    }
  }
}
```

5. Add `runSandboxWorkspaceReady` to the return object.

**Step 4: Run test to verify it passes**

Run: `ssh claw-rob 'cd /opt/openclaw-superpack && npx vitest run src/plugins/superpack-hooks.test.ts'`
Expected: PASS

**Step 5: Commit**

```bash
cd /Volumes/opt/openclaw-superpack && sleep 1 && git add src/plugins/superpack-hooks.ts src/plugins/superpack-hooks.test.ts && git commit -m "feat: add sandbox_workspace_ready types to superpack-hooks"
```

---

### Task 2: Add hook types to overlay `types.ts`

**Files:**
- Modify: `/Volumes/opt/openclaw-superpack/src/plugins/types.ts`

**Step 1: Write the failing test**

Add to `/Volumes/opt/openclaw-superpack/src/plugins/overlay-types.test.ts`:

```typescript
it("defines PluginHookSandboxWorkspaceReadyEvent type", () => {
  expect(typesSrc).toContain("PluginHookSandboxWorkspaceReadyEvent");
  expect(typesSrc).toContain("sandbox_workspace_ready");
});
```

**Step 2: Run test to verify it fails**

Run: `ssh claw-rob 'cd /opt/openclaw-superpack && npx vitest run src/plugins/overlay-types.test.ts'`
Expected: FAIL

**Step 3: Add types to overlay types.ts**

1. Add `| "sandbox_workspace_ready"` to the `PluginHookName` union (after `"subagent_prompt_validate"`)

2. Add event type after the subagent_prompt_validate types block:

```typescript
// sandbox_workspace_ready hook (sequential void — fires before Docker container starts)
export type PluginHookSandboxWorkspaceReadyEvent = {
  workspaceDir: string;
  agentWorkspaceDir: string;
  agentId: string;
  sessionKey: string;
  scopeKey: string;
};
```

3. Add to `PluginHookHandlerMap`:

```typescript
sandbox_workspace_ready: (
  event: PluginHookSandboxWorkspaceReadyEvent,
  ctx: PluginHookAgentContext,
) => Promise<void> | void;
```

**Step 4: Run test to verify it passes**

Run: `ssh claw-rob 'cd /opt/openclaw-superpack && npx vitest run src/plugins/overlay-types.test.ts'`
Expected: PASS

**Step 5: Commit**

```bash
cd /Volumes/opt/openclaw-superpack && sleep 1 && git add src/plugins/types.ts src/plugins/overlay-types.test.ts && git commit -m "feat: add sandbox_workspace_ready to overlay types"
```

---

### Task 3: Add `runSandboxWorkspaceReady` to overlay `hooks.ts`

**Files:**
- Modify: `/Volumes/opt/openclaw-superpack/src/plugins/hooks.ts`
- Modify: `/Volumes/opt/openclaw-superpack/src/plugins/overlay-hooks.test.ts`

**Step 1: Write the failing test**

Add to `overlay-hooks.test.ts`:

```typescript
it("returns runner with runSandboxWorkspaceReady method", () => {
  const runner = createHookRunner(makeEmptyRegistry());
  expect(typeof runner.runSandboxWorkspaceReady).toBe("function");
});

it("runSandboxWorkspaceReady returns undefined when no hooks registered", async () => {
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

it("runSandboxWorkspaceReady calls handlers sequentially", async () => {
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

  const runner = createHookRunner(makeEmptyRegistry());
  // Need to use registry with hooks
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
```

**Step 2: Run test to verify it fails**

Run: `ssh claw-rob 'cd /opt/openclaw-superpack && npx vitest run src/plugins/overlay-hooks.test.ts'`
Expected: FAIL — `runSandboxWorkspaceReady` is not a function

**Step 3: Add the runner method to hooks.ts**

1. Add import of `PluginHookSandboxWorkspaceReadyEvent` to the import block (line 62-63 area)

2. Add re-export of the type (line 118-119 area)

3. Add runner method in the Superpack Hooks section (after `runSubagentPromptValidate`):

```typescript
/**
 * Run sandbox_workspace_ready hook.
 * Fires after workspace bootstrap and skill sync, before Docker container starts.
 * Runs sequentially — each handler is awaited before the next.
 * Handlers perform fs side-effects directly (void return).
 */
async function runSandboxWorkspaceReady(
  event: PluginHookSandboxWorkspaceReadyEvent,
  ctx: PluginHookAgentContext,
): Promise<void> {
  const hooks = getHooksForName(registry, "sandbox_workspace_ready");
  if (hooks.length === 0) {
    return;
  }

  logger?.debug?.(`[hooks] running sandbox_workspace_ready (${hooks.length} handlers, sequential)`);

  for (const hook of hooks) {
    try {
      await (hook.handler as (event: unknown, ctx: unknown) => Promise<void>)(event, ctx);
    } catch (err) {
      handleHookError({ hookName: "sandbox_workspace_ready", pluginId: hook.pluginId, error: err });
    }
  }
}
```

4. Add `runSandboxWorkspaceReady` to the return object (line 911 area, after `runSubagentPromptValidate`)

5. Update the startup banner `SUPERPACK_HOOKS` array (line 710) to include `"sandbox_workspace_ready"` and update the count.

**Step 4: Run test to verify it passes**

Run: `ssh claw-rob 'cd /opt/openclaw-superpack && npx vitest run src/plugins/overlay-hooks.test.ts'`
Expected: PASS

**Step 5: Commit**

```bash
cd /Volumes/opt/openclaw-superpack && sleep 1 && git add src/plugins/hooks.ts src/plugins/overlay-hooks.test.ts && git commit -m "feat: add runSandboxWorkspaceReady to hook runner"
```

---

### Task 4: Create context.ts overlay

**Files:**
- Create: `/Volumes/opt/openclaw-superpack/src/agents/sandbox/context.ts`
- Modify: `/Volumes/opt/openclaw-superpack/build.ts` (add to OVERLAY_ALIASES)

**Step 1: Write the failing test**

Create `/Volumes/opt/openclaw-superpack/src/agents/sandbox/overlay-context.test.ts`:

```typescript
/**
 * Tests for overlay context.ts — verifies the sandbox_workspace_ready
 * hook integration point exists and follows the overlay pattern.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

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
    // Verify there's error handling around the hook
    const hookIdx = contextSrc.indexOf("runSandboxWorkspaceReady");
    const surroundingCode = contextSrc.slice(Math.max(0, hookIdx - 200), hookIdx + 200);
    expect(surroundingCode).toContain("try");
    expect(surroundingCode).toContain("catch");
  });

  it("preserves upstream exports", () => {
    expect(contextSrc).toContain("export async function resolveSandboxContext");
    expect(contextSrc).toContain("export async function ensureSandboxWorkspaceForSession");
    expect(contextSrc).toContain("export async function resolveSandboxDockerUser");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `ssh claw-rob 'cd /opt/openclaw-superpack && npx vitest run src/agents/sandbox/overlay-context.test.ts'`
Expected: FAIL — context.ts doesn't exist in overlay yet

**Step 3: Create the overlay and update build.ts**

1. Copy `/Volumes/opt/openclaw-git/src/agents/sandbox/context.ts` to `/Volumes/opt/openclaw-superpack/src/agents/sandbox/context.ts`

2. Add the import at the top:

```typescript
import { getGlobalHookRunner } from "../../plugins/hook-runner-global.js";
```

3. In `ensureSandboxWorkspaceLayout()`, after the skill sync block (after line 62 in the upstream file) and before the `return` statement, add:

```typescript
    // Superpack: sandbox_workspace_ready hook — let plugins inject files
    const hookRunner = getGlobalHookRunner();
    if (hookRunner?.hasHooks("sandbox_workspace_ready")) {
      try {
        await hookRunner.runSandboxWorkspaceReady(
          {
            workspaceDir: sandboxWorkspaceDir,
            agentWorkspaceDir,
            agentId: resolveAgentIdFromSessionKey(rawSessionKey),
            sessionKey: rawSessionKey,
            scopeKey,
          },
          { agentId: resolveAgentIdFromSessionKey(rawSessionKey) },
        );
      } catch {
        // Hook error: don't block sandbox creation
      }
    }
```

4. Add the import for `resolveAgentIdFromSessionKey`:

```typescript
import { resolveAgentIdFromSessionKey } from "../../routing/session-key.js";
```

5. Update `build.ts` — add to `OVERLAY_ALIASES`:

```typescript
[path.join(UPSTREAM, "src/agents/sandbox/context.ts")]: path.join(
  OVERLAY,
  "src/agents/sandbox/context.ts",
),
```

**Step 4: Run test to verify it passes**

Run: `ssh claw-rob 'cd /opt/openclaw-superpack && npx vitest run src/agents/sandbox/overlay-context.test.ts'`
Expected: PASS

**Step 5: Commit**

```bash
cd /Volumes/opt/openclaw-superpack && sleep 1 && git add src/agents/sandbox/context.ts src/agents/sandbox/overlay-context.test.ts build.ts && git commit -m "feat: overlay context.ts with sandbox_workspace_ready hook"
```

---

### Task 5: Update startup banner count

**Files:**
- Modify: `/Volumes/opt/openclaw-superpack/src/plugins/hooks.ts`
- Modify: `/Volumes/opt/openclaw-superpack/src/plugins/overlay-hooks.test.ts`

**Step 1: Update banner test**

In `overlay-hooks.test.ts`, update the existing banner tests:
- Change `"0/6 hooks active"` to `"0/7 hooks active"`
- Change `"2/6 hooks active"` to `"2/7 hooks active"`
- Add `expect(warnMessages[0]).toContain("○ sandbox_workspace_ready");` to the empty registry banner test

**Step 2: Run test to verify it fails**

Run: `ssh claw-rob 'cd /opt/openclaw-superpack && npx vitest run src/plugins/overlay-hooks.test.ts'`
Expected: FAIL — banner still says 6

**Step 3: Update the banner array**

In `hooks.ts`, add `"sandbox_workspace_ready"` to the `SUPERPACK_HOOKS` array (line 710-717 area).

**Step 4: Run test to verify it passes**

Run: `ssh claw-rob 'cd /opt/openclaw-superpack && npx vitest run src/plugins/overlay-hooks.test.ts'`
Expected: PASS

**Step 5: Commit**

```bash
cd /Volumes/opt/openclaw-superpack && sleep 1 && git add src/plugins/hooks.ts src/plugins/overlay-hooks.test.ts && git commit -m "feat: bump startup banner to 7 hooks"
```

---

### Task 6: Build and verify on server

**Step 1: Run all tests**

Run: `ssh claw-rob 'cd /opt/openclaw-superpack && npx vitest run'`
Expected: All tests pass

**Step 2: Build**

Run: `ssh claw-rob 'cd /opt/openclaw-superpack && pnpm build'`
Expected: Build succeeds without errors

**Step 3: Restart and verify banner**

Run: `ssh claw-rob 'sudo systemctl restart openclaw'`
Then check logs for: `[superpack] loaded — 0/7 hooks active` with `○ sandbox_workspace_ready` in the list.

**Step 4: Squash commits**

```bash
cd /Volumes/opt/openclaw-superpack && sleep 1 && git reset --soft HEAD~5 && git commit -m "feat: add sandbox_workspace_ready hook

New superpack hook that fires after workspace bootstrap and skill sync
but before Docker container starts. Gives plugins a clean insertion point
to inject arbitrary files into sandbox workdirs.

- New overlay: src/agents/sandbox/context.ts
- Sequential void execution model (no parallelism, fully awaited)
- Event provides workspaceDir, agentId, sessionKey, scopeKey
- Startup banner bumped to 7 hooks

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```
