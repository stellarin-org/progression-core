import type { UserState } from "./user-state";
import { ReasonCode } from "./reason-codes";
import { thresholdRuleSchema, type ThresholdRule } from "./types";
import { z } from "zod";

export interface RankLevelInput {
  id: string;
  displayOrder: number;
  thresholdRules: Record<string, unknown>[] | null;
  grants: Record<string, unknown> | null;
  [key: string]: unknown;
}

export interface RankEvaluation {
  storedRankId: string | null;
  currentRank: RankLevelInput | null;
  currentRankIndex: number;
  computedRank: RankLevelInput | null;
  computedRankIndex: number;
  rankAdvanced: boolean;
  nextRank: RankLevelInput | null;
  nextThreshold: ThresholdDetail[] | null;
  pendingGrants: Record<string, unknown> | null;
  allLevels: RankLevelStatus[];
}

export interface ThresholdDetail {
  currencyId: string;
  operator: string;
  required: number;
  current: number;
  met: boolean;
}

export interface RankLevelStatus {
  level: RankLevelInput;
  achieved: boolean;
  reasons: ReasonCode[];
  thresholdDetails: ThresholdDetail[];
}

function getBalance(userState: UserState, currencyId: string): number {
  const entry = userState.balances.find((b) => b.currencyId === currencyId);
  return entry ? entry.cumulativeEarned : 0;
}

function compareThreshold(
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
    default:
      return false;
  }
}

function parseThresholdRules(raw: Record<string, unknown>[]): ThresholdRule[] {
  const parsed = z.array(thresholdRuleSchema).safeParse(raw);
  return parsed.success ? parsed.data : [];
}

function evaluateThresholds(
  rawRules: Record<string, unknown>[],
  userState: UserState,
): { met: boolean; details: ThresholdDetail[] } {
  const rules = parseThresholdRules(rawRules);
  const details: ThresholdDetail[] = [];
  let allMet = true;

  for (const rule of rules) {
    const current = getBalance(userState, rule.currencyId);
    const met = compareThreshold(rule.operator, current, rule.value);

    details.push({
      currencyId: rule.currencyId,
      operator: rule.operator,
      required: rule.value,
      current,
      met,
    });
    if (!met) allMet = false;
  }

  return { met: allMet, details };
}

export function evaluateRanks(
  levels: RankLevelInput[],
  userState: UserState,
): RankEvaluation {
  const sorted = [...levels].sort((a, b) => a.displayOrder - b.displayOrder);

  const storedRankId = userState.currentRankId || null;
  let storedRankIndex = -1;

  if (storedRankId) {
    const idx = sorted.findIndex((l) => l.id === storedRankId);
    if (idx !== -1) {
      storedRankIndex = idx;
    }
  }

  let computedRank: RankLevelInput | null = null;
  let computedRankIndex = -1;

  const allLevels: RankLevelStatus[] = sorted.map((level, idx) => {
    const thresholdRules = level.thresholdRules || [];
    const { met, details } = evaluateThresholds(thresholdRules, userState);

    const reasons: ReasonCode[] = met
      ? [ReasonCode.THRESHOLD_MET]
      : [ReasonCode.THRESHOLD_NOT_MET];

    if (met) {
      computedRank = level;
      computedRankIndex = idx;
    }

    return { level, achieved: met, reasons, thresholdDetails: details };
  });

  const effectiveRankIndex = Math.max(storedRankIndex, computedRankIndex);
  const currentRank =
    effectiveRankIndex >= 0 ? sorted[effectiveRankIndex] : null;
  const rankAdvanced = computedRankIndex > storedRankIndex;

  const nextRank =
    effectiveRankIndex + 1 < sorted.length
      ? sorted[effectiveRankIndex + 1]
      : null;

  let nextThreshold: ThresholdDetail[] | null = null;
  if (nextRank) {
    const nextRules = nextRank.thresholdRules || [];
    nextThreshold = evaluateThresholds(nextRules, userState).details;
  }

  const pendingGrants = currentRank?.grants || null;

  return {
    storedRankId,
    currentRank,
    currentRankIndex: effectiveRankIndex,
    computedRank,
    computedRankIndex,
    rankAdvanced,
    nextRank,
    nextThreshold,
    pendingGrants,
    allLevels,
  };
}
