# openclaw-superpack

Overlay project for [openclaw](https://github.com/openclaw/openclaw).

Selectively replaces upstream source files at build time via rollup aliases injected into tsdown.
The upstream repo at `/opt/openclaw-git` is untouched — only the built output in its `dist/` changes.

## Structure

```
openclaw-superpack/
  src/
    agents/
      system-prompt.ts   ← replaces upstream src/agents/system-prompt.ts
  build.ts               ← build script (injects aliases, runs tsdown in openclaw-git)
  package.json
```

## Workflow

```bash
# Build (outputs to /opt/openclaw-git/dist/)
bun /opt/openclaw-superpack/build.ts

# Build + re-link global openclaw binary
cd /opt/openclaw-superpack && pnpm run link

# Watch mode
bun /opt/openclaw-superpack/build.ts --watch
```

## Adding more overlays

Edit `OVERLAY_ALIASES` in `build.ts`:

```ts
const OVERLAY_ALIASES: Record<string, string> = {
  [path.join(UPSTREAM, "src/agents/system-prompt.ts")]: path.join(OVERLAY, "src/agents/system-prompt.ts"),
  [path.join(UPSTREAM, "src/some/other.ts")]:           path.join(OVERLAY, "src/some/other.ts"),
};
```

## Merging upstream

1. `cd /opt/openclaw-git && git pull upstream main && git push origin main`
2. Check if any overlaid files changed upstream: `git diff HEAD~1 src/agents/system-prompt.ts`
3. If yes, review upstream changes and decide what to absorb into your overlay
4. Rebuild: `bun /opt/openclaw-superpack/build.ts`
