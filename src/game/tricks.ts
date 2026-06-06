import type { Trick } from './types';

export const ALL_TRICKS: Trick[] = [
  // ── BEGINNER (unlockLevel 0) ──────────────────────────────
  {
    id: 'ollie',
    name: 'Ollie',
    points: 100,
    category: 'ollie',
    difficulty: 1,
    gesture: 'swipe-up',
    unlockLevel: 0,
  },
  {
    id: 'manual',
    name: 'Manual',
    points: 80,
    category: 'manual',
    difficulty: 1,
    gesture: 'swipe-down',
    unlockLevel: 0,
  },
  {
    id: 'kickflip',
    name: 'Kickflip',
    points: 300,
    category: 'flip',
    difficulty: 2,
    gesture: 'swipe-left',
    unlockLevel: 0,
  },
  {
    id: 'heelflip',
    name: 'Heelflip',
    points: 300,
    category: 'flip',
    difficulty: 2,
    gesture: 'swipe-right',
    unlockLevel: 0,
  },
  {
    id: 'pop-shove-it',
    name: 'Pop Shove-It',
    points: 200,
    category: 'ollie',
    difficulty: 1,
    gesture: 'hold-left',
    unlockLevel: 0,
  },

  // ── INTERMEDIATE (unlockLevel 1) ─────────────────────────
  {
    id: 'varial-flip',
    name: 'Varial Flip',
    points: 500,
    category: 'flip',
    difficulty: 3,
    gesture: 'swipe-left',
    unlockLevel: 1,
  },
  {
    id: 'tre-flip',
    name: '360 Flip',
    points: 700,
    category: 'flip',
    difficulty: 3,
    gesture: 'swipe-right',
    unlockLevel: 1,
  },
  {
    id: 'hardflip',
    name: 'Hardflip',
    points: 600,
    category: 'flip',
    difficulty: 3,
    gesture: 'hold-left',
    unlockLevel: 1,
  },
  {
    id: 'fs-flip',
    name: 'Frontside Flip',
    points: 600,
    category: 'flip',
    difficulty: 3,
    gesture: 'hold-right',
    unlockLevel: 1,
  },
  {
    id: 'nosegrind',
    name: 'Nosegrind',
    points: 400,
    category: 'grind',
    difficulty: 2,
    gesture: 'hold-up',
    unlockLevel: 1,
  },

  // ── ADVANCED (unlockLevel 2) ──────────────────────────────
  {
    id: 'laser-flip',
    name: 'Laser Flip',
    points: 1000,
    category: 'flip',
    difficulty: 4,
    gesture: 'swipe-left',
    unlockLevel: 2,
  },
  {
    id: 'inward-heel',
    name: 'Inward Heel',
    points: 900,
    category: 'flip',
    difficulty: 4,
    gesture: 'swipe-right',
    unlockLevel: 2,
  },
  {
    id: 'bigspin',
    name: 'Bigspin Flip',
    points: 800,
    category: 'flip',
    difficulty: 4,
    gesture: 'hold-left',
    unlockLevel: 2,
  },
  {
    id: 'crooked-grind',
    name: 'Crooked Grind',
    points: 600,
    category: 'grind',
    difficulty: 3,
    gesture: 'hold-up',
    unlockLevel: 2,
  },
  {
    id: 'nollie-flip',
    name: 'Nollie Flip',
    points: 750,
    category: 'flip',
    difficulty: 4,
    gesture: 'hold-right',
    unlockLevel: 2,
  },
];

export const getTrickById = (id: string): Trick | undefined =>
  ALL_TRICKS.find(t => t.id === id);

export const getTricksForLevel = (unlockLevel: number): Trick[] =>
  ALL_TRICKS.filter(t => t.unlockLevel <= unlockLevel);
