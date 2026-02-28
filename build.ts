/**
 * openclaw-superpack build script
 *
 * Builds openclaw with overlay files injected via a rolldown plugin.
 * Patches the upstream tsdown.config.ts at runtime by prepending a plugin;
 * does not copy or modify any upstream files.
 *
 * Paths are configured via env vars (or edit the defaults below):
 *   OPENCLAW_UPSTREAM  — path to your openclaw-git checkout
 *   OPENCLAW_SUPERPACK — path to this superpack checkout
 *
 * Usage:
 *   pnpm build          # or: node --import tsx build.ts
 *   pnpm watch          # or: node --import tsx build.ts --watch
 */

import { spawn } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const UPSTREAM = process.env.OPENCLAW_UPSTREAM ?? "/opt/openclaw-git";
const OVERLAY = process.env.OPENCLAW_SUPERPACK ?? __dirname;

// ---------------------------------------------------------------------------
// Overlay map: add entries here to shadow more upstream files
// ---------------------------------------------------------------------------
const OVERLAY_ALIASES: Record<string, string> = {
  [path.join(UPSTREAM, "src/agents/system-prompt.ts")]: path.join(
    OVERLAY,
    "src/agents/system-prompt.ts",
  ),
  [path.join(UPSTREAM, "src/plugins/types.ts")]: path.join(
    OVERLAY,
    "src/plugins/types.ts",
  ),
  [path.join(UPSTREAM, "src/plugins/hooks.ts")]: path.join(
    OVERLAY,
    "src/plugins/hooks.ts",
  ),
  [path.join(UPSTREAM, "src/agents/workspace.ts")]: path.join(
    OVERLAY,
    "src/agents/workspace.ts",
  ),
};

const args = process.argv.slice(2);
const watch = args.includes("--watch");

// ---------------------------------------------------------------------------
// Generate a wrapper tsdown config that wraps the upstream one.
// Written into UPSTREAM root so all relative paths and node_modules resolve.
// ---------------------------------------------------------------------------
const aliasJson = JSON.stringify(
  Object.entries(OVERLAY_ALIASES).map(([find, replacement]) => ({ find, replacement })),
);

const tmpConfig = `
import baseConfigs from "./tsdown.config.ts";
import path from "node:path";

const aliases = ${aliasJson};
const OVERLAY_DIR = ${JSON.stringify(OVERLAY)};
const UPSTREAM_DIR = ${JSON.stringify(UPSTREAM)};

// Build a reverse map: overlay replacement path -> upstream original path
const reverseMap = {};
for (const { find, replacement } of aliases) {
  reverseMap[replacement] = find;
}

/** Rolldown plugin that redirects overlay files at resolve time */
const overlayPlugin = {
  name: "superpack-overlay",
  resolveId(id, importer) {
    // 1. Check if the resolved absolute path matches an overlay target
    for (const { find, replacement } of aliases) {
      if (id === find) return replacement;
      if (importer && id.startsWith(".")) {
        const abs = path.resolve(path.dirname(importer), id);
        // rolldown hands us the .ts path directly
        if (abs === find) return replacement;
        // sometimes the import uses .js extension mapping to .ts
        const asTs = abs.replace(/\\.js$/, ".ts");
        if (asTs === find) return replacement;
      }
    }

    // 2. When importing FROM an overlay file, resolve relative imports
    //    against the upstream directory so non-overlaid siblings resolve.
    if (importer && id.startsWith(".") && importer.startsWith(OVERLAY_DIR + "/")) {
      // Map the importer back to its upstream counterpart directory
      const relFromOverlay = path.relative(OVERLAY_DIR, importer);
      const upstreamImporter = path.join(UPSTREAM_DIR, relFromOverlay);
      let resolved = path.resolve(path.dirname(upstreamImporter), id);
      // Map .js imports to .ts source files (rolldown resolves .ts files)
      resolved = resolved.replace(/\\.js$/, ".ts");
      return resolved;
    }

    return undefined;
  },
};

const configs = Array.isArray(baseConfigs) ? baseConfigs : [baseConfigs];

export default configs.map((cfg) => ({
  ...cfg,
  plugins: [overlayPlugin, ...(cfg.plugins ?? [])],
}));
`;

const tmpConfigPath = path.join(UPSTREAM, "tsdown.superpack.config.ts");
writeFileSync(tmpConfigPath, tmpConfig);

console.log("openclaw-superpack: building with overlay");
for (const [from, to] of Object.entries(OVERLAY_ALIASES)) {
  console.log(`  ${path.relative(UPSTREAM, from)} → ${path.relative(OVERLAY, to)}`);
}

const cmd = ["pnpm", "exec", "tsdown", "--config", "tsdown.superpack.config.ts", ...(watch ? ["--watch"] : [])];

const proc = spawn(cmd[0], cmd.slice(1), {
  cwd: UPSTREAM,
  stdio: "inherit",
  env: { ...process.env },
});

proc.on("exit", (code) => process.exit(code ?? 0));
