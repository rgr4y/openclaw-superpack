# openclaw-superpack

**Power toys for openclaw.** The stuff that should ship but hasn't yet.

Superpack sits on top of your openclaw install and gives you the knobs, hooks, and diagnostics that power users have been asking for. Think of it like Windows PowerToys — your OS works fine without it, but once you've had it, you can't go back.

Zero patches. Zero forks. Just build-time overlays that snap in clean.

## What you get

- **6 new plugin hooks** — filter tools, rewrite skills prompts, append to system prompts, control workspace bootstrap, validate subagent launches. All wired into the standard `api.on()` interface.
- **Workspace bootstrap control** — finally stop openclaw from dumping template `.md` files you don't want. Filter them, modify them, or skip the whole thing.
- **Diagnostic flags** — `SUPERPACK_FLAGS=dump_system_prompt` and friends. See exactly what's going into your prompts, tools, hooks, and LLM calls. Presets like `debug_all` for when you just want to see everything.
- **Full overlay system** — replace any upstream file at build time. Your customizations, upstream's everything-else.

## Quick start

```bash
# Build (outputs to /opt/openclaw-git/dist/)
bun /opt/openclaw-superpack/build.ts

# Build + re-link global openclaw binary
cd /opt/openclaw-superpack && pnpm run link

# Watch mode — rebuild on save
bun /opt/openclaw-superpack/build.ts --watch

# Run the tests
npx vitest run
```

## Hooks

Register them the normal way in any openclaw plugin:

```ts
api.on("workspace_bootstrap_before", (event) => {
  // Kill the files you don't want
  return {
    files: event.files.filter(f => f.name !== "HEARTBEAT.md"),
    skip: false,
  };
});

api.on("system_prompt_footer", (event) => {
  return { append: "\n\n## House Rules\nNo yapping." };
});
```

| Hook | What it does |
|------|-------------|
| `system_prompt_tools_filter` | Filter/reorder the tool list before prompt assembly |
| `system_prompt_skills_filter` | Modify the skills prompt section |
| `system_prompt_footer` | Append content to the system prompt |
| `workspace_bootstrap_before` | Filter, modify, or skip template files before they're written |
| `workspace_bootstrap_after` | Get notified what was written/skipped |
| `subagent_prompt_validate` | Block subagent launches based on prompt content |

## Diagnostic flags

```bash
# See the full system prompt every time it builds
SUPERPACK_FLAGS=dump_system_prompt openclaw gateway run

# Go nuclear
SUPERPACK_PRESET=debug_all openclaw gateway run

# Mix and match
SUPERPACK_FLAGS=dump_tool_calls,dump_hook_events openclaw gateway run
```

Presets: `debug_prompts`, `debug_tools`, `debug_workspace`, `debug_hooks`, `debug_llm`, `debug_all`

## Adding your own overlays

Drop a file in `src/` mirroring the upstream path, then register it in `build.ts`:

```ts
const OVERLAY_ALIASES: Record<string, string> = {
  [path.join(UPSTREAM, "src/whatever/thing.ts")]: path.join(OVERLAY, "src/whatever/thing.ts"),
};
```

Upstream stays untouched. Your overlay fully replaces that module at build time.

## Keeping up with upstream

```bash
cd /opt/openclaw-git && git pull
# Check if overlaid files changed
git diff HEAD~1 -- src/agents/system-prompt.ts src/plugins/types.ts src/plugins/hooks.ts src/agents/workspace.ts
# If yes, review and absorb changes into your overlays
bun /opt/openclaw-superpack/build.ts
```
