export const MIN_GRADE_LEVEL = 1;
export const MAX_GRADE_LEVEL = 12;

export const GRADE_LEVEL_OPTIONS = Object.freeze(
  Array.from(
    { length: MAX_GRADE_LEVEL - MIN_GRADE_LEVEL + 1 },
    (_, index) => MIN_GRADE_LEVEL + index,
  ),
);

export function normalizeGradeLevel(value: unknown): number | null {
  const grade = typeof value === 'number' ? value : Number(value);
  return Number.isInteger(grade) && grade >= MIN_GRADE_LEVEL && grade <= MAX_GRADE_LEVEL
    ? grade
    : null;
}

export function formatGradeLabel(gradeLevel: number | null | undefined): string {
  return gradeLevel ? `Lớp ${gradeLevel}` : 'Chưa cập nhật lớp';
}
