import type { ApprovalPolicy } from '../types';
import { PRODUCT_POLICY } from '../config/productPolicy';

export interface ApprovalFacts {
  policy: ApprovalPolicy;
  tasksDone: number;
  tasksTotal: number;
  quickCheckScore: number;
  quickCheckTotal: number;
  hasEvidence: boolean;
}

export type ApprovalDecision =
  | { status: 'approved'; reason: 'auto_policy' | 'evidence_policy' }
  | { status: 'awaiting_parent'; reason: 'parent_required' | 'incomplete' | 'evidence_missing' };

export function resolveApprovalPolicy(facts: ApprovalFacts): ApprovalDecision {
  const tasksComplete = facts.tasksTotal > 0 && facts.tasksDone === facts.tasksTotal;
  const quickCheckPassed = facts.quickCheckTotal === 0
    || facts.quickCheckScore / facts.quickCheckTotal >= PRODUCT_POLICY.quickCheckPassRatio;

  if (!tasksComplete || !quickCheckPassed) {
    return { status: 'awaiting_parent', reason: 'incomplete' };
  }
  if (facts.policy === 'auto_approve') {
    return { status: 'approved', reason: 'auto_policy' };
  }
  if (facts.policy === 'evidence_required') {
    return facts.hasEvidence
      ? { status: 'approved', reason: 'evidence_policy' }
      : { status: 'awaiting_parent', reason: 'evidence_missing' };
  }
  return { status: 'awaiting_parent', reason: 'parent_required' };
}
