import type { SaveData, Player } from './types';

const SAVE_KEY = 'the-gnar-save';
const VERSION = '1.1.0';

export const DEFAULT_PLAYER: Player = {
  name: 'Skater',
  stats: {
    pop: 2,
    speed: 2,
    balance: 2,
    style: 1,
    nerve: 1,
    endurance: 2,
  },
  equipment: {
    deck: 1,
    trucks: 1,
    wheels: 1,
    bearings: 1,
    shoes: 1,
  },
  cash: 100,
  totalScore: 0,
  unlockedTricks: ['ollie', 'manual', 'kickflip', 'heelflip', 'pop-shove-it'],
  unlockedLevels: ['seattle'],
  completedChallenges: [],
  cityCredits: {},
  rivalsBeaten: [],
  collectibles: [],
};

export function saveGame(player: Player): void {
  const save: SaveData = {
    player,
    version: VERSION,
    lastSaved: Date.now(),
  };
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(save));
  } catch (e) {
    console.warn('Could not save game:', e);
  }
}

export function loadGame(): Player | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const save: SaveData = JSON.parse(raw);
    if (save.version !== VERSION) {
      // version mismatch — return null to start fresh
      return null;
    }
    return save.player;
  } catch {
    return null;
  }
}

export function clearSave(): void {
  localStorage.removeItem(SAVE_KEY);
}

export function applyStatBonuses(player: Player): Player {
  // Equipment bonuses are applied as multipliers during gameplay,
  // stored separately — this just returns the base player for display
  return player;
}

export function getEquipmentBonus(player: Player): Partial<import('./types').PlayerStats> {
  const bonus: Partial<import('./types').PlayerStats> = {
    pop: 0, speed: 0, balance: 0, style: 0, nerve: 0, endurance: 0,
  };
  const eq = player.equipment;
  // Each equipment level above 1 gives stacking bonuses
  if (eq.deck > 1) { bonus.pop! += eq.deck - 1; bonus.style! += Math.floor((eq.deck - 1) / 2); }
  if (eq.trucks > 1) { bonus.balance! += eq.trucks - 1; }
  if (eq.wheels > 1) { bonus.speed! += eq.wheels - 1; }
  if (eq.bearings > 1) { bonus.speed! += Math.floor((eq.bearings - 1) / 2); }
  if (eq.shoes > 1) { bonus.balance! += Math.floor((eq.shoes - 1) / 2); bonus.style! += eq.shoes - 1; }
  return bonus;
}
