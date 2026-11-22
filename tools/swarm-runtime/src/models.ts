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

  const rawModels: any[] = Array.isArray(rawList)
    ? rawList
    : ((rawList as unknown as { models?: any[] })?.models ?? []);

  const filtered = opts?.all
    ? rawModels
    : rawModels.filter((m: any) => m.enabled && m.status !== "deprecated");
  const models: AvailableModelEntry[] = filtered.map((m: any) => ({
    spec: `${m.providerID}/${m.id}`,
    providerID: m.providerID,
    id: m.id,
    enabled: m.enabled,
    status: m.status,
    variants: (m.variants ?? []).map((v: any) => v.id),
    limit: m.limit ? { context: m.limit.context, output: m.limit.output } : undefined,
  }));

  const d = rawDefault as unknown as { providerID?: string; modelID?: string; id?: string } | undefined;
  const defaultModel =
    d?.providerID && (d.modelID || d.id)
      ? { providerID: d.providerID, modelID: (d.modelID ?? d.id)! }
      : undefined;

  return { defaultModel, models };
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
    if (resolved.variant && match.variants.length > 0 && !match.variants.includes(resolved.variant)) {
      throw new Error(
        `Variant "${resolved.variant}" is not supported by ${match.spec}. Available variants: ${match.variants.join(", ")}.`,
      );
    }
  }

  return resolved;
}
