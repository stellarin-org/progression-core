import { storage } from "../storage";

export type ValidationSeverity = "error" | "warning" | "advisory";

export interface ValidationIssue {
  severity: ValidationSeverity;
  code: string;
  message: string;
  entityType?: string;
  entityId?: string;
  entityName?: string;
}

export interface ValidationReport {
  programId: string;
  programNotFound?: boolean;
  valid: boolean;
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
  advisories: ValidationIssue[];
  timestamp: string;
}

interface ProgramSnapshot {
  program: { id: string; name: string };
  tracks: { id: string; name: string; type: string; lifecycleState: string; programId: string }[];
  branches: { id: string; name: string; trackId: string; displayOrder: number }[];
  nodes: { id: string; name: string; branchId: string; lifecycleState: string; costBundle: Record<string, unknown>; rewardBundle: Record<string, unknown>; prerequisiteNodeIds: string[]; displayOrder: number }[];
  rankLevels: { id: string; name: string; trackId: string; thresholdRules: Record<string, unknown>[]; grants: Record<string, unknown> }[];
  badges: { id: string; name: string; trackId: string; lifecycleState: string; rewardBundle: Record<string, unknown>; criteria: Record<string, unknown>[] }[];
  currencies: { id: string; name: string; type: string }[];
}

function validateIdentity(snapshot: ProgramSnapshot): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const seenIds = new Map<string, { entityType: string; entityName: string }>();

  const allEntities: { id: string; entityType: string; entityName: string }[] = [
    ...snapshot.tracks.map(t => ({ id: t.id, entityType: "track", entityName: t.name })),
    ...snapshot.branches.map(b => ({ id: b.id, entityType: "branch", entityName: b.name })),
    ...snapshot.nodes.map(n => ({ id: n.id, entityType: "node", entityName: n.name })),
    ...snapshot.rankLevels.map(r => ({ id: r.id, entityType: "rankLevel", entityName: r.name })),
    ...snapshot.badges.map(b => ({ id: b.id, entityType: "badge", entityName: b.name })),
    ...snapshot.currencies.map(c => ({ id: c.id, entityType: "currency", entityName: c.name })),
  ];

  for (const entity of allEntities) {
    const existing = seenIds.get(entity.id);
    if (existing) {
      issues.push({
        severity: "error",
        code: "DUPLICATE_ID",
        message: `Duplicate ID "${entity.id}" found on ${entity.entityType} "${entity.entityName}" and ${existing.entityType} "${existing.entityName}"`,
        entityType: entity.entityType,
        entityId: entity.id,
        entityName: entity.entityName,
      });
    } else {
      seenIds.set(entity.id, { entityType: entity.entityType, entityName: entity.entityName });
    }
  }

  return issues;
}

function extractCurrencyRefs(bundle: Record<string, unknown>, key: string): string[] {
  const ids: string[] = [];
  const items = bundle[key];
  if (Array.isArray(items)) {
    for (const item of items) {
      if (item && typeof item === "object" && "currencyId" in item && typeof item.currencyId === "string") {
        ids.push(item.currencyId);
      }
    }
  }
  return ids;
}

function extractBadgeRefs(bundle: Record<string, unknown>, key: string): string[] {
  const ids: string[] = [];
  const items = bundle[key];
  if (Array.isArray(items)) {
    for (const item of items) {
      if (item && typeof item === "object" && "badgeId" in item && typeof item.badgeId === "string") {
        ids.push(item.badgeId);
      }
    }
  }
  return ids;
}

function validateReferences(snapshot: ProgramSnapshot): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const currencyIds = new Set(snapshot.currencies.map(c => c.id));
  const nodeIds = new Set(snapshot.nodes.map(n => n.id));
  const trackIds = new Set(snapshot.tracks.map(t => t.id));
  const branchIds = new Set(snapshot.branches.map(b => b.id));
  const badgeIds = new Set(snapshot.badges.map(b => b.id));

  for (const track of snapshot.tracks) {
    if (track.programId !== snapshot.program.id) {
      issues.push({
        severity: "error",
        code: "INVALID_PROGRAM_REF",
        message: `Track "${track.name}" references non-existent program "${track.programId}"`,
        entityType: "track",
        entityId: track.id,
        entityName: track.name,
      });
    }
  }

  for (const branch of snapshot.branches) {
    if (!trackIds.has(branch.trackId)) {
      issues.push({
        severity: "error",
        code: "INVALID_TRACK_REF",
        message: `Branch "${branch.name}" references non-existent track "${branch.trackId}"`,
        entityType: "branch",
        entityId: branch.id,
        entityName: branch.name,
      });
    }
  }

  for (const node of snapshot.nodes) {
    if (!branchIds.has(node.branchId)) {
      issues.push({
        severity: "error",
        code: "INVALID_BRANCH_REF",
        message: `Node "${node.name}" references non-existent branch "${node.branchId}"`,
        entityType: "node",
        entityId: node.id,
        entityName: node.name,
      });
    }

    for (const prereqId of node.prerequisiteNodeIds) {
      if (!nodeIds.has(prereqId)) {
        issues.push({
          severity: "error",
          code: "INVALID_PREREQUISITE_REF",
          message: `Node "${node.name}" references non-existent prerequisite node "${prereqId}"`,
          entityType: "node",
          entityId: node.id,
          entityName: node.name,
        });
      }
    }

    const costCurrencies = extractCurrencyRefs(node.costBundle, "costs");
    for (const cid of costCurrencies) {
      if (!currencyIds.has(cid)) {
        issues.push({
          severity: "error",
          code: "INVALID_CURRENCY_REF",
          message: `Node "${node.name}" cost bundle references non-existent currency "${cid}"`,
          entityType: "node",
          entityId: node.id,
          entityName: node.name,
        });
      }
    }

    const rewardCurrencies = extractCurrencyRefs(node.rewardBundle, "rewards");
    for (const cid of rewardCurrencies) {
      if (!currencyIds.has(cid)) {
        issues.push({
          severity: "error",
          code: "INVALID_CURRENCY_REF",
          message: `Node "${node.name}" reward bundle references non-existent currency "${cid}"`,
          entityType: "node",
          entityId: node.id,
          entityName: node.name,
        });
      }
    }

    const rewardBadges = extractBadgeRefs(node.rewardBundle, "rewards");
    for (const bid of rewardBadges) {
      if (!badgeIds.has(bid)) {
        issues.push({
          severity: "error",
          code: "INVALID_BADGE_REF",
          message: `Node "${node.name}" reward bundle references non-existent badge "${bid}"`,
          entityType: "node",
          entityId: node.id,
          entityName: node.name,
        });
      }
    }
  }

  for (const rl of snapshot.rankLevels) {
    if (!trackIds.has(rl.trackId)) {
      issues.push({
        severity: "error",
        code: "INVALID_TRACK_REF",
        message: `Rank level "${rl.name}" references non-existent track "${rl.trackId}"`,
        entityType: "rankLevel",
        entityId: rl.id,
        entityName: rl.name,
      });
    }

    for (const rule of rl.thresholdRules) {
      const cid = (rule as { currencyId?: string }).currencyId;
      if (cid && !currencyIds.has(cid)) {
        issues.push({
          severity: "error",
          code: "INVALID_CURRENCY_REF",
          message: `Rank level "${rl.name}" threshold references non-existent currency "${cid}"`,
          entityType: "rankLevel",
          entityId: rl.id,
          entityName: rl.name,
        });
      }
    }

    const grantBadges = extractBadgeRefs(rl.grants, "rewards");
    for (const bid of grantBadges) {
      if (!badgeIds.has(bid)) {
        issues.push({
          severity: "error",
          code: "INVALID_BADGE_REF",
          message: `Rank level "${rl.name}" grants reference non-existent badge "${bid}"`,
          entityType: "rankLevel",
          entityId: rl.id,
          entityName: rl.name,
        });
      }
    }
  }

  for (const badge of snapshot.badges) {
    if (!trackIds.has(badge.trackId)) {
      issues.push({
        severity: "error",
        code: "INVALID_TRACK_REF",
        message: `Badge "${badge.name}" references non-existent track "${badge.trackId}"`,
        entityType: "badge",
        entityId: badge.id,
        entityName: badge.name,
      });
    }

    const rewardCurrencies = extractCurrencyRefs(badge.rewardBundle, "rewards");
    for (const cid of rewardCurrencies) {
      if (!currencyIds.has(cid)) {
        issues.push({
          severity: "error",
          code: "INVALID_CURRENCY_REF",
          message: `Badge "${badge.name}" reward bundle references non-existent currency "${cid}"`,
          entityType: "badge",
          entityId: badge.id,
          entityName: badge.name,
        });
      }
    }

    const rewardBadges = extractBadgeRefs(badge.rewardBundle, "rewards");
    for (const bid of rewardBadges) {
      if (!badgeIds.has(bid)) {
        issues.push({
          severity: "error",
          code: "INVALID_BADGE_REF",
          message: `Badge "${badge.name}" reward bundle references non-existent badge "${bid}"`,
          entityType: "badge",
          entityId: badge.id,
          entityName: badge.name,
        });
      }
    }
  }

  return issues;
}

function validateGraph(snapshot: ProgramSnapshot): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const nodeMap = new Map(snapshot.nodes.map(n => [n.id, n]));

  for (const node of snapshot.nodes) {
    if (node.prerequisiteNodeIds.includes(node.id)) {
      issues.push({
        severity: "error",
        code: "SELF_DEPENDENCY",
        message: `Node "${node.name}" lists itself as a prerequisite`,
        entityType: "node",
        entityId: node.id,
        entityName: node.name,
      });
    }
  }

  const visited = new Set<string>();
  const inStack = new Set<string>();

  function dfs(nodeId: string, path: string[]): void {
    if (inStack.has(nodeId)) {
      const cycleStart = path.indexOf(nodeId);
      const cycle = path.slice(cycleStart);
      const cycleNames = cycle.map(id => nodeMap.get(id)?.name || id);
      issues.push({
        severity: "error",
        code: "PREREQUISITE_CYCLE",
        message: `Cycle detected in prerequisites: ${cycleNames.join(" \u2192 ")} \u2192 ${nodeMap.get(nodeId)?.name || nodeId}`,
        entityType: "node",
        entityId: nodeId,
        entityName: nodeMap.get(nodeId)?.name || nodeId,
      });
      return;
    }
    if (visited.has(nodeId)) return;

    visited.add(nodeId);
    inStack.add(nodeId);

    const node = nodeMap.get(nodeId);
    if (node) {
      for (const prereqId of node.prerequisiteNodeIds) {
        if (nodeMap.has(prereqId)) {
          dfs(prereqId, [...path, nodeId]);
        }
      }
    }

    inStack.delete(nodeId);
  }

  for (const node of snapshot.nodes) {
    if (!visited.has(node.id)) {
      dfs(node.id, []);
    }
  }

  const nodeBranchMap = new Map(snapshot.nodes.map(n => [n.id, n.branchId]));
  for (const node of snapshot.nodes) {
    for (const prereqId of node.prerequisiteNodeIds) {
      const prereqBranch = nodeBranchMap.get(prereqId);
      if (prereqBranch && prereqBranch !== node.branchId) {
        const prereqNode = nodeMap.get(prereqId);
        issues.push({
          severity: "advisory",
          code: "CROSS_BRANCH_PREREQUISITE",
          message: `Node "${node.name}" depends on "${prereqNode?.name || prereqId}" which is in a different branch`,
          entityType: "node",
          entityId: node.id,
          entityName: node.name,
        });
      }
    }
  }

  const activeNodes = snapshot.nodes.filter(n => n.lifecycleState === "active");
  for (const node of activeNodes) {
    if (node.prerequisiteNodeIds.length === 0) continue;

    const reachable = canReachRoot(node.id, nodeMap);
    if (!reachable) {
      issues.push({
        severity: "warning",
        code: "UNREACHABLE_NODE",
        message: `Active node "${node.name}" cannot reach a root node (a node with no prerequisites) through its prerequisite chain`,
        entityType: "node",
        entityId: node.id,
        entityName: node.name,
      });
    }
  }

  return issues;
}

function canReachRoot(nodeId: string, nodeMap: Map<string, ProgramSnapshot["nodes"][0]>): boolean {
  const visited = new Set<string>();
  const queue = [nodeId];
  while (queue.length > 0) {
    const current = queue.shift()!;
    if (visited.has(current)) continue;
    visited.add(current);
    const node = nodeMap.get(current);
    if (!node) return false;
    if (node.prerequisiteNodeIds.length === 0) return true;
    for (const prereq of node.prerequisiteNodeIds) {
      if (!visited.has(prereq)) {
        queue.push(prereq);
      }
    }
  }
  return false;
}

function validateLifecycle(snapshot: ProgramSnapshot): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const nodeMap = new Map(snapshot.nodes.map(n => [n.id, n]));
  const trackMap = new Map(snapshot.tracks.map(t => [t.id, t]));

  for (const node of snapshot.nodes) {
    if (node.lifecycleState === "active") {
      for (const prereqId of node.prerequisiteNodeIds) {
        const prereq = nodeMap.get(prereqId);
        if (prereq && prereq.lifecycleState === "archived") {
          issues.push({
            severity: "error",
            code: "ACTIVE_DEPENDS_ON_ARCHIVED",
            message: `Active node "${node.name}" depends on archived node "${prereq.name}"`,
            entityType: "node",
            entityId: node.id,
            entityName: node.name,
          });
        }
      }

      const branch = snapshot.branches.find(b => b.id === node.branchId);
      if (branch) {
        const track = trackMap.get(branch.trackId);
        if (track && track.lifecycleState === "archived") {
          issues.push({
            severity: "error",
            code: "ACTIVE_IN_ARCHIVED_TRACK",
            message: `Node "${node.name}" is active but its track "${track.name}" is archived`,
            entityType: "node",
            entityId: node.id,
            entityName: node.name,
          });
        }
      }
    }
  }

  for (const badge of snapshot.badges) {
    if (badge.lifecycleState === "active") {
      const track = trackMap.get(badge.trackId);
      if (track && track.lifecycleState === "archived") {
        issues.push({
          severity: "error",
          code: "ACTIVE_IN_ARCHIVED_TRACK",
          message: `Badge "${badge.name}" is active but its track "${track.name}" is archived`,
          entityType: "badge",
          entityId: badge.id,
          entityName: badge.name,
        });
      }
    }
  }

  for (const rl of snapshot.rankLevels) {
    const track = trackMap.get(rl.trackId);
    if (track && track.lifecycleState === "archived") {
      issues.push({
        severity: "warning",
        code: "RANK_LEVEL_IN_ARCHIVED_TRACK",
        message: `Rank level "${rl.name}" belongs to archived track "${track.name}"`,
        entityType: "rankLevel",
        entityId: rl.id,
        entityName: rl.name,
      });
    }
  }

  return issues;
}

function validateEconomy(snapshot: ProgramSnapshot): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  const hasActiveTracks = snapshot.tracks.some(t => t.lifecycleState === "active");
  if (hasActiveTracks && snapshot.currencies.length === 0) {
    issues.push({
      severity: "advisory",
      code: "NO_CURRENCIES_DEFINED",
      message: `Program has active tracks but no currencies defined`,
      entityType: "program",
      entityId: snapshot.program.id,
      entityName: snapshot.program.name,
    });
  }

  for (const node of snapshot.nodes) {
    if (node.lifecycleState !== "active") continue;

    const costs = extractCurrencyRefs(node.costBundle, "costs");
    const rewards = extractCurrencyRefs(node.rewardBundle, "rewards");
    if (costs.length === 0 && rewards.length === 0) {
      issues.push({
        severity: "advisory",
        code: "NODE_NO_ECONOMY",
        message: `Active node "${node.name}" has no cost or reward currencies configured`,
        entityType: "node",
        entityId: node.id,
        entityName: node.name,
      });
    }
  }

  for (const badge of snapshot.badges) {
    if (badge.lifecycleState !== "active") continue;
    const rewards = extractCurrencyRefs(badge.rewardBundle, "rewards");
    const badgeRewards = extractBadgeRefs(badge.rewardBundle, "rewards");
    if (rewards.length === 0 && badgeRewards.length === 0) {
      issues.push({
        severity: "advisory",
        code: "BADGE_NO_REWARDS",
        message: `Active badge "${badge.name}" has no rewards configured`,
        entityType: "badge",
        entityId: badge.id,
        entityName: badge.name,
      });
    }
  }

  return issues;
}

async function buildProgramSnapshot(programId: string): Promise<ProgramSnapshot | null> {
  const program = await storage.getProgressionProgram(programId);
  if (!program) return null;

  const [tracks, currencies] = await Promise.all([
    storage.getTracksByProgram(programId),
    storage.getCurrencyDefinitions(),
  ]);

  const trackIds = tracks.map(t => t.id);

  const [rawBranches, rawRankLevels, rawBadges] = await Promise.all([
    storage.getBranchesByTrackIds(trackIds),
    storage.getRankLevelsByTrackIds(trackIds),
    storage.getBadgesByTrackIds(trackIds),
  ]);

  const branchIds = rawBranches.map(b => b.id);
  const rawNodes = await storage.getNodesByBranchIds(branchIds);

  return {
    program: {
      id: program.id,
      name: program.name,
    },
    tracks: tracks.map(t => ({
      id: t.id,
      name: t.name,
      type: t.type,
      lifecycleState: t.lifecycleState,
      programId: t.programId,
    })),
    branches: rawBranches.map(b => ({
      id: b.id,
      name: b.name,
      trackId: b.trackId,
      displayOrder: b.displayOrder,
    })),
    nodes: rawNodes.map(n => ({
      id: n.id,
      name: n.name,
      branchId: n.branchId,
      lifecycleState: n.lifecycleState,
      costBundle: (n.costBundle || {}) as Record<string, unknown>,
      rewardBundle: (n.rewardBundle || {}) as Record<string, unknown>,
      prerequisiteNodeIds: (n.prerequisiteNodeIds || []) as string[],
      displayOrder: n.displayOrder,
    })),
    rankLevels: rawRankLevels.map(r => ({
      id: r.id,
      name: r.name,
      trackId: r.trackId,
      thresholdRules: (r.thresholdRules || []) as Record<string, unknown>[],
      grants: (r.grants || {}) as Record<string, unknown>,
    })),
    badges: rawBadges.map(b => ({
      id: b.id,
      name: b.name,
      trackId: b.trackId,
      lifecycleState: b.lifecycleState,
      rewardBundle: (b.rewardBundle || {}) as Record<string, unknown>,
      criteria: (b.criteria || []) as Record<string, unknown>[],
    })),
    currencies: currencies.map(c => ({
      id: c.id,
      name: c.name,
      type: c.type,
    })),
  };
}

export async function validateProgram(programId: string): Promise<ValidationReport> {
  const snapshot = await buildProgramSnapshot(programId);
  if (!snapshot) {
    return {
      programId,
      programNotFound: true,
      valid: false,
      errors: [{
        severity: "error",
        code: "PROGRAM_NOT_FOUND",
        message: `Program "${programId}" not found`,
        entityType: "program",
        entityId: programId,
      }],
      warnings: [],
      advisories: [],
      timestamp: new Date().toISOString(),
    };
  }

  const allIssues: ValidationIssue[] = [
    ...validateIdentity(snapshot),
    ...validateReferences(snapshot),
    ...validateGraph(snapshot),
    ...validateLifecycle(snapshot),
    ...validateEconomy(snapshot),
  ];

  const errors = allIssues.filter(i => i.severity === "error");
  const warnings = allIssues.filter(i => i.severity === "warning");
  const advisories = allIssues.filter(i => i.severity === "advisory");

  return {
    programId,
    valid: errors.length === 0,
    errors,
    warnings,
    advisories,
    timestamp: new Date().toISOString(),
  };
}
