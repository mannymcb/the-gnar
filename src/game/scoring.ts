/**
 * THE GNAR – Simple Arcade Scoring
 *
 * Do tricks → land clean → build combo → score more.
 * No hidden modifiers. No complexity.
 */
import type { Trick, TrickResult } from './types';

// ─── BASE POINTS BY CATEGORY ─────────────────────────────────────────────────
// These are the canonical values. tricks.ts points field is still used for
// display purposes but the real score comes from here.
const BASE: Record<string, number> = {
  ollie:   100,
  manual:  150,
  flip:    250,
  grind:   300,
  gap:     400,
};

export function getTrickBase(trick: Trick): number {
  // Named tricks that deserve individual values
  const named: Record<string, number> = {
    'ollie':          100,
    'pop-shove-it':   150,
    'manual':         150,
    'kickflip':       250,
    'heelflip':       250,
    'nosegrind':      300,
    'varial-flip':    350,
    'hardflip':       350,
    'fs-flip':        350,
    'tre-flip':       400,
    'bigspin':        400,
    'crooked-grind':  400,
    'nollie-flip':    400,
    'inward-heel':    450,
    'laser-flip':     500,
  };
  return named[trick.id] ?? BASE[trick.category] ?? 200;
}

// ─── LANDING MULTIPLIER ───────────────────────────────────────────────────────
// Clean  = 100%  (tap in green zone)
// Sketchy = 50%  (tap in yellow zone)
// Bail   = 0     (red zone or timeout)
export function landingMultiplier(quality: TrickResult['landingQuality']): number {
  switch (quality) {
    case 'perfect': return 1;   // 'perfect' = same as clean in this model
    case 'clean':   return 1;
    case 'sloppy':  return 0.5; // 'sloppy' = sketchy
    case 'bail':    return 0;
  }
}

// ─── BONUSES ─────────────────────────────────────────────────────────────────
export const BONUS_PERFECT_LANDING = 100;
export const BONUS_GRIND_SPARK     = 100;
export const BONUS_RUN_FINISH      = 500;

// ─── COMBO ───────────────────────────────────────────────────────────────────
// Multiplier = combo count, capped at 5
export function comboToMultiplier(combo: number): number {
  return Math.min(combo, 5);
}

// ─── MAIN SCORE FUNCTION ─────────────────────────────────────────────────────
export function scoreTrick(
  trick: Trick,
  quality: TrickResult['landingQuality'],
  combo: number,   // combo BEFORE this trick (0-based)
): TrickResult {
  const base    = getTrickBase(trick);
  const lMult   = landingMultiplier(quality);
  const cMult   = comboToMultiplier(combo + 1); // +1 because this trick completes the chain
  const perfect = quality === 'perfect' || quality === 'clean'; // both are "clean" in new model
  const bonus   = perfect ? BONUS_PERFECT_LANDING : 0;
  const total   = Math.round(base * lMult * cMult) + bonus;

  return {
    trick,
    points: base,
    multiplier: cMult,
    total,
    landingQuality: quality,
    timestamp: Date.now(),
  };
}

// ─── HELPERS ─────────────────────────────────────────────────────────────────
export function formatScore(score: number): string {
  if (score >= 1_000_000) return `${(score / 1_000_000).toFixed(1)}M`;
  if (score >= 1_000)     return `${(score / 1_000).toFixed(1)}K`;
  return score.toString();
}

export function getLetterGrade(score: number): string {
  if (score >= 15000) return 'S';
  if (score >= 8000)  return 'A';
  if (score >= 4000)  return 'B';
  if (score >= 1500)  return 'C';
  if (score >= 500)   return 'D';
  return 'F';
}

export function getGradeColor(grade: string): string {
  const c: Record<string, string> = {
    S: '#FFD700', A: '#00ff88', B: '#5bc0eb',
    C: '#ffffff', D: '#888',    F: '#e94560',
  };
  return c[grade] ?? '#fff';
}

// Legacy shim – SkateRun calls getNextMultiplier in a couple spots.
// With the new model, multiplier is purely derived from combo count.
// This just returns 1 so callers don't crash; actual mult is recalculated
// from g.combo each time scoreTrick is called.
export function getNextMultiplier(): number { return 1; }

// Legacy shim – kept so RunResults/SpotDetail imports don't break.
export function calculateTrickScore(
  trick: Trick,
  quality: TrickResult['landingQuality'],
  session: { combo: number },
): TrickResult {
  return scoreTrick(trick, quality, session.combo);
}
