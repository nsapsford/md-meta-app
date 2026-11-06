// Spaced-repetition scheduling for the Line Trainer (SM-2 style, four
// self-grades). Pure so it can be unit-tested; the route persists the result.

export type Grade = 'again' | 'hard' | 'good' | 'easy';
export const GRADES: readonly Grade[] = ['again', 'hard', 'good', 'easy'];

export interface ReviewState {
  ease: number;
  interval_days: number;
  reps: number;
  lapses: number;
  due_at: number; // epoch seconds
}

export const DEFAULT_EASE = 2.5;
export const MIN_EASE = 1.3;
const DAY = 86_400;
// A missed item comes back within the same session.
const RELEARN_SECONDS = 10 * 60;

export function newReviewState(now: number): ReviewState {
  return { ease: DEFAULT_EASE, interval_days: 0, reps: 0, lapses: 0, due_at: now };
}

export function isGrade(v: unknown): v is Grade {
  return typeof v === 'string' && (GRADES as readonly string[]).includes(v);
}

export function schedule(prev: ReviewState, grade: Grade, now: number): ReviewState {
  if (grade === 'again') {
    return {
      ease: Math.max(MIN_EASE, prev.ease - 0.2),
      interval_days: 0,
      reps: 0,
      lapses: prev.lapses + 1,
      due_at: now + RELEARN_SECONDS,
    };
  }

  if (grade === 'hard') {
    const interval = Math.max(1, prev.interval_days * 1.2);
    return {
      ease: Math.max(MIN_EASE, prev.ease - 0.15),
      interval_days: interval,
      reps: prev.reps + 1,
      lapses: prev.lapses,
      due_at: now + Math.round(interval * DAY),
    };
  }

  // good / easy
  let interval: number;
  if (prev.reps === 0) interval = 1;
  else if (prev.reps === 1) interval = 3;
  else interval = Math.max(1, prev.interval_days) * prev.ease;

  let ease = prev.ease;
  if (grade === 'easy') {
    interval *= 1.3;
    ease += 0.15;
  }

  return {
    ease,
    interval_days: interval,
    reps: prev.reps + 1,
    lapses: prev.lapses,
    due_at: now + Math.round(interval * DAY),
  };
}
