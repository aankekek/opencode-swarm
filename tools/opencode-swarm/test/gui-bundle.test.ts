import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { SWARM_RPC_DEF } from "../src/rpc.js";

describe("OpenCode v2 GUI experimental bundle", () => {
  test("SWARM_RPC_DEF exposes Standard Schema v1 validators for all methods and events", () => {
    expect(SWARM_RPC_DEF.id).toBe("local.opencode-swarm");

    for (const [name, method] of Object.entries(SWARM_RPC_DEF.methods)) {
      expect(method.input["~standard"].version).toBe(1);
      expect(method.output["~standard"].version).toBe(1);
      if (name === "getSwarmSnapshot" || name === "listSwarms" || name === "getBoardInfo") {
        const res = method.input["~standard"].validate(undefined);
        expect("value" in res).toBe(true);
      }
    }

    const eventSchema = SWARM_RPC_DEF.events.changed.schema;
    expect(eventSchema["~standard"].version).toBe(1);
    expect("value" in eventSchema["~standard"].validate({ swarmId: "sw_1", reason: "board_post" })).toBe(true);
    expect("issues" in eventSchema["~standard"].validate({ invalid: true })).toBe(true);
  });

  test("dist/gui-experimental.cjs exists, is valid CJS, includes all surfaces, and bundles zero host modules", () => {
    const bundlePath = join(dirname(fileURLToPath(import.meta.url)), "..", "dist", "gui-experimental.cjs");
    expect(existsSync(bundlePath)).toBe(true);
    const code = readFileSync(bundlePath, "utf8");

    expect(code).toContain("use strict");
    expect(code).toContain("local.opencode-swarm");
    expect(code).toContain("getSwarmSnapshot");
    expect(code).toContain("listSwarms");
    expect(code).toContain("~standard");

    // Surfaces & registries
    expect(code).toContain("SettingsPage");
    expect(code).toContain("swarm-board");
    expect(code).toContain("Swarm Board");
    expect(code).toContain("session.panel");
    expect(code).toContain("window.bottom");
    expect(code).toContain("swarm-composer-pill");
    expect(code).toContain("swarm-open");
    expect(code).toContain("sidebarShow");
    expect(code).toContain("pillbarShow");
    expect(code).toContain("showWhenIdle");
    expect(code).toContain("composerPill");
    expect(code).toContain("bottomStrip");
    expect(code).toContain("withSidePanel");
    expect(code).toContain("toastEnabled");
    expect(code).toContain("pinned");

    // Composer pill, overlay, searchable A-Z select, onboarding, uninstall & bee branding
    expect(code).toContain("🐝 Swarm: Buzzing");
    expect(code).toContain("🐝 Swarm: Dozing");
    expect(code).toContain("🐝 Swarm Control");
    expect(code).toContain("🐝 Swarm Model Setup");
    expect(code).toContain("Search models...");
    expect(code).toContain("session-activity-chip");
    expect(code).toContain("onboardingComplete");
    expect(code).toContain("getRoleConfig");
    expect(code).toContain("setRoleModel");
    expect(code).toContain("setAutoSpawnVerifier");
    expect(code).toContain("Auto-spawn verifier");
    expect(code).toContain("previewUninstall");
    expect(code).toContain("executeUninstall");
    expect(code).toContain("Uninstall Swarm Plugin");
    expect(code).not.toContain("node:child_process");
    expect(code).not.toContain("node:fs");

    // Pixel-Bee Web View is default and only side-tab body
    expect(code).toContain("swarm-gui-iframe");
    expect(code).toContain("swarm:theme");
    expect(code).toContain("swarm:open_session");
    expect(code).toContain("session.tool.success");
    expect(code).not.toContain("Pixel-Bee Web View");

    // Zero bundled host modules
    expect(code).not.toContain("@opencode/ui");
    expect(code).not.toContain("node:sqlite");
    expect(code).not.toContain("better-sqlite3");
  });
});
