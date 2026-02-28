# Design: `sandbox_workspace_ready` hook

**Date:** 2026-02-28
**Status:** Approved

## Problem

Plugins need to inject arbitrary files into a sandbox agent's working directory
before the Docker container starts. Current hooks (`workspace_bootstrap_before`,
`workspace_bootstrap_after`) fire during generic workspace creation and are
limited to the 6 standard template files. There is no hook point specific to
sandbox workdir setup.

Use cases:
- Coordinator writes run inputs to a staging area; hook copies them into the
  sandbox before the subagent boots.
- Plugin injects config, credentials, or scaffolding into the sandbox.
- Plugin removes or modifies files synced by `syncSkillsToWorkspace`.

## Design

### Hook name

`sandbox_workspace_ready`

### Insertion point

Inside `ensureSandboxWorkspaceLayout()` in `src/agents/sandbox/context.ts`,
after workspace creation and skill sync, before container creation:

```
await ensureSandboxWorkspace()       // bootstrap files written to disk
await syncSkillsToWorkspace()        // skills copied
await runSandboxWorkspaceReady()     // NEW — plugins write files here
// ── nothing else touches workspaceDir after this ──
await ensureSandboxContainer()       // Docker starts
```

### Event payload

```typescript
type SandboxWorkspaceReadyEvent = {
  workspaceDir: string;       // sandbox workdir (where to write files)
  agentWorkspaceDir: string;  // main agent workspace (source of truth)
  agentId: string;            // e.g. "code-only"
  sessionKey: string;         // e.g. "agent:main:subagent:code-only:abc123"
  scopeKey: string;           // sandbox scope key
  isNewWorkspace: boolean;    // first creation of this sandbox dir
};
```

### Execution model

**Strictly sequential, fully awaited, no parallelism.**

- Handlers run one at a time in priority order (highest first).
- Each handler is `await`ed before the next runs.
- The entire hook call is `await`ed before `ensureSandboxContainer()`.
- Docker **cannot** start until every handler has completed.
- Errors are caught and logged per-handler; a failing handler does not block
  subsequent handlers or container creation.

This is the same execution model as `workspace_bootstrap_before`.

### Return type

`void` — handlers perform side effects (fs writes) directly. No return value.

### Implementation changes

1. **New overlay file:** `src/agents/sandbox/context.ts`
   - Copy upstream, insert `runSandboxWorkspaceReady()` call
   - Add to `OVERLAY_ALIASES` in `build.ts`

2. **Hook types:** Add to `superpack-hooks.ts` and overlay `types.ts`
   - `SandboxWorkspaceReadyEvent` type
   - Handler signature in `HandlerMap`
   - Add `"sandbox_workspace_ready"` to `SuperpackHookName`

3. **Hook runner:** Add `runSandboxWorkspaceReady` to overlay `hooks.ts`
   - Sequential void runner (like `workspace_bootstrap_before` minus the
     return value)

4. **Startup banner:** Bump from 6 to 7 hooks.

5. **Tests:** Static analysis test for the context.ts overlay (same pattern
   as `overlay-workspace.test.ts`). Unit tests in `overlay-hooks.test.ts`
   for the runner method.

### What this does NOT provide

- No file staging convention — that's a plugin concern, not a hook concern.
- No automatic cleanup — plugins manage their own lifecycle.
- No skill filtering — configure `agents.<id>.skills` in config instead.

## Alternatives considered

**Extend `workspace_bootstrap_before`:** Would require removing the `pathMap`
filter that restricts injected files to known template names. Also fires for
all workspace creation (not just sandbox), lacks sandbox context (no agentId,
sessionKey), and uses `writeFileIfMissing` (can't overwrite).

**Use `workspace_bootstrap_after` as-is:** Already fires with `workspaceDir`
and is awaited. But lacks sandbox-specific context and fires for every
workspace, not just sandboxes. Timing is OK but semantics are wrong.
