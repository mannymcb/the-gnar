import type { Level } from './types';

export const LEVELS: Level[] = [
  // ── LEVEL 1: SEATTLE ─────────────────────────────────────────────────────
  {
    id: 'seattle',
    city: 'Seattle',
    spotName: 'Westlake Plaza',
    state: 'WA',
    description: 'Wet pavement, parking blocks, small ledges. Where it all begins.',
    theme: 'Rainy Pacific Northwest. Mist in the air. The city hums.',
    unlockRequirement: null,
    multiplier: 1.0,
    palette: {
      sky: ['#2c3e50', '#3d5a80', '#4a7fb5'],
      ground: '#2a2a2a',
      accent: '#5bc0eb',
    },
    obstacles: [
      { type: 'block', x: 15, label: 'Parking Block' },
      { type: 'ledge', x: 35, label: 'Low Ledge' },
      { type: 'gap', x: 55, label: 'Sidewalk Gap' },
      { type: 'block', x: 75, label: 'Marble Block' },
      { type: 'ledge', x: 90, label: 'Long Ledge' },
    ],
    challenges: [
      {
        id: 'sea-1',
        description: 'Land your first Kickflip',
        type: 'trick',
        target: 'kickflip',
        reward: { cash: 50, xp: 100 },
        completed: false,
      },
      {
        id: 'sea-2',
        description: 'Get a x2 combo',
        type: 'combo',
        target: 2,
        reward: { cash: 75, xp: 150 },
        completed: false,
      },
      {
        id: 'sea-3',
        description: 'Score 2,000 points in one run',
        type: 'score',
        target: 2000,
        reward: { cash: 100, xp: 200 },
        completed: false,
      },
      {
        id: 'sea-4',
        description: 'Land 3 tricks without bailing',
        type: 'combo',
        target: 3,
        reward: { cash: 125, xp: 250 },
        completed: false,
      },
    ],
  },

  // ── LEVEL 2: PORTLAND ────────────────────────────────────────────────────
  {
    id: 'portland',
    city: 'Portland',
    spotName: 'Burnside DIY',
    state: 'OR',
    description: 'Raw DIY concrete under the bridge. Banks, curbs, no rules.',
    theme: 'Gritty underbelly of a bridge. Graffiti everywhere. Crew sessions.',
    unlockRequirement: 'seattle',
    multiplier: 1.3,
    palette: {
      sky: ['#1a1a2e', '#16213e', '#0f3460'],
      ground: '#3d3d3d',
      accent: '#e94560',
    },
    obstacles: [
      { type: 'bank', x: 10, label: 'Concrete Bank' },
      { type: 'ledge', x: 28, label: 'Crusty Ledge' },
      { type: 'rail', x: 48, label: 'DIY Rail' },
      { type: 'gap', x: 65, label: 'Bank Gap' },
      { type: 'ledge', x: 82, label: 'Waxed Curb' },
    ],
    challenges: [
      {
        id: 'pdx-1',
        description: 'Grind the DIY Rail',
        type: 'grind',
        target: 'nosegrind',
        reward: { cash: 100, xp: 200 },
        completed: false,
      },
      {
        id: 'pdx-2',
        description: 'Land a 360 Flip',
        type: 'trick',
        target: 'tre-flip',
        reward: { cash: 150, xp: 300 },
        completed: false,
      },
      {
        id: 'pdx-3',
        description: 'Build a x4 combo',
        type: 'combo',
        target: 4,
        reward: { cash: 175, xp: 350 },
        completed: false,
      },
      {
        id: 'pdx-4',
        description: 'Score 6,000 points in one run',
        type: 'score',
        target: 6000,
        reward: { cash: 200, xp: 400 },
        completed: false,
      },
    ],
  },

  // ── LEVEL 3: SAN FRANCISCO ───────────────────────────────────────────────
  {
    id: 'sf',
    city: 'San Francisco',
    spotName: 'The Embarcadero',
    state: 'CA',
    description: 'Buttery smooth marble. Iconic ledges. The cathedral of street skating.',
    theme: 'Golden hour at the waterfront. Bay breeze. History in every crack.',
    unlockRequirement: 'portland',
    multiplier: 1.7,
    palette: {
      sky: ['#f6d365', '#fda085', '#f093fb'],
      ground: '#c8b8a2',
      accent: '#f6d365',
    },
    obstacles: [
      { type: 'ledge', x: 12, label: 'Marble Ledge' },
      { type: 'gap', x: 30, label: 'EMB Gap' },
      { type: 'ledge', x: 48, label: 'Long Ledge' },
      { type: 'stairs', x: 65, label: '5-Stair Set' },
      { type: 'ledge', x: 82, label: 'Hubba Ledge' },
    ],
    challenges: [
      {
        id: 'sf-1',
        description: 'Land a Hardflip',
        type: 'trick',
        target: 'hardflip',
        reward: { cash: 200, xp: 400 },
        completed: false,
      },
      {
        id: 'sf-2',
        description: 'Manual across the plaza',
        type: 'manual',
        target: 3,
        reward: { cash: 225, xp: 450 },
        completed: false,
      },
      {
        id: 'sf-3',
        description: 'Build a x6 combo',
        type: 'combo',
        target: 6,
        reward: { cash: 300, xp: 600 },
        completed: false,
      },
      {
        id: 'sf-4',
        description: 'Score 15,000 points in one run',
        type: 'score',
        target: 15000,
        reward: { cash: 400, xp: 800 },
        completed: false,
      },
    ],
  },
];

export const getLevelById = (id: string): Level | undefined =>
  LEVELS.find(l => l.id === id);

export const getNextLevel = (currentId: string): Level | undefined => {
  const idx = LEVELS.findIndex(l => l.id === currentId);
  return LEVELS[idx + 1];
};
