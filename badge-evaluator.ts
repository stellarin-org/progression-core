import type { UserState } from "./user-state";
import { ReasonCode } from "./reason-codes";
import { criteriaRuleSchema, type CriteriaRule } from "./types";
import { z } from "zod";

export interface BadgeInput {
  id: string;
  trackId: string;
  lifecycleState: string;
  criteria: Record<string, unknown>[] | null;
  rewardBundle: Record<string, unknown> | null;
  [key: string]: unknown;
}

export interface CriteriaProgress {
  type: string;
  target?: string;
  description?: string;
  met: boolean;
}

export interface BadgeEvaluation {
  badge: BadgeInput;
  earned: boolean;
  claimed: boolean;
  claimable: boolean;
  criteriaProgress: CriteriaProgress[];
  reasons: ReasonCode[];
}

function parseCriteria(raw: Record<string, unknown>[]): CriteriaRule[] {
  const parsed = z.array(criteriaRuleSchema).safeParse(raw);
  return parsed.success ? parsed.data : [];
}

function evaluateSingleCriterion(
  criterion: CriteriaRule,
  userState: UserState,
): boolean {
  const operator = criterion.operator || "gte";
  const value = criterion.value;

  switch (criterion.type) {
    case "currency_threshold": {
      if (!criterion.target) return false;
      const entry = userState.balances.find((b) => b.currencyId === criterion.target);
      const current = entry ? entry.cumulativeEarned : 0;
      const required = typeof value === "number" ? value : 0;
      return compareValue(operator, current, required);
    }
    case "node_owned": {
      if (!criterion.target) return false;
      return userState.ownedNodeIds.includes(criterion.target);
    }
    case "badge_earned": {
      if (!criterion.target) return false;
      return userState.earnedBadgeIds.includes(criterion.target);
    }
    case "nodes_owned_count": {
      const required = typeof value === "number" ? value : 0;
      return compareValue(operator, userState.ownedNodeIds.length, required);
    }
    case "collection_contains": {
      if (!criterion.target) return false;
      if (operator === "contains") {
        return userState.ownedNodeIds.includes(criterion.target) || userState.earnedBadgeIds.includes(criterion.target);
      }
      return false;
    }
    default:
      return false;
  }
}

function compareValue(
  operator: string,
  actual: number,
  required: number,
): boolean {
  switch (operator) {
    case "gte":
      return actual >= required;
    case "gt":
      return actual > required;
    case "lte":
      return actual <= required;
    case "lt":
      return actual < required;
    case "eq":
      return actual === required;
    case "contains":
    case "exists":
      return actual > 0;
    default:
      return false;
  }
}

export function evaluateBadges(
  badges: BadgeInput[],
  userState: UserState,
): BadgeEvaluation[] {
  return badges.map((badge) => {
    const reasons: ReasonCode[] = [];

    if (badge.lifecycleState !== "active") {
      reasons.push(ReasonCode.BADGE_INACTIVE);
      return {
        badge,
        earned: false,
        claimed: false,
        claimable: false,
        criteriaProgress: [],
        reasons,
      };
    }

    const alreadyEarned = userState.earnedBadgeIds.includes(badge.id);
    const alreadyClaimed = userState.claimedBadgeIds.includes(badge.id);

    const rawCriteria = badge.criteria || [];
    const criteria = parseCriteria(rawCriteria);
    const criteriaProgress: CriteriaProgress[] = criteria.map((c) => ({
      type: c.type,
      target: c.target,
      description: c.description,
      met: evaluateSingleCriterion(c, userState),
    }));

    const allCriteriaMet = criteriaProgress.every((cp) => cp.met);
    const earned = alreadyEarned || allCriteriaMet;
    const claimed = alreadyClaimed && earned;

    if (alreadyEarned) {
      reasons.push(ReasonCode.ALREADY_EARNED);
      if (claimed) {
        reasons.push(ReasonCode.OWNED);
      } else {
        reasons.push(ReasonCode.CLAIMABLE);
      }
    } else if (allCriteriaMet) {
      reasons.push(ReasonCode.EARNED);
      reasons.push(ReasonCode.CLAIMABLE);
    } else {
      reasons.push(ReasonCode.CRITERIA_NOT_MET);
    }

    return {
      badge,
      earned,
      claimed,
      claimable: earned && !claimed,
      criteriaProgress,
      reasons,
    };
  });
}
