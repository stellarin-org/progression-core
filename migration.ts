import type { MigrationRule, MigrationRuleType } from "@shared/schema";

export interface ManifestSnapshot {
  tracks: ManifestEntity[];
  branches: ManifestEntity[];
  nodes: ManifestEntity[];
  rankLevels: ManifestEntity[];
  badges: ManifestEntity[];
  currencies: ManifestEntity[];
}

export interface ManifestEntity {
  id: string;
  name: string;
  entityType: string;
  parentId?: string;
  lifecycleState?: string;
  data: Record<string, unknown>;
}

export type DiffChangeType = "added" | "removed" | "modified";

export interface DiffEntry {
  entityType: string;
  entityId: string;
  entityName: string;
  changeType: DiffChangeType;
  oldData?: Record<string, unknown>;
  newData?: Record<string, unknown>;
  modifiedFields?: string[];
}

export interface ManifestDiff {
  added: DiffEntry[];
  removed: DiffEntry[];
  modified: DiffEntry[];
  summary: {
    totalAdded: number;
    totalRemoved: number;
    totalModified: number;
    byEntityType: Record<string, { added: number; removed: number; modified: number }>;
  };
}

export interface MigrationPlanItem {
  action: string;
  ruleType: MigrationRuleType;
  ruleId: string;
  sourceEntityId?: string | null;
  sourceEntityType?: string | null;
  targetEntityId?: string | null;
  targetEntityType?: string | null;
  reasonCode: string;
  description: string;
  impact: "preserve" | "replace" | "refund" | "archive" | "grant" | "alias";
  config: Record<string, unknown>;
}

export interface MigrationPlan {
  programId: string;
  sourceVersion: string;
  targetVersion: string;
  items: MigrationPlanItem[];
  summary: {
    preserved: number;
    replaced: number;
    refunded: number;
    archived: number;
    granted: number;
    aliased: number;
  };
  sampleUserImpact?: SampleUserImpact;
}

export interface SampleUserImpact {
  ownedEntitiesAffected: string[];
  entitlementsPreserved: string[];
  entitlementsReplaced: Array<{ from: string; to: string }>;
  refunds: Array<{ entityId: string; reason: string }>;
  newGrants: string[];
  grandfathered: string[];
}

function flattenSnapshot(snapshot: ManifestSnapshot): Map<string, ManifestEntity> {
  const map = new Map<string, ManifestEntity>();
  const allEntities = [
    ...snapshot.tracks,
    ...snapshot.branches,
    ...snapshot.nodes,
    ...snapshot.rankLevels,
    ...snapshot.badges,
    ...snapshot.currencies,
  ];
  for (const entity of allEntities) {
    map.set(`${entity.entityType}:${entity.id}`, entity);
  }
  return map;
}

export function computeManifestDiff(
  oldSnapshot: ManifestSnapshot,
  newSnapshot: ManifestSnapshot
): ManifestDiff {
  const oldMap = flattenSnapshot(oldSnapshot);
  const newMap = flattenSnapshot(newSnapshot);

  const added: DiffEntry[] = [];
  const removed: DiffEntry[] = [];
  const modified: DiffEntry[] = [];

  for (const [key, newEntity] of newMap) {
    const oldEntity = oldMap.get(key);
    if (!oldEntity) {
      added.push({
        entityType: newEntity.entityType,
        entityId: newEntity.id,
        entityName: newEntity.name,
        changeType: "added",
        newData: newEntity.data,
      });
    } else {
      const modifiedFields = findModifiedFields(oldEntity.data, newEntity.data);
      if (modifiedFields.length > 0) {
        modified.push({
          entityType: newEntity.entityType,
          entityId: newEntity.id,
          entityName: newEntity.name,
          changeType: "modified",
          oldData: oldEntity.data,
          newData: newEntity.data,
          modifiedFields,
        });
      }
    }
  }

  for (const [key, oldEntity] of oldMap) {
    if (!newMap.has(key)) {
      removed.push({
        entityType: oldEntity.entityType,
        entityId: oldEntity.id,
        entityName: oldEntity.name,
        changeType: "removed",
        oldData: oldEntity.data,
      });
    }
  }

  const byEntityType: Record<string, { added: number; removed: number; modified: number }> = {};
  for (const entry of [...added, ...removed, ...modified]) {
    if (!byEntityType[entry.entityType]) {
      byEntityType[entry.entityType] = { added: 0, removed: 0, modified: 0 };
    }
    byEntityType[entry.entityType][entry.changeType]++;
  }

  return {
    added,
    removed,
    modified,
    summary: {
      totalAdded: added.length,
      totalRemoved: removed.length,
      totalModified: modified.length,
      byEntityType,
    },
  };
}

function findModifiedFields(oldData: Record<string, unknown>, newData: Record<string, unknown>): string[] {
  const fields: string[] = [];
  const allKeys = new Set([...Object.keys(oldData), ...Object.keys(newData)]);
  for (const key of allKeys) {
    if (key === "createdAt" || key === "updatedAt") continue;
    if (JSON.stringify(oldData[key]) !== JSON.stringify(newData[key])) {
      fields.push(key);
    }
  }
  return fields;
}

const RULE_ACTION_MAP: Record<string, { impact: MigrationPlanItem["impact"]; action: string; reasonCode: string }> = {
  alias_object_id: { impact: "alias", action: "Alias entity ID", reasonCode: "ID_ALIASED" },
  replace_node: { impact: "replace", action: "Replace entity", reasonCode: "ENTITY_REPLACED" },
  retire_node: { impact: "archive", action: "Retire entity", reasonCode: "ENTITY_RETIRED" },
  deprecate_node: { impact: "archive", action: "Deprecate entity", reasonCode: "ENTITY_DEPRECATED" },
  move_node: { impact: "replace", action: "Move entity to new location", reasonCode: "ENTITY_MOVED" },
  refund_cost: { impact: "refund", action: "Refund cost for entity", reasonCode: "COST_REFUNDED" },
  grandfather_access: { impact: "preserve", action: "Grandfather existing access", reasonCode: "ACCESS_GRANDFATHERED" },
  grant_entitlement: { impact: "grant", action: "Grant new entitlement", reasonCode: "ENTITLEMENT_GRANTED" },
  archive_legacy_item: { impact: "archive", action: "Archive legacy item", reasonCode: "ITEM_ARCHIVED" },
};

export function buildMigrationPlan(
  programId: string,
  sourceVersion: string,
  targetVersion: string,
  rules: MigrationRule[],
  sampleUserState?: SampleUserState
): MigrationPlan {
  const items: MigrationPlanItem[] = [];

  for (const rule of rules) {
    const mapping = RULE_ACTION_MAP[rule.ruleType];
    if (!mapping) continue;

    items.push({
      action: mapping.action,
      ruleType: rule.ruleType as MigrationRuleType,
      ruleId: rule.id,
      sourceEntityId: rule.sourceEntityId,
      sourceEntityType: rule.sourceEntityType,
      targetEntityId: rule.targetEntityId,
      targetEntityType: rule.targetEntityType,
      reasonCode: mapping.reasonCode,
      description: rule.description || mapping.action,
      impact: mapping.impact,
      config: (rule.config as Record<string, unknown>) || {},
    });
  }

  const summary = {
    preserved: items.filter(i => i.impact === "preserve").length,
    replaced: items.filter(i => i.impact === "replace").length,
    refunded: items.filter(i => i.impact === "refund").length,
    archived: items.filter(i => i.impact === "archive").length,
    granted: items.filter(i => i.impact === "grant").length,
    aliased: items.filter(i => i.impact === "alias").length,
  };

  const plan: MigrationPlan = { programId, sourceVersion, targetVersion, items, summary };

  if (sampleUserState) {
    plan.sampleUserImpact = computeSampleUserImpact(items, sampleUserState);
  }

  return plan;
}

export interface SampleUserState {
  ownedEntityIds: string[];
  currencyBalances?: Record<string, number>;
}

function computeSampleUserImpact(
  items: MigrationPlanItem[],
  userState: SampleUserState
): SampleUserImpact {
  const ownedSet = new Set(userState.ownedEntityIds);
  const ownedEntitiesAffected: string[] = [];
  const entitlementsPreserved: string[] = [];
  const entitlementsReplaced: Array<{ from: string; to: string }> = [];
  const refunds: Array<{ entityId: string; reason: string }> = [];
  const newGrants: string[] = [];
  const grandfathered: string[] = [];

  for (const item of items) {
    const sourceOwned = item.sourceEntityId && ownedSet.has(item.sourceEntityId);

    switch (item.impact) {
      case "replace":
        if (sourceOwned && item.sourceEntityId && item.targetEntityId) {
          ownedEntitiesAffected.push(item.sourceEntityId);
          entitlementsReplaced.push({ from: item.sourceEntityId, to: item.targetEntityId });
        }
        break;
      case "preserve":
        if (sourceOwned && item.sourceEntityId) {
          ownedEntitiesAffected.push(item.sourceEntityId);
          grandfathered.push(item.sourceEntityId);
          entitlementsPreserved.push(item.sourceEntityId);
        }
        break;
      case "refund":
        if (sourceOwned && item.sourceEntityId) {
          ownedEntitiesAffected.push(item.sourceEntityId);
          refunds.push({ entityId: item.sourceEntityId, reason: item.description });
        }
        break;
      case "archive":
        if (sourceOwned && item.sourceEntityId) {
          ownedEntitiesAffected.push(item.sourceEntityId);
        }
        break;
      case "grant":
        if (item.targetEntityId) {
          newGrants.push(item.targetEntityId);
        }
        break;
      case "alias":
        if (sourceOwned && item.sourceEntityId) {
          ownedEntitiesAffected.push(item.sourceEntityId);
          entitlementsPreserved.push(item.sourceEntityId);
        }
        break;
    }
  }

  return { ownedEntitiesAffected, entitlementsPreserved, entitlementsReplaced, refunds, newGrants, grandfathered };
}

export function buildManifestSnapshot(
  tracks: Array<{ id: string; name: string; type: string; programId: string; lifecycleState: string }>,
  branches: Array<{ id: string; name: string; trackId: string; displayOrder: number; description?: string | null }>,
  nodes: Array<{ id: string; name: string; branchId: string; lifecycleState: string; displayOrder: number; costBundle: Record<string, unknown> | null; rewardBundle: Record<string, unknown> | null; prerequisiteNodeIds: string[] | null; description?: string | null }>,
  rankLevels: Array<{ id: string; name: string; trackId: string; displayOrder: number; thresholdRules: Record<string, unknown>[] | null; grants: Record<string, unknown> | null }>,
  badges: Array<{ id: string; name: string; trackId: string; lifecycleState: string; criteria: Record<string, unknown>[] | null; rewardBundle: Record<string, unknown> | null; description?: string | null; tier?: string | null }>,
  currencies: Array<{ id: string; name: string; type: string; symbol?: string | null }>
): ManifestSnapshot {
  return {
    tracks: tracks.map(t => ({
      id: t.id, name: t.name, entityType: "track", parentId: t.programId,
      lifecycleState: t.lifecycleState, data: { ...t },
    })),
    branches: branches.map(b => ({
      id: b.id, name: b.name, entityType: "branch", parentId: b.trackId,
      data: { ...b },
    })),
    nodes: nodes.map(n => ({
      id: n.id, name: n.name, entityType: "node", parentId: n.branchId,
      lifecycleState: n.lifecycleState, data: { ...n },
    })),
    rankLevels: rankLevels.map(r => ({
      id: r.id, name: r.name, entityType: "rankLevel", parentId: r.trackId,
      data: { ...r },
    })),
    badges: badges.map(b => ({
      id: b.id, name: b.name, entityType: "badge", parentId: b.trackId,
      lifecycleState: b.lifecycleState, data: { ...b },
    })),
    currencies: currencies.map(c => ({
      id: c.id, name: c.name, entityType: "currency",
      data: { ...c },
    })),
  };
}
