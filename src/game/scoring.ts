// Simple arcade scoring — transparent and satisfying

export const POINTS = {
  ollie:   150,
  kickflip:300,
  heelflip:300,
  slide:   100,
  grind:   50,   // per frame tick
  dodge:   200,  // clearing a barrier without trick
  gap:     400,
};

export function comboMultiplier(combo: number): number {
  // 1x, 1.5x, 2x, 2.5x … capped at 5x
  return Math.min(1 + (combo - 1) * 0.5, 5);
}

export function formatScore(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}K`;
  return `${n}`;
}

export function grade(score: number): { letter: string; color: string } {
  if (score >= 30000) return { letter: 'S', color: '#FFD700' };
  if (score >= 18000) return { letter: 'A', color: '#00ff88' };
  if (score >= 8000)  return { letter: 'B', color: '#5bc0eb' };
  if (score >= 3000)  return { letter: 'C', color: '#ffffff' };
  return               { letter: 'D', color: '#888888' };
}
