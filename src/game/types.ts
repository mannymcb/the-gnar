// ─── CORE TYPES ──────────────────────────────────────────────────────────────

export type SwipeDirection = 'up' | 'down' | 'left' | 'right';

export interface TrickResult {
  name: string;
  points: number;
  combo: number;
  total: number;
  timestamp: number;
}

// ─── PLAYER ──────────────────────────────────────────────────────────────────

export interface Player {
  name: string;
  cash: number;
  totalScore: number;
  bestScores: Record<string, number>;   // cityId → best score
  rivalsBeaten: string[];               // cityId[]
  unlockedCities: string[];             // cityId[]
}

// ─── RIVAL ───────────────────────────────────────────────────────────────────

export interface Rival {
  name: string;
  nickname: string;
  score: number;
  avatar: string;
  taunt: string;
  defeatLine: string;
  lossLine: string;
}

// ─── CITY ────────────────────────────────────────────────────────────────────

export interface City {
  id: string;
  name: string;
  state: string;
  tagline: string;
  unlockAfter: string | null;   // cityId or null
  rival: Rival;
  palette: {
    sky: [string, string, string];
    ground: string;
    stripe: string;           // road lane stripe colour
  };
  landmark: 'space-needle' | 'golden-gate' | 'st-johns-bridge';
}

// ─── SAVE ────────────────────────────────────────────────────────────────────

export interface SaveData {
  player: Player;
  version: string;
}
