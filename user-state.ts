import { z } from "zod";

export const userBalanceSchema = z.object({
  currencyId: z.string(),
  balance: z.number(),
  cumulativeEarned: z.number().default(0),
});

export type UserBalance = z.infer<typeof userBalanceSchema>;

export const userStateSchema = z.object({
  balances: z.array(userBalanceSchema).default([]),
  ownedNodeIds: z.array(z.string()).default([]),
  earnedBadgeIds: z.array(z.string()).default([]),
  claimedBadgeIds: z.array(z.string()).default([]),
  currentRankId: z.string().nullable().default(null),
});

export type UserState = z.infer<typeof userStateSchema>;
