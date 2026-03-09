import type { UserState } from "./user-state";
import { ReasonCode } from "./reason-codes";
import { costBundleSchema, type CostBundle } from "./types";

export interface BranchInput {
  id: string;
  displayOrder: number;
  [key: string]: unknown;
}

export interface NodeInput {
  id: string;
  branchId: string;
  displayOrder: number;
  lifecycleState: string;
  costBundle: Record<string, unknown> | null;
  rewardBundle: Record<string, unknown> | null;
  prerequisiteNodeIds: string[] | null;
  [key: string]: unknown;
}

export interface CostDetail {
  currencyId: string;
  required: number;
  current: number;
  sufficient: boolean;
}

export interface NodeEvaluation {
  node: NodeInput;
  visible: boolean;
  owned: boolean;
  eligible: boolean;
  affordable: boolean;
  reasons: ReasonCode[];
  costDetails: CostDetail[];
}

export interface BranchEvaluation {
  branch: BranchInput;
  nodes: NodeEvaluation[];
}

function getSpendableBalance(
  userState: UserState,
  currencyId: string,
): number {
  const entry = userState.balances.find((b) => b.currencyId === currencyId);
  return entry ? entry.balance : 0;
}

function parseCostBundle(raw: Record<string, unknown> | null): CostBundle {
  const parsed = costBundleSchema.safeParse(raw || {});
  return parsed.success ? parsed.data : { costs: [] };
}

export function evaluateTree(
  branches: BranchInput[],
  nodes: NodeInput[],
  userState: UserState,
): BranchEvaluation[] {
  const nodesByBranch = new Map<string, NodeInput[]>();
  for (const node of nodes) {
    const list = nodesByBranch.get(node.branchId) || [];
    list.push(node);
    nodesByBranch.set(node.branchId, list);
  }

  const ownedSet = new Set(userState.ownedNodeIds);

  const sortedBranches = [...branches].sort(
    (a, b) => a.displayOrder - b.displayOrder,
  );

  return sortedBranches.map((branch) => {
    const branchNodes = (nodesByBranch.get(branch.id) || []).sort(
      (a, b) => a.displayOrder - b.displayOrder,
    );

    const nodeEvals: NodeEvaluation[] = branchNodes.map((node) => {
      const reasons: ReasonCode[] = [];
      const costDetails: CostDetail[] = [];

      const owned = ownedSet.has(node.id);
      if (owned) {
        reasons.push(ReasonCode.OWNED);
        return {
          node,
          visible: true,
          owned: true,
          eligible: true,
          affordable: true,
          reasons,
          costDetails,
        };
      }

      const isActive = node.lifecycleState === "active";
      if (!isActive) {
        reasons.push(ReasonCode.NODE_INACTIVE);
        return {
          node,
          visible: false,
          owned: false,
          eligible: false,
          affordable: false,
          reasons,
          costDetails,
        };
      }

      const prereqs = node.prerequisiteNodeIds || [];
      const prereqsMet = prereqs.every((pid) => ownedSet.has(pid));
      if (!prereqsMet) {
        reasons.push(ReasonCode.PREREQUISITE_NOT_OWNED);
      }

      const { costs } = parseCostBundle(node.costBundle);
      let affordable = true;
      for (const cost of costs) {
        const current = getSpendableBalance(userState, cost.currencyId);
        const sufficient = current >= cost.amount;
        costDetails.push({
          currencyId: cost.currencyId,
          required: cost.amount,
          current,
          sufficient,
        });
        if (!sufficient) {
          affordable = false;
          reasons.push(ReasonCode.INSUFFICIENT_CURRENCY);
        }
      }

      const eligible = prereqsMet;
      if (eligible && affordable) {
        reasons.push(ReasonCode.ELIGIBLE);
      }

      return {
        node,
        visible: true,
        owned: false,
        eligible,
        affordable,
        reasons,
        costDetails,
      };
    });

    return { branch, nodes: nodeEvals };
  });
}
