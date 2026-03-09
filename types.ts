import { z } from "zod";

const lifecycleStateEnum = z.enum(["draft", "active", "archived"]);
const trackTypeEnum = z.enum(["rank_track", "tree_track", "badge_track"]);
const currencyTypeEnum = z.enum(["earned", "premium", "seasonal"]);

export const thresholdRuleSchema = z.object({
  currencyId: z.string(),
  operator: z.enum(["gte", "lte", "eq", "gt", "lt"]),
  value: z.number(),
});

export type ThresholdRule = z.infer<typeof thresholdRuleSchema>;

export const criteriaRuleSchema = z.object({
  type: z.string(),
  target: z.string().optional(),
  operator: z.enum(["gte", "lte", "eq", "gt", "lt", "contains", "exists"]).optional(),
  value: z.unknown().optional(),
  description: z.string().optional(),
});

export type CriteriaRule = z.infer<typeof criteriaRuleSchema>;

export const costBundleSchema = z.object({
  costs: z.array(z.object({
    currencyId: z.string(),
    amount: z.number(),
  })).default([]),
});

export type CostBundle = z.infer<typeof costBundleSchema>;

export const rewardBundleSchema = z.object({
  rewards: z.array(z.object({
    currencyId: z.string().optional(),
    badgeId: z.string().optional(),
    type: z.enum(["currency", "badge", "unlock"]),
    amount: z.number().optional(),
  })).default([]),
});

export type RewardBundle = z.infer<typeof rewardBundleSchema>;

export const progressionProgramSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  description: z.string().nullable().optional(),
  createdAt: z.date().nullable().optional(),
  updatedAt: z.date().nullable().optional(),
});

export type ProgressionProgram = z.infer<typeof progressionProgramSchema>;

export const progressionTrackSchema = z.object({
  id: z.string(),
  programId: z.string(),
  name: z.string().min(1),
  type: trackTypeEnum,
  description: z.string().nullable().optional(),
  lifecycleState: lifecycleStateEnum,
  createdAt: z.date().nullable().optional(),
  updatedAt: z.date().nullable().optional(),
});

export type ProgressionTrack = z.infer<typeof progressionTrackSchema>;

export const grantsSchema = z.object({
  rewards: z.array(rewardBundleSchema.shape.rewards.element).default([]),
}).passthrough();

export type Grants = z.infer<typeof grantsSchema>;

export const rankLevelSchema = z.object({
  id: z.string(),
  trackId: z.string(),
  name: z.string().min(1),
  displayOrder: z.number().int().min(0),
  thresholdRules: z.array(thresholdRuleSchema.passthrough()),
  grants: grantsSchema,
  createdAt: z.date().nullable().optional(),
  updatedAt: z.date().nullable().optional(),
});

export type RankLevel = z.infer<typeof rankLevelSchema>;

export const progressionBranchSchema = z.object({
  id: z.string(),
  trackId: z.string(),
  name: z.string().min(1),
  description: z.string().nullable().optional(),
  displayOrder: z.number().int().min(0),
  createdAt: z.date().nullable().optional(),
  updatedAt: z.date().nullable().optional(),
});

export type ProgressionBranch = z.infer<typeof progressionBranchSchema>;

export const progressionNodeSchema = z.object({
  id: z.string(),
  branchId: z.string(),
  name: z.string().min(1),
  description: z.string().nullable().optional(),
  lifecycleState: lifecycleStateEnum,
  costBundle: costBundleSchema,
  rewardBundle: rewardBundleSchema,
  prerequisiteNodeIds: z.array(z.string()),
  displayOrder: z.number().int().min(0),
  createdAt: z.date().nullable().optional(),
  updatedAt: z.date().nullable().optional(),
});

export type ProgressionNode = z.infer<typeof progressionNodeSchema>;

export const badgeDefinitionSchema = z.object({
  id: z.string(),
  trackId: z.string(),
  name: z.string().min(1),
  description: z.string().nullable().optional(),
  criteria: z.array(criteriaRuleSchema),
  tier: z.string().nullable().optional(),
  rewardBundle: rewardBundleSchema,
  lifecycleState: lifecycleStateEnum,
  createdAt: z.date().nullable().optional(),
  updatedAt: z.date().nullable().optional(),
});

export type BadgeDefinition = z.infer<typeof badgeDefinitionSchema>;

export const currencyDefinitionSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  symbol: z.string().nullable().optional(),
  type: currencyTypeEnum,
  spendable: z.boolean(),
  cumulative: z.boolean(),
  canReset: z.boolean(),
  canExpire: z.boolean(),
  isHidden: z.boolean(),
  description: z.string().nullable().optional(),
  createdAt: z.date().nullable().optional(),
  updatedAt: z.date().nullable().optional(),
});

export type CurrencyDefinition = z.infer<typeof currencyDefinitionSchema>;
