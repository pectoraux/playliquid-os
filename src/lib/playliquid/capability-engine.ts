// PRIMITIVE #7 (Kernel) — Multi-layer Capability Negotiation
//
//   Entity capabilities (declared by the Package)
//     × World policy
//     × Zone policy
//     × Experience policy
//     = Effective capabilities (computed by the Kernel)
//
// The package stays reusable across 500 worlds. The world does NOT modify
// the package — it layers policies on top. Superman can fly in 500 worlds
// and be grounded in 501 without 501 implementations.
//
// Evaluation order (lowest priority first; later layers can override):
//   1. world layer — baseline for the entire world
//   2. zone layer — overrides world within a spatial zone
//   3. experience layer — overrides zone within an experience (quest/event)
//
// Within a layer, rules are matched by specificity:
//   - exact package match > packageFamily match > wildcard
// "deny" is sticky: once denied at a layer, a higher layer must explicitly
// "allow" to re-grant. "limit" is treated as a conditional grant.

import { db } from "@/lib/db";
import type {
  CapabilityPolicyRecord,
  CapabilityRule,
  EffectiveCapability,
  CapabilityAction,
  PackageRecord,
} from "./types";

// Compute the effective capabilities for an entity (from its package) in a
// given world/zone/experience context.
export async function negotiateCapabilities(input: {
  pkg: PackageRecord;
  worldProjectId: string;
  zoneName?: string;
  experienceName?: string;
}): Promise<EffectiveCapability[]> {
  const pkg = input.pkg;
  // The capabilities the package DECLARES it can do.
  const declared = pkg.capabilities;

  // Load all applicable policies, ordered by priority (world < zone < experience).
  const policies = await db.capabilityPolicy.findMany({
    where: {
      worldProjectId: input.worldProjectId,
      OR: [
        { layer: "world" },
        ...(input.zoneName ? [{ layer: "zone", zoneName: input.zoneName }] : []),
        ...(input.experienceName ? [{ layer: "experience", experienceName: input.experienceName }] : []),
      ],
    },
    orderBy: { priority: "asc" },
  });

  const policyRecords: CapabilityPolicyRecord[] = policies.map((p) => ({
    id: p.id,
    worldProjectId: p.worldProjectId,
    layer: p.layer as "world" | "zone" | "experience",
    zoneName: p.zoneName,
    experienceName: p.experienceName,
    capability: p.capability,
    rules: JSON.parse(p.rules) as CapabilityRule[],
    priority: p.priority,
    createdAt: p.createdAt.toISOString(),
  }));

  // For each declared capability, walk the layers and compute the effective action.
  return declared.map((capability) => {
    const layers: EffectiveCapability["layers"] = [];
    let currentAction: CapabilityAction = "allow"; // declared → granted by default
    let limitingRule: { layer: string; rule: CapabilityRule } | undefined;

    // walk policies in priority order
    for (const policy of policyRecords) {
      if (policy.capability !== capability && policy.capability !== "*") continue;
      const rule = matchRule(policy.rules, pkg);
      if (!rule) continue;

      layers.push({
        layer: labelLayer(policy, input),
        action: rule.action,
        rule,
      });

      if (rule.action === "deny") {
        currentAction = "deny";
        limitingRule = { layer: labelLayer(policy, input), rule };
      } else if (rule.action === "limit" && currentAction !== "deny") {
        currentAction = "limit";
        limitingRule = { layer: labelLayer(policy, input), rule };
      } else if (rule.action === "allow" && currentAction === "limit") {
        // a higher-priority allow can un-limit
        currentAction = "allow";
        limitingRule = undefined;
      }
    }

    return {
      capability,
      granted: currentAction === "allow",
      action: currentAction,
      limitedBy: limitingRule,
      layers,
    };
  });
}

// Match the most specific rule in a policy to a package.
// Specificity: exact package name > packageFamily > wildcard (no filter).
function matchRule(rules: CapabilityRule[], pkg: PackageRecord): CapabilityRule | undefined {
  // 1. exact package match
  const exact = rules.find((r) => r.package === pkg.name);
  if (exact) return exact;
  // 2. packageFamily match
  const family = rules.find((r) => r.packageFamily === pkg.family && !r.package);
  if (family) return family;
  // 3. wildcard (no package or family filter)
  const wildcard = rules.find((r) => !r.package && !r.packageFamily);
  return wildcard;
}

function labelLayer(
  policy: CapabilityPolicyRecord,
  input: { zoneName?: string; experienceName?: string }
): string {
  if (policy.layer === "world") return "world";
  if (policy.layer === "zone") return `zone:${policy.zoneName ?? input.zoneName ?? "?"}`;
  if (policy.layer === "experience") return `experience:${policy.experienceName ?? input.experienceName ?? "?"}`;
  return policy.layer;
}

// Helper: pretty-print an effective capability for the UI.
export function describeEffective(ec: EffectiveCapability): string {
  if (ec.action === "allow") return `${ec.capability} → granted`;
  if (ec.action === "deny") return `${ec.capability} → denied${ec.limitedBy ? ` by ${ec.limitedBy.layer}` : ""}`;
  if (ec.action === "limit") {
    const params = ec.limitedBy?.rule.params ? ` ${JSON.stringify(ec.limitedBy.rule.params)}` : "";
    return `${ec.capability} → limited${ec.limitedBy ? ` by ${ec.limitedBy.layer}` : ""}${params}`;
  }
  return `${ec.capability} → ${ec.action}`;
}
