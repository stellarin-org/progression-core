import { z } from "zod";

const manifestRankLevelSchema = z.object({
  id: z.string(),
  name: z.string(),
  displayOrder: z.number(),
  thresholdRules: z.array(z.record(z.unknown())),
  grants: z.record(z.unknown()),
});

const manifestNodeSchema = z.object({
  id: z.string(),
  name: z.string(),
  practaSlug: z.string().nullable(),
  lifecycleState: z.string(),
  displayOrder: z.number(),
  costBundle: z.record(z.unknown()),
  rewardBundle: z.record(z.unknown()),
  prerequisiteNodeIds: z.array(z.string()),
});

const manifestBranchSchema = z.object({
  id: z.string(),
  name: z.string(),
  displayOrder: z.number(),
  nodes: z.array(manifestNodeSchema),
});

const manifestBadgeSchema = z.object({
  id: z.string(),
  name: z.string(),
  lifecycleState: z.string(),
  criteria: z.array(z.record(z.unknown())),
  tier: z.string().nullable(),
  rewardBundle: z.record(z.unknown()),
});

const manifestTrackSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.string(),
  lifecycleState: z.string(),
  rankLevels: z.array(manifestRankLevelSchema).optional(),
  branches: z.array(manifestBranchSchema).optional(),
  badges: z.array(manifestBadgeSchema).optional(),
});

const manifestCurrencySchema = z.object({
  id: z.string(),
  name: z.string(),
  symbol: z.string().nullable(),
  type: z.string(),
  spendable: z.boolean(),
  cumulative: z.boolean(),
  canReset: z.boolean(),
  canExpire: z.boolean(),
  isHidden: z.boolean(),
});

export const manifestArtifactSchema = z.object({
  schemaVersion: z.string(),
  programId: z.string(),
  programName: z.string(),
  generatedAt: z.string(),
  tracks: z.array(manifestTrackSchema),
  currencies: z.array(manifestCurrencySchema),
});

export type ManifestArtifact = z.infer<typeof manifestArtifactSchema>;

export interface SnapshotRankLevel {
  id: string;
  name: string;
  displayOrder: number;
  thresholdRules: Record<string, unknown>[] | null;
  grants: Record<string, unknown> | null;
}

export interface SnapshotNode {
  id: string;
  name: string;
  practaSlug: string | null;
  lifecycleState: string;
  displayOrder: number;
  costBundle: Record<string, unknown> | null;
  rewardBundle: Record<string, unknown> | null;
  prerequisiteNodeIds: string[] | null;
}

export interface SnapshotBranch {
  id: string;
  name: string;
  displayOrder: number;
  nodes: SnapshotNode[];
}

export interface SnapshotBadge {
  id: string;
  name: string;
  lifecycleState: string;
  criteria: Record<string, unknown>[] | null;
  tier: string | null;
  rewardBundle: Record<string, unknown> | null;
}

export interface SnapshotCurrency {
  id: string;
  name: string;
  symbol: string | null;
  type: string;
  spendable: boolean;
  cumulative: boolean;
  canReset: boolean;
  canExpire: boolean;
  isHidden: boolean;
}

export interface ProgramSnapshot {
  program: { id: string; name: string };
  tracks: { id: string; name: string; type: string; lifecycleState: string }[];
  rankLevelsByTrack: Map<string, SnapshotRankLevel[]>;
  branchesWithNodes: Map<string, SnapshotBranch[]>;
  badgesByTrack: Map<string, SnapshotBadge[]>;
  currencies: SnapshotCurrency[];
}

export function generateManifestArtifact(snapshot: ProgramSnapshot): ManifestArtifact {
  const artifact = {
    schemaVersion: "1.0.0",
    programId: snapshot.program.id,
    programName: snapshot.program.name,
    generatedAt: new Date().toISOString(),
    tracks: snapshot.tracks.map(track => {
      const base: Record<string, unknown> = {
        id: track.id,
        name: track.name,
        type: track.type,
        lifecycleState: track.lifecycleState,
      };

      switch (track.type) {
        case "rank_track": {
          const levels = snapshot.rankLevelsByTrack.get(track.id) || [];
          base.rankLevels = levels.map(l => ({
            id: l.id,
            name: l.name,
            displayOrder: l.displayOrder,
            thresholdRules: l.thresholdRules ?? [],
            grants: l.grants ?? {},
          }));
          break;
        }
        case "tree_track": {
          const branches = snapshot.branchesWithNodes.get(track.id) || [];
          base.branches = branches.map(branch => ({
            id: branch.id,
            name: branch.name,
            displayOrder: branch.displayOrder,
            nodes: branch.nodes.map(n => ({
              id: n.id,
              name: n.name,
              practaSlug: n.practaSlug ?? null,
              lifecycleState: n.lifecycleState,
              displayOrder: n.displayOrder,
              costBundle: n.costBundle ?? {},
              rewardBundle: n.rewardBundle ?? {},
              prerequisiteNodeIds: n.prerequisiteNodeIds ?? [],
            })),
          }));
          break;
        }
        case "badge_track": {
          const badges = snapshot.badgesByTrack.get(track.id) || [];
          base.badges = badges.map(b => ({
            id: b.id,
            name: b.name,
            lifecycleState: b.lifecycleState,
            criteria: b.criteria ?? [],
            tier: b.tier,
            rewardBundle: b.rewardBundle ?? {},
          }));
          break;
        }
      }

      return base;
    }),
    currencies: snapshot.currencies.map(c => ({
      id: c.id,
      name: c.name,
      symbol: c.symbol,
      type: c.type,
      spendable: c.spendable,
      cumulative: c.cumulative,
      canReset: c.canReset,
      canExpire: c.canExpire,
      isHidden: c.isHidden,
    })),
  };

  return manifestArtifactSchema.parse(artifact);
}
