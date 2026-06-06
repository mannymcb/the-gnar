// ─── TRICKS ────────────────────────────────────────────────────────────────

export type TrickCategory = 'flip' | 'grind' | 'manual' | 'ollie' | 'special';

export interface Trick {
  id: string;
  name: string;
  points: number;
  category: TrickCategory;
  difficulty: number; // 1-5
  gesture: 'swipe-up' | 'swipe-down' | 'swipe-left' | 'swipe-right' | 'hold-left' | 'hold-right' | 'hold-up';
  unlockLevel: number;
}

// ─── PLAYER ────────────────────────────────────────────────────────────────

export interface PlayerStats {
  pop: number;      // affects ollie height / trick amplitude
  speed: number;    // affects run speed / grind distance
  balance: number;  // affects manual duration / landing window
  style: number;    // affects style bonus multiplier
  nerve: number;    // affects gap bonus / risk multiplier
  endurance: number;// affects combo length
}

export interface Equipment {
  deck: number;     // upgrade level 1-5
  trucks: number;
  wheels: number;
  bearings: number;
  shoes: number;
}

export interface Player {
  name: string;
  stats: PlayerStats;
  equipment: Equipment;
  cash: number;
  totalScore: number;
  unlockedTricks: string[];
  unlockedLevels: string[];
  completedChallenges: string[];
  cityCredits: Record<string, number>;      // best score per city
  rivalsBeaten: string[];                   // level ids of beaten rivals
  collectibles: string[];                   // collectible ids owned
}

// ─── LEVELS ────────────────────────────────────────────────────────────────

export interface Challenge {
  id: string;
  description: string;
  type: 'score' | 'trick' | 'combo' | 'grind' | 'manual';
  target: string | number;
  reward: { cash: number; xp: number };
  completed: boolean;
}

export interface Rival {
  name: string;        // "The Rain King"
  nickname: string;    // how they're known on the streets
  score: number;       // score to beat
  avatar: string;      // emoji representing them
  taunts: string[];    // 1-2 lines before the run
  defeats: string[];   // 1-2 lines after you beat them
  lossLines: string[]; // 1-2 lines if you lose
}

export interface Collectible {
  id: string;
  name: string;        // "Westlake Parking Block Sticker"
  emoji: string;
  description: string; // short flavour text
  unlockCondition: string; // display string e.g. "Beat the local rival"
}

export interface Level {
  id: string;
  city: string;
  spotName: string;
  state: string;
  description: string;
  theme: string;
  unlockRequirement: string | null; // level id or null for start
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

export interface ObstacleConfig {
  type: 'ledge' | 'rail' | 'gap' | 'block' | 'stairs' | 'bank';
  x: number; // relative position 0-100%
  label: string;
}

// ─── GAME SESSION ──────────────────────────────────────────────────────────

export type SwipeDirection = 'up' | 'down' | 'left' | 'right';

export interface TrickResult {
  trick: Trick;
  points: number;
  multiplier: number;
  total: number;
  landingQuality: 'perfect' | 'clean' | 'sloppy' | 'bail';
  timestamp: number;
}

export interface SessionState {
  score: number;
  combo: number;
  multiplier: number;
  trickHistory: TrickResult[];
  isComboActive: boolean;
  runTimeLeft: number;  // seconds
  isRunning: boolean;
  bails: number;
  currentObstacleIndex: number;
  manualActive: boolean;
  grindActive: boolean;
  grindProgress: number; // 0-100
  playerX: number;       // 0-100 position along run
  phase: 'idle' | 'skating' | 'trick' | 'landed' | 'bail' | 'finished';
  lastTrickId: string | null;
  consecutiveSameTrick: number;
}

// ─── SHOP ──────────────────────────────────────────────────────────────────

export interface ShopItem {
  id: string;
  name: string;
  category: keyof Equipment;
  level: number;
  price: number;
  description: string;
  statBonus: Partial<PlayerStats>;
}

// ─── SAVE ──────────────────────────────────────────────────────────────────

export interface SaveData {
  player: Player;
  version: string;
  lastSaved: number;
}
