import { LearningSession } from '../types';

export type ApprovalPolicyResult = 
  | 'PARENT_REQUIRED'
  | 'AUTO_APPROVE'
  | 'EVIDENCE_REQUIRED'
  | 'PARENT_OR_TIMEOUT'
  | 'MANUAL_REVIEW';

export function resolveApprovalPolicy(session: LearningSession): ApprovalPolicyResult {
  if (session.approvalPolicy === 'auto_approve') {
    return 'AUTO_APPROVE';
  }
  if (session.reflection === 'hard' || (session.quickCheckResult && session.quickCheckResult.startsWith('3/5'))) {
    return 'PARENT_REQUIRED';
  }
  if (session.approvalPolicy === 'evidence_required' && !session.evidencePhoto) {
    return 'EVIDENCE_REQUIRED';
  }
  return 'PARENT_REQUIRED';
}
