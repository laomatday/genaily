/**
 * Product-level defaults shared by UI and domain logic.
 *
 * Keep behavioural thresholds here instead of scattering unexplained literals
 * through components. Environment-specific limits still belong in appConfig.
 */
export const PRODUCT_POLICY = Object.freeze({
  quickCheckPassRatio: 0.8,
  defaultScheduleStartTime: '19:30',
  defaultScheduleDurationMinutes: 60,
  defaultGoalMinutes: 60,
  minimumGoalMinutes: 10,
  maximumGoalMinutes: 1_200,
  maximumParentReviewNoteLength: 500,
});

export function percentLabel(ratio: number): string {
  return `${Math.round(ratio * 100)}%`;
}
