import type { Player, SaveData } from './types';

const KEY = 'the-gnar-v5';

export const DEFAULT_PLAYER: Player = {
  name: 'Skater',
  cash: 0,
  totalScore: 0,
  bestScores: {},
  rivalsBeaten: [],
  unlockedCities: ['seattle'],
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
