import type { RolloutConfig } from "@shared/schema";

export interface RolloutUserContext {
  userId?: string;
  cohortTags?: string[];
}

function deterministicHash(input: string): number {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    const char = input.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash);
}

function isUserInPercentage(userId: string, manifestId: string, percentage: number): boolean {
  if (percentage >= 100) return true;
  if (percentage <= 0) return false;
  const bucket = deterministicHash(`${userId}:${manifestId}`) % 100;
  return bucket < percentage;
}

export interface RolloutDecision {
  shouldServeNewManifest: boolean;
  reason: string;
}

export function evaluateRollout(
  config: RolloutConfig | null,
  userContext: RolloutUserContext
): RolloutDecision {
  if (!config) {
    return { shouldServeNewManifest: true, reason: "no_rollout_config" };
  }

  if (config.status === "paused" || config.status === "rolled_back") {
    return { shouldServeNewManifest: false, reason: `rollout_${config.status}` };
  }

  if (config.status === "staging" && config.rolloutType !== "internal_only") {
    return { shouldServeNewManifest: false, reason: "rollout_staging" };
  }

  switch (config.rolloutType) {
    case "immediate":
      return { shouldServeNewManifest: true, reason: "immediate_rollout" };

    case "percentage": {
      if (config.percentage >= 100) {
        return { shouldServeNewManifest: true, reason: "percentage_100" };
      }
      if (config.percentage <= 0) {
        return { shouldServeNewManifest: false, reason: "percentage_0" };
      }
      if (!userContext.userId) {
        return { shouldServeNewManifest: false, reason: "no_user_id_for_percentage" };
      }
      const inBucket = isUserInPercentage(userContext.userId, config.manifestId, config.percentage);
      return {
        shouldServeNewManifest: inBucket,
        reason: inBucket ? "in_percentage_bucket" : "outside_percentage_bucket",
      };
    }

    case "cohort": {
      const userTags = userContext.cohortTags || [];
      const configTags = config.cohortTags || [];
      if (configTags.length === 0) {
        return { shouldServeNewManifest: false, reason: "no_cohort_tags_configured" };
      }
      const hasMatch = configTags.some(tag => userTags.includes(tag));
      return {
        shouldServeNewManifest: hasMatch,
        reason: hasMatch ? "cohort_match" : "no_cohort_match",
      };
    }

    case "internal_only": {
      const internalIds = config.internalUserIds || [];
      if (!userContext.userId || internalIds.length === 0) {
        return { shouldServeNewManifest: false, reason: "not_internal_user" };
      }
      const isInternal = internalIds.includes(userContext.userId);
      return {
        shouldServeNewManifest: isInternal,
        reason: isInternal ? "internal_user" : "not_internal_user",
      };
    }

    default:
      return { shouldServeNewManifest: true, reason: "unknown_rollout_type" };
  }
}
