import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * The board pane's file snapshot.
 *
 * `assets/swarm_board/app.js` and `hive.js` are written against the sidecar's
 * `/api/swarm` payload (see `assets/swarm_board/main.mjs`, `readView` and the
 * snapshot return). They read:
 *
 *   snap.view = { exists, dir, source, json, jsonMtime, jsonError,
 *                 html, htmlKey, htmlMtime, htmlError }
 *   snap.raw  = { board, members, view }
 *
 * This module produces exactly that shape from the swarm directory. It is the
 * single owner of the view/raw contract: `board-server.ts` must not assemble
 * these fields itself, and must not read the files directly.
 */

/** Same cap the sidecar applies to view.json / view.html. */
export const VIEW_MAX_BYTES = 64 * 1024;

/** Bytes of board.jsonl kept for the Raw tab (the newest posts). */
export const RAW_TAIL_BYTES = 64 * 1024;

/**
 * Hosts a narrator `url` action may open. The sidecar starts from this list and
 * appends `url_hosts.json`; this plugin ships neither that file nor narrator
 * writes, so the built-in list is the whole allowlist.
 */
export const DEFAULT_URL_HOSTS: readonly string[] = ["docs.google.com"];

export type ViewJsonError = "" | "too_large" | "invalid";
export type ViewHtmlError = "" | "too_large" | "empty";

export interface SwarmViewSnapshot {
  /** True when the narrator has written view.json or view.html. */
  exists: boolean;
  dir: string;
  source: "swarm";
  json: unknown;
  jsonMtime: number;
  jsonError: ViewJsonError;
  html: string | null;
  /** Changes exactly when view.html does, so the UI rebuilds the frame only then. */
  htmlKey: string;
  htmlMtime: number;
  htmlError: ViewHtmlError;
}

export interface SwarmRawSnapshot {
  board: string;
  members: string;
  view: string;
}

export interface SwarmFileSnapshot {
  view: SwarmViewSnapshot;
  raw: SwarmRawSnapshot;
}

interface CachedFile {
  /** File size in bytes, or -1 when the file is missing/unreadable. */
  size: number;
  /** File contents, or null when the file is missing or over the cap. */
  text: string | null;
  mtime: number;
  tooLarge: boolean;
}

const MISSING: CachedFile = { size: -1, text: null, mtime: 0, tooLarge: false };

function readCached(filePath: string, maxBytes: number): CachedFile {
  try {
    const stat = statSync(filePath);
    if (!stat.isFile()) return MISSING;
    if (stat.size > maxBytes) {
      return { size: stat.size, text: null, mtime: stat.mtimeMs, tooLarge: true };
    }
    return { size: stat.size, text: readFileSync(filePath, "utf8"), mtime: stat.mtimeMs, tooLarge: false };
  } catch {
    return MISSING;
  }
}

function readTail(filePath: string, maxBytes: number): string {
  const file = readCached(filePath, Number.MAX_SAFE_INTEGER);
  if (!file.text) return "";
  if (Buffer.byteLength(file.text, "utf8") <= maxBytes) return file.text;
  // Keep whole lines where possible; a mid-line cut only affects the first
  // visible line of the Raw tab.
  const cut = file.text.slice(file.text.length - maxBytes);
  const newline = cut.indexOf("\n");
  return newline >= 0 ? cut.slice(newline + 1) : cut;
}

function parseViewJson(file: CachedFile): { json: unknown; jsonError: ViewJsonError } {
  if (file.size < 0) return { json: null, jsonError: "" };
  if (file.tooLarge || file.text === null) return { json: null, jsonError: "too_large" };
  try {
    const parsed = JSON.parse(file.text) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return { json: parsed, jsonError: "" };
    }
    return { json: null, jsonError: "invalid" };
  } catch {
    return { json: null, jsonError: "invalid" };
  }
}

function htmlErrorOf(file: CachedFile): ViewHtmlError {
  if (file.tooLarge) return "too_large";
  if (file.size >= 0 && !(file.text ?? "").trim()) return "empty";
  return "";
}

/**
 * Read the narrator files and the raw mirrors for one swarm directory.
 *
 * Never throws: an unreadable or oversized file degrades to the error codes the
 * pane already knows how to display.
 */
export function readSwarmFileSnapshot(swarmDir: string): SwarmFileSnapshot {
  const viewJsonFile = readCached(join(swarmDir, "view.json"), VIEW_MAX_BYTES);
  const viewHtmlFile = readCached(join(swarmDir, "view.html"), VIEW_MAX_BYTES);
  const membersFile = readCached(join(swarmDir, "members.json"), VIEW_MAX_BYTES);
  const { json, jsonError } = parseViewJson(viewJsonFile);
  const htmlError = htmlErrorOf(viewHtmlFile);

  return {
    view: {
      exists: viewJsonFile.size >= 0 || viewHtmlFile.size >= 0,
      dir: swarmDir,
      source: "swarm",
      json,
      jsonMtime: viewJsonFile.size < 0 ? 0 : viewJsonFile.mtime,
      jsonError,
      html: htmlError ? null : viewHtmlFile.text,
      htmlKey: viewHtmlFile.size < 0 ? "" : `${swarmDir}|${viewHtmlFile.mtime}:${viewHtmlFile.size}`,
      htmlMtime: viewHtmlFile.size < 0 ? 0 : viewHtmlFile.mtime,
      htmlError,
    },
    raw: {
      board: readTail(join(swarmDir, "board.jsonl"), RAW_TAIL_BYTES),
      members: membersFile.text ?? "",
      view: viewJsonFile.text ?? "",
    },
  };
}
