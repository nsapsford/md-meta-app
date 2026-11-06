import { describe, it, expect } from 'vitest';
import { schedule, newReviewState, isGrade, MIN_EASE } from './srsService.js';

const NOW = 1_700_000_000;
const DAY = 86_400;

describe('schedule', () => {
  it('starts a new item due now with default ease', () => {
    expect(newReviewState(NOW)).toEqual({ ease: 2.5, interval_days: 0, reps: 0, lapses: 0, due_at: NOW });
  });

  it('good walks the 1 day -> 3 days -> interval x ease ladder', () => {
    let s = newReviewState(NOW);
    s = schedule(s, 'good', NOW);
    expect(s).toMatchObject({ reps: 1, interval_days: 1, due_at: NOW + DAY });
    s = schedule(s, 'good', NOW);
    expect(s).toMatchObject({ reps: 2, interval_days: 3, due_at: NOW + 3 * DAY });
    s = schedule(s, 'good', NOW);
    expect(s.interval_days).toBeCloseTo(7.5);
    expect(s.due_at).toBe(NOW + Math.round(7.5 * DAY));
  });

  it('again resets reps, counts a lapse, drops ease and relearns in 10 minutes', () => {
    const learned = { ease: 2.5, interval_days: 20, reps: 5, lapses: 0, due_at: NOW };
    const s = schedule(learned, 'again', NOW);
    expect(s).toEqual({ ease: 2.3, interval_days: 0, reps: 0, lapses: 1, due_at: NOW + 600 });
  });

  it('never lets ease fall below the floor', () => {
    let s = { ease: 1.35, interval_days: 2, reps: 3, lapses: 0, due_at: NOW };
    s = schedule(s, 'again', NOW);
    s = schedule(s, 'hard', NOW);
    expect(s.ease).toBe(MIN_EASE);
  });

  it('hard grows the interval slowly with a one-day minimum', () => {
    const fresh = schedule(newReviewState(NOW), 'hard', NOW);
    expect(fresh.interval_days).toBe(1);
    const mature = schedule({ ease: 2.5, interval_days: 10, reps: 4, lapses: 0, due_at: NOW }, 'hard', NOW);
    expect(mature.interval_days).toBeCloseTo(12);
    expect(mature.ease).toBeCloseTo(2.35);
  });

  it('easy outpaces good and raises ease', () => {
    const base = { ease: 2.5, interval_days: 3, reps: 2, lapses: 0, due_at: NOW };
    const good = schedule(base, 'good', NOW);
    const easy = schedule(base, 'easy', NOW);
    expect(easy.interval_days).toBeCloseTo(good.interval_days * 1.3);
    expect(easy.ease).toBeCloseTo(2.65);
  });

  it('after a lapse, good restarts the ladder at one day', () => {
    const lapsed = schedule({ ease: 2.5, interval_days: 30, reps: 6, lapses: 0, due_at: NOW }, 'again', NOW);
    expect(schedule(lapsed, 'good', NOW).interval_days).toBe(1);
  });
});

describe('isGrade', () => {
  it('accepts only the four grades', () => {
    expect(['again', 'hard', 'good', 'easy'].every(isGrade)).toBe(true);
    expect(isGrade('perfect')).toBe(false);
    expect(isGrade(3)).toBe(false);
  });
});
