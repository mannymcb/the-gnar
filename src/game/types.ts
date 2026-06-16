// ─── CORE TYPES ───────────────────────────────────────────────────────────────

export type SwipeDirection = 'up' | 'down' | 'left' | 'right';

export interface TrickResult {
  name: string;
  points: number;
  combo: number;
  total: number;
  timestamp: number;
}

// ─── TRICK ────────────────────────────────────────────────────────────────────

export type TrickCategory = 'flip' | 'grind' | 'manual' | 'ollie' | 'special';

export interface Trick {
  id: string;
  name: string;
  points: number;
  category: TrickCategory;
  difficulty: number;
  gesture: 'swipe-up' | 'swipe-down' | 'swipe-left' | 'swipe-right' | 'hold-left' | 'hold-right' | 'hold-up';
  unlockLevel: number;
}

// ─── EQUIPMENT ────────────────────────────────────────────────────────────────

export interface Equipment {
  deck: number;
  trucks: number;
  wheels: number;
  bearings: number;
  shoes: number;
}

// ─── PLAYER STATS ─────────────────────────────────────────────────────────────

export interface PlayerStats {
  pop: number;
  speed: number;
  balance: number;
  style: number;
  nerve: number;
  endurance: number;
}

// ─── SHOP ITEM ────────────────────────────────────────────────────────────────

export interface ShopItem {
  id: string;
  name: string;
  category: keyof Equipment;
  level: number;
  price: number;
  description: string;
  statBonus: Partial<PlayerStats>;
}

// ─── PLAYER ───────────────────────────────────────────────────────────────────

export interface Player {
  name: string;
  cash: number;
  totalScore: number;
  bestScores: Record<string, number>;
  rivalsBeaten: string[];
  unlockedCities: string[];
  // Legacy fields expected by usePlayer.ts / old screens
  stats: PlayerStats;
  equipment: Equipment;
  completedChallenges: string[];
  unlockedLevels: string[];
  unlockedTricks: string[];
  cityCredits: Record<string, number>;
  collectibles: string[];
}

// ─── CHALLENGE ────────────────────────────────────────────────────────────────

export interface Challenge {
  id: string;
  description: string;
  type: 'score' | 'trick' | 'combo' | 'grind' | 'manual';
  target: string | number;
  reward: { cash: number; xp: number };
  completed: boolean;
}

// ─── RIVAL ────────────────────────────────────────────────────────────────────

export interface Rival {
  name: string;
  nickname: string;
  score: number;
  avatar: string;
  // Singular (cities.ts + current screens)
  taunt: string;
  defeatLine: string;
  lossLine: string;
  // Plural — optional, satisfies old levels.ts still in some repos
  taunts?: string[];
  defeats?: string[];
  lossLines?: string[];
}

// ─── COLLECTIBLE ─────────────────────────────────────────────────────────────

export interface Collectible {
  id: string;
  name: string;
  emoji: string;
  description: string;
  unlockCondition: string;
}

// ─── LEVEL ────────────────────────────────────────────────────────────────────

export interface ObstacleConfig {
  type: 'ledge' | 'rail' | 'gap' | 'block' | 'stairs' | 'bank';
  x: number;
  label: string;
}

export interface Level {
  id: string;
  city: string;
  spotName: string;
  state: string;
  description: string;
  theme: string;
  unlockRequirement: string | null;
  challenges: Challenge[];
  multiplier: number;
  palette: {
    sky: string[];
    ground: string;
    accent: string;
  };
  obstacles: ObstacleConfig[];
  rival: Rival;
  collectible: Collectible;
}

// ─── CITY (new runner model) ──────────────────────────────────────────────────

export interface City {
  id: string;
  name: string;
  state: string;
  tagline: string;
  unlockAfter: string | null;
  rival: Rival;
  palette: {
    sky: [string, string, string];
    ground: string;
    stripe: string;
  };
  landmark: 'space-needle' | 'golden-gate' | 'st-johns-bridge';
}

// ─── SAVE ─────────────────────────────────────────────────────────────────────

export interface SaveData {
  player: Player;
  version: string;
}
