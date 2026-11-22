import { existsSync, lstatSync, readlinkSync, realpathSync } from "node:fs";
import { dirname, extname, isAbsolute, relative, resolve } from "node:path";
import type { PermissionEffect } from "./types.js";

const PROTECTED_TOP_DIRS = new Set([".git", ".opencode", "node_modules"]);
const IS_WINDOWS = process.platform === "win32";

/**
 * Antigravity member name rules:
 * lowercase, starts with [a-z0-9], up to 24 chars of [a-z0-9_-],
 * cannot be all, everyone, coordinator, or coordinator-*.
 */
export function validateMemberName(raw: string, role?: string): string {
  const cleaned = raw.trim().replace(/^@+/, "").toLowerCase();
  if (!/^[a-z0-9][a-z0-9_-]{0,23}$/.test(cleaned)) {
    throw new Error(
      `Invalid member name "${raw}". Must be lowercase, start with a letter or digit, and be 1-24 chars of a-z, 0-9, -, _.`,
    );
  }
  if (
    cleaned === "all" ||
    cleaned === "everyone" ||
    cleaned === "coordinator" ||
    cleaned.startsWith("coordinator-")
  ) {
    throw new Error(`Reserved member name "${raw}" cannot be used for a worker.`);
  }
  if ((cleaned === "verifier" || cleaned === "monitor" || cleaned === "narrator") && role && role !== cleaned) {
    throw new Error(`Reserved role name "${raw}" can only be used with role "${cleaned}".`);
  }
  return cleaned;
}

export function normalizeHandle(raw: string): string {
  const cleaned = raw
    .trim()
    .toLowerCase()
    .replace(/^@+/, "")
    .replace(/[^a-z0-9_-]/g, "-");
  if (!cleaned) {
    throw new Error(`Invalid swarm handle: "${raw}"`);
  }
  return cleaned;
}

export function isProtectedRepoPath(repoRelPath: string): boolean {
  const norm = repoRelPath.replace(/\\/g, "/").replace(/^\.\//, "");
  const firstSegment = (norm.split("/")[0] ?? "").toLowerCase();
  return PROTECTED_TOP_DIRS.has(firstSegment);
}

function resolveCanonicalAncestor(targetAbs: string): string {
  let cursor = targetAbs;
  const suffixParts: string[] = [];
  while (true) {
    try {
      const st = lstatSync(cursor);
      if (st.isSymbolicLink()) {
        try {
          const real = realpathSync(cursor);
          return suffixParts.length > 0 ? resolve(real, ...suffixParts) : real;
        } catch {
          // Dangling symlink: resolve link destination
          const target = readlinkSync(cursor);
          const resolvedTarget = isAbsolute(target) ? resolve(target) : resolve(dirname(cursor), target);
          return suffixParts.length > 0 ? resolve(resolvedTarget, ...suffixParts) : resolvedTarget;
        }
      }
      // It exists and is not a symlink
      const real = realpathSync(cursor);
      return suffixParts.length > 0 ? resolve(real, ...suffixParts) : real;
    } catch {
      // cursor does not exist or lstat failed; move up
      const parent = dirname(cursor);
      if (parent === cursor) break;
      suffixParts.unshift(relative(parent, cursor));
      cursor = parent;
    }
  }
  // If we walked to filesystem root and nothing exists, return targetAbs
  return targetAbs;
}

/**
 * Resolves a path strictly inside canonicalWorkspaceRoot.
 * Rejects NUL bytes, UNC paths, external drives, `..` traversal, symlink escapes,
 * and protected internal directories (.git, .opencode, node_modules).
 */
export function resolveSafeWorkspacePath(canonicalWorkspaceRoot: string, rawPath: string): string {
  if (!rawPath || rawPath.includes("\0")) {
    throw new Error(`[SWARM SECURITY] Invalid file path.`);
  }
  const trimmed = rawPath.trim();
  if (/^(\\\\|\/\/)/.test(trimmed)) {
    throw new Error(`[SWARM SECURITY] UNC network paths are blocked: "${trimmed}"`);
  }

  const candidateAbs = isAbsolute(trimmed)
    ? resolve(trimmed)
    : resolve(canonicalWorkspaceRoot, trimmed);
  const candidateReal = resolveCanonicalAncestor(candidateAbs);
  const rel = relative(canonicalWorkspaceRoot, candidateReal);

  if (rel === "" || rel === ".") {
    return "";
  }
  // SEC-L7: Only block parent traversal .. and ..\ or ../, not ..hidden/x.txt
  if (rel === ".." || rel.startsWith(".." + "/") || rel.startsWith(".." + "\\") || isAbsolute(rel) || /^[a-zA-Z]:/.test(rel)) {
    throw new Error(
      `[SWARM SECURITY] Path escapes workspace root: "${rawPath}" (outside "${canonicalWorkspaceRoot}").`,
    );
  }
  const normalized = rel.replace(/\\/g, "/");
  if (IS_WINDOWS && normalized.includes(":")) {
    throw new Error(
      `[SWARM SECURITY] Windows Alternate Data Streams (':') are not permitted in path: "${rawPath}"`,
    );
  }
  if (isProtectedRepoPath(normalized)) {
    throw new Error(
      `[SWARM SECURITY] Protected repository path cannot be modified by swarm members: "${normalized}"`,
    );
  }
  return normalized;
}

export function validateAndNormalizeGlob(rawGlob: string): string {
  if (!rawGlob || rawGlob.includes("\0")) {
    throw new Error(`Invalid ownership glob: "${rawGlob}"`);
  }
  // SEC-H5: Cap glob length <= 256
  if (rawGlob.length > 256) {
    throw new Error(`Ownership glob exceeds maximum length of 256 characters (got ${rawGlob.length}).`);
  }
  const norm = rawGlob.trim().replace(/\\/g, "/").replace(/^\.\//, "");
  if (!norm) {
    throw new Error(`Empty ownership glob is not allowed.`);
  }
  if (norm.startsWith("/") || /^[a-zA-Z]:/.test(norm) || norm.startsWith("//")) {
    throw new Error(`Ownership glob must be workspace-relative (got "${rawGlob}").`);
  }
  if (/[{}[\]]/.test(norm)) {
    throw new Error(
      `Unsupported glob syntax in "${rawGlob}" (braces '{}' and brackets '[]' are not expanded). ` +
        `Pass separate entries in owned_globs instead (e.g. ["src/**/*.ts", "src/**/*.tsx"]).`,
    );
  }
  // SEC-H5: Cap ** count <= 8 and reject consecutive **/**
  if (norm.includes("**/**")) {
    throw new Error(`Consecutive double-star patterns '**/**' are not permitted in glob "${rawGlob}".`);
  }
  const doubleStarMatches = norm.match(/\*\*/g);
  if (doubleStarMatches && doubleStarMatches.length > 8) {
    throw new Error(`Glob "${rawGlob}" exceeds maximum permitted '**' patterns (max 8, got ${doubleStarMatches.length}).`);
  }

  const segments = norm.split("/");
  if (segments.some((s) => s === "..")) {
    throw new Error(`Ownership glob cannot contain parent traversal '..' (got "${rawGlob}").`);
  }
  if (isProtectedRepoPath(norm)) {
    throw new Error(`Protected path cannot be claimed as an ownership glob: "${rawGlob}"`);
  }
  return norm.endsWith("/") ? `${norm}**` : norm;
}

/**
 * Segment-wise matcher to prevent regex backtracking ReDoS (SEC-H5).
 * Supports * (single segment wildcard), ? (single char non-slash), and ** (multi-segment).
 */
export function pathMatchesGlob(repoRelPath: string, glob: string): boolean {
  const normGlob = validateAndNormalizeGlob(glob);
  const cleanPath = repoRelPath.replace(/\\/g, "/").replace(/^\.\//, "");

  const pSegments = cleanPath.split("/");
  const gSegments = normGlob.split("/");

  // DP table for segment matching: dp[i][j] is true if gSegments[0..i-1] matches pSegments[0..j-1]
  const n = gSegments.length;
  const m = pSegments.length;
  const dp: boolean[][] = Array.from({ length: n + 1 }, () => Array(m + 1).fill(false));
  dp[0][0] = true;

  for (let i = 1; i <= n; i++) {
    const gSeg = gSegments[i - 1];
    if (gSeg === "**") {
      dp[i][0] = dp[i - 1][0];
      for (let j = 1; j <= m; j++) {
        dp[i][j] = dp[i - 1][j] || dp[i][j - 1];
      }
    } else {
      for (let j = 1; j <= m; j++) {
        if (dp[i - 1][j - 1] && matchSingleSegment(pSegments[j - 1], gSeg)) {
          dp[i][j] = true;
        }
      }
    }
  }

  return dp[n][m];
}

function matchSingleSegment(text: string, pattern: string): boolean {
  if (pattern === "*") return true;
  const tLen = text.length;
  const pLen = pattern.length;
  const dp: boolean[][] = Array.from({ length: pLen + 1 }, () => Array(tLen + 1).fill(false));
  dp[0][0] = true;

  for (let i = 1; i <= pLen; i++) {
    const pChar = pattern[i - 1];
    if (pChar === "*") {
      dp[i][0] = dp[i - 1][0];
      for (let j = 1; j <= tLen; j++) {
        dp[i][j] = dp[i - 1][j] || dp[i][j - 1];
      }
    } else {
      for (let j = 1; j <= tLen; j++) {
        const tChar = text[j - 1];
        const match = IS_WINDOWS
          ? pChar.toLowerCase() === tChar.toLowerCase() || pChar === "?"
          : pChar === tChar || pChar === "?";
        if (dp[i - 1][j - 1] && match) {
          dp[i][j] = true;
        }
      }
    }
  }
  return dp[pLen][tLen];
}

export function globToRegExp(glob: string): RegExp {
  const norm = validateAndNormalizeGlob(glob);
  let regexStr = "^";
  let i = 0;
  while (i < norm.length) {
    const ch = norm[i];
    if (ch === "*") {
      if (norm[i + 1] === "*") {
        if (norm[i + 2] === "/") {
          regexStr += "(?:.*/)?";
          i += 3;
          continue;
        }
        regexStr += ".*";
        i += 2;
        continue;
      }
      regexStr += "[^/]*";
      i += 1;
      continue;
    }
    if (ch === "?") {
      regexStr += "[^/]";
      i += 1;
      continue;
    }
    regexStr += /[.+^${}()|[\]\\]/.test(ch) ? `\\${ch}` : ch;
    i += 1;
  }
  regexStr += "$";
  return new RegExp(regexStr, IS_WINDOWS ? "i" : "");
}

function literalExtension(glob: string): string | null {
  const lastSegment = glob.split("/").pop() ?? "";
  if (!lastSegment || /[*?]$/.test(lastSegment)) return null;
  const ext = extname(lastSegment);
  if (!ext || /[*?]/.test(ext)) return null;
  return IS_WINDOWS ? ext.toLowerCase() : ext;
}

export function globsPotentiallyOverlap(a: string, b: string): boolean {
  const na = validateAndNormalizeGlob(a);
  const nb = validateAndNormalizeGlob(b);
  const ca = IS_WINDOWS ? na.toLowerCase() : na;
  const cb = IS_WINDOWS ? nb.toLowerCase() : nb;
  if (ca === cb) return true;

  const extA = literalExtension(na);
  const extB = literalExtension(nb);
  if (extA && extB && extA !== extB) {
    return false;
  }

  const prefixA = ca.split(/[*?]/)[0];
  const prefixB = cb.split(/[*?]/)[0];
  if (!prefixA || !prefixB) {
    return true;
  }
  if (prefixA.startsWith(prefixB) || prefixB.startsWith(prefixA)) {
    return true;
  }
  return (
    pathMatchesGlob(na.replace(/[*?].*$/, "sample"), nb) ||
    pathMatchesGlob(nb.replace(/[*?].*$/, "sample"), na)
  );
}

export function extractTargetPaths(toolName: string, input: unknown): string[] {
  if (!input || typeof input !== "object") return [];
  const obj = input as Record<string, unknown>;
  const paths = new Set<string>();

  for (const key of ["path", "filePath", "file_path", "targetPath", "filename", "resource", "file", "destination", "to", "from"]) {
    if (typeof obj[key] === "string" && obj[key].trim()) {
      paths.add(obj[key].trim());
    }
  }
  for (const arrKey of ["paths", "resources", "files"]) {
    if (Array.isArray(obj[arrKey])) {
      for (const p of obj[arrKey] as unknown[]) {
        if (typeof p === "string" && p.trim()) paths.add(p.trim());
      }
    }
  }
  if (Array.isArray(obj.edits)) {
    for (const edit of obj.edits) {
      if (edit && typeof edit === "object") {
        const e = edit as Record<string, unknown>;
        for (const key of ["path", "filePath", "file_path"]) {
          if (typeof e[key] === "string" && e[key].trim()) paths.add(e[key].trim());
        }
      }
    }
  }

  if (toolName.includes("patch") || toolName === "edit") {
    const patchText =
      typeof obj.patch === "string"
        ? obj.patch
        : typeof obj.patchText === "string"
          ? obj.patchText
          : typeof obj.diff === "string"
            ? obj.diff
            : "";
    if (patchText) {
      const headerRe = /^(?:\*\*\* (?:Update|Add|Delete) File: |\+\+\+ b\/|--- a\/)(.+)$/gm;
      let m: RegExpExecArray | null;
      while ((m = headerRe.exec(patchText)) !== null) {
        const candidate = m[1]?.trim();
        if (candidate && candidate !== "/dev/null") paths.add(candidate);
      }
    }
  }

  return Array.from(paths);
}

/**
 * Only tightens a permission effect (allow -> ask -> deny).
 * Never weakens a user's or agent's pre-computed deny/ask rule.
 */
export function tightenEffect(current: unknown, proposed: PermissionEffect): PermissionEffect {
  const rank: Record<PermissionEffect, number> = { allow: 0, ask: 1, deny: 2 };
  const cur: PermissionEffect =
    current === "deny" || current === "ask" || current === "allow" ? current : "allow";
  return rank[proposed] > rank[cur] ? proposed : cur;
}
