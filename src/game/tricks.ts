import type { Trick } from './types';

export const ALL_TRICKS: Trick[] = [
  // ── BEGINNER ──────────────────────────────────────────────
  { id: 'ollie',       name: 'Ollie',       points: 100, category: 'ollie',  difficulty: 1, gesture: 'swipe-up',    unlockLevel: 0 },
  { id: 'manual',      name: 'Manual',      points: 150, category: 'manual', difficulty: 1, gesture: 'swipe-down',  unlockLevel: 0 },
  { id: 'kickflip',    name: 'Kickflip',    points: 250, category: 'flip',   difficulty: 2, gesture: 'swipe-left',  unlockLevel: 0 },
  { id: 'heelflip',    name: 'Heelflip',    points: 250, category: 'flip',   difficulty: 2, gesture: 'swipe-right', unlockLevel: 0 },
  { id: 'pop-shove-it',name: 'Pop Shove-It',points: 150, category: 'ollie',  difficulty: 1, gesture: 'hold-left',   unlockLevel: 0 },

  // ── INTERMEDIATE ──────────────────────────────────────────
  { id: 'varial-flip', name: 'Varial Flip',    points: 350, category: 'flip',  difficulty: 3, gesture: 'swipe-left',  unlockLevel: 1 },
  { id: 'tre-flip',    name: '360 Flip',        points: 400, category: 'flip',  difficulty: 3, gesture: 'swipe-right', unlockLevel: 1 },
  { id: 'hardflip',    name: 'Hardflip',        points: 350, category: 'flip',  difficulty: 3, gesture: 'hold-left',   unlockLevel: 1 },
  { id: 'fs-flip',     name: 'Frontside Flip',  points: 350, category: 'flip',  difficulty: 3, gesture: 'hold-right',  unlockLevel: 1 },
  { id: 'nosegrind',   name: 'Nosegrind',        points: 300, category: 'grind', difficulty: 2, gesture: 'hold-up',     unlockLevel: 1 },

  // ── ADVANCED ──────────────────────────────────────────────
  { id: 'laser-flip',    name: 'Laser Flip',    points: 500, category: 'flip',  difficulty: 4, gesture: 'swipe-left',  unlockLevel: 2 },
  { id: 'inward-heel',   name: 'Inward Heel',   points: 450, category: 'flip',  difficulty: 4, gesture: 'swipe-right', unlockLevel: 2 },
  { id: 'bigspin',       name: 'Bigspin Flip',  points: 400, category: 'flip',  difficulty: 4, gesture: 'hold-left',   unlockLevel: 2 },
  { id: 'crooked-grind', name: 'Crooked Grind', points: 400, category: 'grind', difficulty: 3, gesture: 'hold-up',     unlockLevel: 2 },
  { id: 'nollie-flip',   name: 'Nollie Flip',   points: 400, category: 'flip',  difficulty: 4, gesture: 'hold-right',  unlockLevel: 2 },
];

export const getTrickById = (id: string): Trick | undefined =>
  ALL_TRICKS.find(t => t.id === id);

export const getTricksForLevel = (unlockLevel: number): Trick[] =>
  ALL_TRICKS.filter(t => t.unlockLevel <= unlockLevel);
