import type { SwarmModelCatalogItem } from "../rpc.js";

export type SwarmControlRole = "coordinator" | "worker" | "verifier" | "monitor";

export interface ModelOption {
  spec: string;
  label: string;
  isRecommended?: boolean;
}

export interface RecommendedRoleTarget {
  role: SwarmControlRole;
  title: string;
  subtitle: string;
  displayLabel: string;
  patterns: RegExp[];
  preferredProviders: string[];
  preferredVariant?: string;
  fallbackSpec: string;
}

export const RECOMMENDED_ROLE_TARGETS: Record<SwarmControlRole, RecommendedRoleTarget> = {
  coordinator: {
    role: "coordinator",
    title: "Coordinator",
    subtitle: "@coordinator — leads planning, spawning & board coordination",
    displayLabel: "Muse Spark 1.3 · xhigh",
    patterns: [/^muse-spark-1\.3/i, /muse[\s._-]*spark[\s._-]*1\.3/i],
    preferredProviders: ["opencode-go", "opencode"],
    preferredVariant: "xhigh",
    fallbackSpec: "opencode-go/muse-spark-1.3-contributor#xhigh",
  },
  worker: {
    role: "worker",
    title: "Worker",
    subtitle: "@worker — executes tasks (changing mid-swarm stops, switches & reruns)",
    displayLabel: "DeepSeek V4.1 Flash · high",
    patterns: [/^deepseek-v4\.1-flash$/i, /deepseek[\s._-]*v?4\.1[\s._-]*flash/i],
    preferredProviders: ["opencode-go", "opencode"],
    preferredVariant: "high",
    fallbackSpec: "opencode-go/deepseek-v4.1-flash#high",
  },
  verifier: {
    role: "verifier",
    title: "Verifier",
    subtitle: "@verifier — independent verification gate (changing mid-swarm stops, switches & reruns)",
    displayLabel: "DeepSeek V4.1 Flash · max",
    patterns: [/^deepseek-v4\.1-flash$/i, /deepseek[\s._-]*v?4\.1[\s._-]*flash/i],
    preferredProviders: ["opencode-go", "opencode"],
    preferredVariant: "max",
    fallbackSpec: "opencode-go/deepseek-v4.1-flash#max",
  },
  monitor: {
    role: "monitor",
    title: "Monitor",
    subtitle: "@monitor — watches stalls and nudges blocked threads",
    displayLabel: "GLM 5.3 Flash · default",
    patterns: [/^glm-5\.3-flash$/i, /glm[\s._-]*5\.3[\s._-]*flash/i],
    preferredProviders: ["opencode-go", "opencode"],
    preferredVariant: undefined,
    fallbackSpec: "opencode-go/glm-5.3-flash",
  },
};

export function resolveRecommendedRoleModels(
  models: SwarmModelCatalogItem[],
  fallback?: Partial<Record<SwarmControlRole, string>>,
): Record<SwarmControlRole, string> {
  const result = {} as Record<SwarmControlRole, string>;

  for (const role of ["coordinator", "worker", "verifier", "monitor"] as const) {
    const target = RECOMMENDED_ROLE_TARGETS[role];
    let matched: SwarmModelCatalogItem | undefined;

    for (const provider of target.preferredProviders) {
      matched = models.find(
        (m) =>
          m.providerID.toLowerCase() === provider.toLowerCase() &&
          target.patterns.some((p) => p.test(m.id) || (m.name ? p.test(m.name) : false)),
      );
      if (matched) break;
    }

    if (!matched) {
      matched = models.find((m) =>
        target.patterns.some((p) => p.test(m.id) || (m.name ? p.test(m.name) : false)),
      );
    }

    if (matched) {
      const base = `${matched.providerID}/${matched.id}`;
      if (target.preferredVariant) {
        const matchedVariant = (matched.variants ?? []).find(
          (v) => v.toLowerCase() === target.preferredVariant!.toLowerCase(),
        );
        result[role] = matchedVariant ? `${base}#${matchedVariant}` : base;
      } else {
        result[role] = base;
      }
    } else {
      const fb = fallback?.[role];
      result[role] = fb && fb.trim() ? fb.trim() : target.fallbackSpec;
    }
  }

  return result;
}

export function buildSortedModelOptions(
  models: SwarmModelCatalogItem[],
  currentSpec?: string,
  recommendedSpec?: string,
): ModelOption[] {
  const specs: ModelOption[] = [];
  const seen = new Set<string>();

  for (const m of models) {
    const base = `${m.providerID}/${m.id}`;
    if (!seen.has(base)) {
      seen.add(base);
      specs.push({ spec: base, label: m.name ? `${base} (${m.name})` : base });
    }
    for (const v of m.variants ?? []) {
      const withVar = `${base}#${v}`;
      if (!seen.has(withVar)) {
        seen.add(withVar);
        specs.push({ spec: withVar, label: withVar });
      }
    }
  }

  if (currentSpec && !seen.has(currentSpec)) {
    seen.add(currentSpec);
    specs.push({ spec: currentSpec, label: currentSpec });
  }

  if (recommendedSpec && !seen.has(recommendedSpec)) {
    seen.add(recommendedSpec);
    specs.push({ spec: recommendedSpec, label: recommendedSpec });
  }

  specs.sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: "base", numeric: true }));

  if (!recommendedSpec) {
    return specs;
  }

  let recOption: ModelOption | undefined;
  const rest: ModelOption[] = [];
  for (const opt of specs) {
    if (opt.spec === recommendedSpec) {
      recOption = { ...opt, isRecommended: true };
    } else {
      rest.push(opt);
    }
  }

  return recOption ? [recOption, ...rest] : rest;
}
