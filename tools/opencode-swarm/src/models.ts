import type { Plugin } from "@opencode/plugin";
import type { ModelSelection } from "./types.js";

type Context = Parameters<Parameters<typeof Plugin.define>[0]["setup"]>[0];

export interface AvailableModelEntry {
  spec: string;
  providerID: string;
  id: string;
  enabled: boolean;
  status: string;
  variants: string[];
  limit?: { context: number; output: number };
}

/**
 * Parses "provider/model#variant", "provider/model" + separate variant, or "#variant".
 */
export function parseModelSpec(
  modelInput?: string,
  variantInput?: string,
): Partial<ModelSelection> & { variantOnly?: string } | undefined {
  const rawModel = modelInput?.trim();
  const rawVariant = variantInput?.trim();

  if (!rawModel && !rawVariant) return undefined;

  if (!rawModel && rawVariant) {
    return { variantOnly: rawVariant.replace(/^#/, "") };
  }

  let modelPart = rawModel!;
  let hashVariant: string | undefined;

  const hashIdx = modelPart.indexOf("#");
  if (hashIdx >= 0) {
    hashVariant = modelPart.slice(hashIdx + 1).trim() || undefined;
    modelPart = modelPart.slice(0, hashIdx).trim();
  }

  const effectiveVariant = rawVariant ? rawVariant.replace(/^#/, "") : hashVariant;

  if (!modelPart && effectiveVariant) {
    return { variantOnly: effectiveVariant };
  }

  const slashIdx = modelPart.indexOf("/");
  if (slashIdx <= 0 || slashIdx >= modelPart.length - 1) {
    throw new Error(
      `Model must use "providerID/modelID" or "providerID/modelID#variant" format (got "${rawModel}").`,
    );
  }

  return {
    providerID: modelPart.slice(0, slashIdx),
    id: modelPart.slice(slashIdx + 1),
    ...(effectiveVariant ? { variant: effectiveVariant } : {}),
  };
}

export function formatModelSpec(ref?: Partial<ModelSelection> | null): string {
  if (!ref?.providerID || !ref?.id) return "(inherited)";
  return ref.variant ? `${ref.providerID}/${ref.id}#${ref.variant}` : `${ref.providerID}/${ref.id}`;
}

/**
 * The host returns `{ location, data: [...] }` in v2; older builds returned a bare
 * array or `{ models: [...] }`. Normalize all of them.
 */
function extractModelArray(raw: unknown): any[] {
  if (Array.isArray(raw)) return raw;
  const r = raw as any;
  if (!r || typeof r !== "object") return [];
  if (Array.isArray(r.data)) return r.data;
  if (Array.isArray(r.models)) return r.models;
  if (r.models && Array.isArray(r.models.data)) return r.models.data;
  return [];
}

function extractDefaultModel(raw: unknown): { providerID: string; modelID: string } | undefined {
  const r = raw as any;
  if (!r || typeof r !== "object") return undefined;
  const candidate = r.data && typeof r.data === "object" ? r.data : r;
  const providerID = candidate.providerID;
  const modelID = candidate.modelID ?? candidate.id;
  return providerID && modelID ? { providerID, modelID } : undefined;
}

export async function listAvailableModels(
  ctx: Pick<Context, "model">,
  opts?: { all?: boolean },
): Promise<{
  defaultModel?: { providerID: string; modelID: string };
  models: AvailableModelEntry[];
}> {
  const [rawList, rawDefault] = await Promise.all([
    ctx.model.list().catch(() => []),
    ctx.model.default().catch(() => undefined),
  ]);

  const rawModels = extractModelArray(rawList);

  const filtered = opts?.all
    ? rawModels
    : rawModels.filter((m: any) => m.enabled !== false && m.status !== "deprecated");
  const models: AvailableModelEntry[] = filtered.map((m: any) => {
    const id = m.modelID ?? m.id;
    return {
      spec: `${m.providerID}/${id}`,
      providerID: m.providerID,
      id,
      enabled: m.enabled,
      status: m.status,
      variants: (m.variants ?? []).map((v: any) => v.id),
      limit: m.limit ? { context: m.limit.context, output: m.limit.output } : undefined,
    };
  });

  return { defaultModel: extractDefaultModel(rawDefault), models };
}

/**
 * Strict manual-pick resolver:
 * - If neither model nor variant is requested, inherits `fallback` unchanged.
 * - If only variant is requested, keeps `fallback`'s providerID/id and updates variant.
 * - Validates against `ctx.model.list()` when catalog is non-empty.
 */
export async function resolveAndValidateModel(
  ctx: Pick<Context, "model">,
  requestedModel?: string,
  requestedVariant?: string,
  fallback?: ModelSelection | null,
): Promise<ModelSelection | undefined> {
  const parsed = parseModelSpec(requestedModel, requestedVariant);
  if (!parsed) {
    return fallback ?? undefined;
  }

  let resolved: ModelSelection;
  if (parsed.variantOnly) {
    if (!fallback?.providerID || !fallback?.id) {
      throw new Error(
        `Cannot set variant "#${parsed.variantOnly}" without a base model. Pass "providerID/modelID#${parsed.variantOnly}".`,
      );
    }
    resolved = {
      providerID: fallback.providerID,
      id: fallback.id,
      variant: parsed.variantOnly,
    };
  } else {
    resolved = {
      providerID: parsed.providerID!,
      id: parsed.id!,
      ...(parsed.variant ? { variant: parsed.variant } : {}),
    };
  }

  const { models } = await listAvailableModels(ctx, { all: true });
  if (models.length > 0) {
    const match = models.find((m) => m.providerID === resolved.providerID && m.id === resolved.id);
    if (!match) {
      throw new Error(
        `Model "${resolved.providerID}/${resolved.id}" not found. Call swarm{action:"models"} to list available models.`,
      );
    }
    if (resolved.variant) {
      if (match.variants.length === 0) {
        throw new Error(`Model "${match.spec}" does not support variants.`);
      }
      if (!match.variants.includes(resolved.variant)) {
        throw new Error(
          `Variant "${resolved.variant}" is not supported by ${match.spec}. Available variants: ${match.variants.join(", ")}.`,
        );
      }
    }
  }

  return resolved;
}
