import type { Player, SaveData } from './types';

const KEY = 'the-gnar-v5';

export const DEFAULT_PLAYER: Player = {
  name: 'Skater',
  cash: 100,
  totalScore: 0,
  bestScores: {},
  rivalsBeaten: [],
  unlockedCities: ['seattle'],
  // Legacy fields
  stats: { pop: 2, speed: 2, balance: 2, style: 1, nerve: 1, endurance: 2 },
  equipment: { deck: 1, trucks: 1, wheels: 1, bearings: 1, shoes: 1 },
  completedChallenges: [],
  unlockedLevels: ['seattle'],
  unlockedTricks: ['ollie', 'manual', 'kickflip', 'heelflip', 'pop-shove-it'],
  cityCredits: {},
  collectibles: [],
};

export function saveGame(player: Player): void {
  try {
    const data: SaveData = { player, version: '5.0' };
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch { /* ignore */ }
}

export function loadGame(): Player {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULT_PLAYER };
    const data: SaveData = JSON.parse(raw);
    if (data.version !== '5.0') return { ...DEFAULT_PLAYER };
    return { ...DEFAULT_PLAYER, ...data.player };
  } catch {
    return { ...DEFAULT_PLAYER };
  }
}

export function clearSave(): void {
  localStorage.removeItem(KEY);
}

// Legacy export expected by old ShopScreen
export function getEquipmentBonus(player: Player): Partial<import('./types').PlayerStats> {
  const bonus: Partial<import('./types').PlayerStats> = {
    pop: 0, speed: 0, balance: 0, style: 0, nerve: 0, endurance: 0,
  };
  const eq = player.equipment;
  if (eq.deck > 1)     { bonus.pop! += eq.deck - 1; }
  if (eq.trucks > 1)   { bonus.balance! += eq.trucks - 1; }
  if (eq.wheels > 1)   { bonus.speed! += eq.wheels - 1; }
  if (eq.bearings > 1) { bonus.speed! += Math.floor((eq.bearings - 1) / 2); }
  if (eq.shoes > 1)    { bonus.balance! += Math.floor((eq.shoes - 1) / 2); }
  return bonus;
}
