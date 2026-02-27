import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { flag, setConfigFlags, resetFlags, activeFlags_, ALL_FLAG_NAMES } from "./flags.js";

describe("feature flags", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    resetFlags();
    delete process.env.SUPERPACK_FLAGS;
    delete process.env.SUPERPACK_PRESET;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    resetFlags();
    setConfigFlags([], undefined);
  });

  describe("env: SUPERPACK_FLAGS", () => {
    it("enables a single flag", () => {
      process.env.SUPERPACK_FLAGS = "dump_system_prompt";
      expect(flag("dump_system_prompt")).toBe(true);
      expect(flag("dump_tool_resolution")).toBe(false);
    });

    it("enables multiple comma-separated flags", () => {
      process.env.SUPERPACK_FLAGS = "dump_system_prompt, dump_tool_resolution";
      expect(flag("dump_system_prompt")).toBe(true);
      expect(flag("dump_tool_resolution")).toBe(true);
      expect(flag("dump_llm_payload")).toBe(false);
    });

    it("ignores invalid flag names", () => {
      process.env.SUPERPACK_FLAGS = "dump_system_prompt,not_a_real_flag";
      expect(flag("dump_system_prompt")).toBe(true);
      expect(activeFlags_()).toHaveLength(1);
    });
  });

  describe("env: SUPERPACK_PRESET", () => {
    it("debug_prompts enables prompt-related flags", () => {
      process.env.SUPERPACK_PRESET = "debug_prompts";
      expect(flag("dump_system_prompt")).toBe(true);
      expect(flag("dump_bootstrap_files")).toBe(true);
      expect(flag("dump_skills_resolution")).toBe(true);
      expect(flag("dump_subagent_prompt")).toBe(true);
      // Not in preset
      expect(flag("dump_tool_calls")).toBe(false);
    });

    it("debug_all enables every flag", () => {
      process.env.SUPERPACK_PRESET = "debug_all";
      for (const name of ALL_FLAG_NAMES) {
        expect(flag(name)).toBe(true);
      }
    });

    it("debug_workspace enables workspace flags", () => {
      process.env.SUPERPACK_PRESET = "debug_workspace";
      expect(flag("dump_bootstrap_files")).toBe(true);
      expect(flag("dump_sandbox_copy")).toBe(true);
      expect(flag("dump_template_writes")).toBe(true);
      expect(flag("dump_system_prompt")).toBe(false);
    });

    it("ignores invalid preset name", () => {
      process.env.SUPERPACK_PRESET = "fake_preset";
      expect(activeFlags_()).toHaveLength(0);
    });
  });

  describe("env + config merge", () => {
    it("env flags are additive to config flags", () => {
      setConfigFlags(["dump_tool_calls"], undefined);
      process.env.SUPERPACK_FLAGS = "dump_system_prompt";
      expect(flag("dump_tool_calls")).toBe(true);
      expect(flag("dump_system_prompt")).toBe(true);
    });

    it("env preset is additive to config flags", () => {
      setConfigFlags(["dump_llm_payload"], undefined);
      process.env.SUPERPACK_PRESET = "debug_workspace";
      expect(flag("dump_llm_payload")).toBe(true);
      expect(flag("dump_sandbox_copy")).toBe(true);
    });

    it("config preset enables its flags", () => {
      setConfigFlags([], "debug_hooks");
      expect(flag("dump_hook_events")).toBe(true);
      expect(flag("dump_hook_timing")).toBe(true);
      expect(flag("dump_system_prompt")).toBe(false);
    });
  });

  describe("resetFlags", () => {
    it("clears cached state so flags re-resolve", () => {
      process.env.SUPERPACK_FLAGS = "dump_system_prompt";
      expect(flag("dump_system_prompt")).toBe(true);
      delete process.env.SUPERPACK_FLAGS;
      resetFlags();
      expect(flag("dump_system_prompt")).toBe(false);
    });
  });
});
