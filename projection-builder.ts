import type { UserState } from "./user-state";
import { evaluateRanks, type RankEvaluation, type RankLevelInput } from "./rank-evaluator";
import { evaluateTree, type BranchEvaluation, type BranchInput, type NodeInput } from "./tree-evaluator";
import { evaluateBadges, type BadgeEvaluation, type BadgeInput } from "./badge-evaluator";

export interface TrackInput {
  id: string;
  type: string;
  [key: string]: unknown;
}

export interface TrackProjection {
  track: TrackInput;
  rankEvaluation?: RankEvaluation;
  treeEvaluation?: BranchEvaluation[];
  badgeEvaluation?: BadgeEvaluation[];
}

export interface UserProjection {
  programId: string;
  userState: UserState;
  tracks: TrackProjection[];
}

export interface ManifestData {
  tracks: TrackInput[];
  rankLevelsByTrack: Map<string, RankLevelInput[]>;
  branchesByTrack: Map<string, BranchInput[]>;
  nodesByTrack: Map<string, NodeInput[]>;
  badgesByTrack: Map<string, BadgeInput[]>;
}

export function buildProjection(
  programId: string,
  manifest: ManifestData,
  userState: UserState,
): UserProjection {
  const tracks: TrackProjection[] = manifest.tracks.map((track) => {
    const projection: TrackProjection = { track };

    switch (track.type) {
      case "rank_track": {
        const levels = manifest.rankLevelsByTrack.get(track.id) || [];
        projection.rankEvaluation = evaluateRanks(levels, userState);
        break;
      }
      case "tree_track": {
        const branches = manifest.branchesByTrack.get(track.id) || [];
        const nodes = manifest.nodesByTrack.get(track.id) || [];
        projection.treeEvaluation = evaluateTree(branches, nodes, userState);
        break;
      }
      case "badge_track": {
        const badges = manifest.badgesByTrack.get(track.id) || [];
        projection.badgeEvaluation = evaluateBadges(badges, userState);
        break;
      }
    }

    return projection;
  });

  return { programId, userState, tracks };
}
