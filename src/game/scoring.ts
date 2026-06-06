import type { Trick, TrickResult, Player, SessionState } from './types';
import { getEquipmentBonus } from './save';

const LANDING_WINDOWS = {
  perfect: { min: 0.85, max: 1.0 },
  clean:   { min: 0.55, max: 0.85 },
  sloppy:  { min: 0.25, max: 0.55 },
  bail:    { min: 0.0,  max: 0.25 },
};

export function getLandingQuality(tapAccuracy: number): TrickResult['landingQuality'] {
  if (tapAccuracy >= LANDING_WINDOWS.perfect.min) return 'perfect';
  if (tapAccuracy >= LANDING_WINDOWS.clean.min) return 'clean';
  if (tapAccuracy >= LANDING_WINDOWS.sloppy.min) return 'sloppy';
  return 'bail';
}

export function calculateTrickScore(
  trick: Trick,
  landingQuality: TrickResult['landingQuality'],
  session: SessionState,
  player: Player,
  levelMultiplier: number,
): TrickResult {
  const eqBonus = getEquipmentBonus(player);

  // Base trick value scaled by player style
  const styleBonus = 1 + ((player.stats.style + (eqBonus.style || 0)) * 0.05);
  let basePoints = trick.points * styleBonus;

  // Landing quality multiplier
  const landingMult = {
    perfect: 1.5,
    clean:   1.0,
    sloppy:  0.5,
    bail:    0,
  }[landingQuality];

  basePoints *= landingMult;

  // Repeat trick penalty
  let repeatPenalty = 1.0;
  if (session.lastTrickId === trick.id) {
    repeatPenalty = Math.max(0.3, 1.0 - session.consecutiveSameTrick * 0.2);
  }
  basePoints *= repeatPenalty;

  // Combo multiplier
  const comboMult = session.multiplier;

  // Level difficulty multiplier
  const total = Math.round(basePoints * comboMult * levelMultiplier);

  return {
    trick,
    points: Math.round(basePoints),
    multiplier: comboMult,
    total,
    landingQuality,
    timestamp: Date.now(),
  };
}

export function getNextMultiplier(
  current: number,
  landingQuality: TrickResult['landingQuality'],
  player: Player,
): number {
  if (landingQuality === 'bail') return 1;
  if (landingQuality === 'sloppy') return Math.max(1, current - 0.5);

  const enduranceBonus = player.stats.endurance * 0.05;
  const increment = landingQuality === 'perfect' ? 0.5 + enduranceBonus : 0.25 + enduranceBonus;
  return Math.min(10, current + increment);
}

export function formatScore(score: number): string {
  if (score >= 1_000_000) return `${(score / 1_000_000).toFixed(1)}M`;
  if (score >= 1_000) return `${(score / 1_000).toFixed(1)}K`;
  return score.toString();
}

export function getLetterGrade(score: number, levelMultiplier: number): string {
  const normalized = score / levelMultiplier;
  if (normalized >= 20000) return 'S';
  if (normalized >= 12000) return 'A';
  if (normalized >= 7000)  return 'B';
  if (normalized >= 3000)  return 'C';
  if (normalized >= 1000)  return 'D';
  return 'F';
}

export function getGradeColor(grade: string): string {
  const colors: Record<string, string> = {
    S: '#FFD700',
    A: '#00ff88',
    B: '#5bc0eb',
    C: '#ffffff',
    D: '#888',
    F: '#e94560',
  };
  return colors[grade] ?? '#ffffff';
}

// How long a manual can last based on balance stat
export function getManualDuration(player: Player): number {
  const eqBonus = getEquipmentBonus(player);
  const balance = player.stats.balance + (eqBonus.balance || 0);
  return 2000 + balance * 400; // ms
}

// Landing window size (bigger = more forgiving)
export function getLandingWindowSize(player: Player): number {
  const eqBonus = getEquipmentBonus(player);
  const balance = player.stats.balance + (eqBonus.balance || 0);
  return 0.3 + balance * 0.04; // 0.0–1.0 normalized window size
}
