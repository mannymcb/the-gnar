import type { ShopItem } from './types';

export const SHOP_ITEMS: ShopItem[] = [
  // ── DECKS ─────────────────────────────────────────────────────────────────
  {
    id: 'deck-2',
    name: 'Street Pro 8.0"',
    category: 'deck',
    level: 2,
    price: 60,
    description: 'Stiffer construction, better pop response.',
    statBonus: { pop: 1 },
  },
  {
    id: 'deck-3',
    name: 'Concave King 8.25"',
    category: 'deck',
    level: 3,
    price: 120,
    description: 'Deep concave for technical tricks.',
    statBonus: { pop: 1, style: 1 },
  },
  {
    id: 'deck-4',
    name: 'Carbon Lite 8.0"',
    category: 'deck',
    level: 4,
    price: 220,
    description: 'Featherlight carbon blend. Unreal pop.',
    statBonus: { pop: 2, nerve: 1 },
  },

  // ── TRUCKS ────────────────────────────────────────────────────────────────
  {
    id: 'trucks-2',
    name: 'Hollow Hi 149',
    category: 'trucks',
    level: 2,
    price: 80,
    description: 'Lighter trucks, crisper turns.',
    statBonus: { balance: 1 },
  },
  {
    id: 'trucks-3',
    name: 'Tight Grind 149',
    category: 'trucks',
    level: 3,
    price: 150,
    description: 'Optimized geometry for long grinds.',
    statBonus: { balance: 1, style: 1 },
  },
  {
    id: 'trucks-4',
    name: 'Forged Titanium 149',
    category: 'trucks',
    level: 4,
    price: 280,
    description: 'Titanium axles. Lock-in grinds like rails were made for you.',
    statBonus: { balance: 2, nerve: 1 },
  },

  // ── WHEELS ────────────────────────────────────────────────────────────────
  {
    id: 'wheels-2',
    name: 'Street Slicks 52mm',
    category: 'wheels',
    level: 2,
    price: 45,
    description: 'Faster roll, tighter slides.',
    statBonus: { speed: 1 },
  },
  {
    id: 'wheels-3',
    name: 'Smooth 54mm',
    category: 'wheels',
    level: 3,
    price: 90,
    description: 'Eat cracks for breakfast.',
    statBonus: { speed: 1, endurance: 1 },
  },
  {
    id: 'wheels-4',
    name: 'Formula X 52mm',
    category: 'wheels',
    level: 4,
    price: 175,
    description: 'Competition-grade urethane. Maximum speed.',
    statBonus: { speed: 2, nerve: 1 },
  },

  // ── BEARINGS ──────────────────────────────────────────────────────────────
  {
    id: 'bearings-2',
    name: 'ABEC-7 Ceramics',
    category: 'bearings',
    level: 2,
    price: 30,
    description: 'Smooth and consistent roll.',
    statBonus: { speed: 1 },
  },
  {
    id: 'bearings-3',
    name: 'Swiss Precision',
    category: 'bearings',
    level: 3,
    price: 65,
    description: 'Swiss-made. Buttery.',
    statBonus: { speed: 1, balance: 1 },
  },

  // ── SHOES ─────────────────────────────────────────────────────────────────
  {
    id: 'shoes-2',
    name: 'Vulc Low Pro',
    category: 'shoes',
    level: 2,
    price: 70,
    description: 'Board feel is everything.',
    statBonus: { balance: 1, style: 1 },
  },
  {
    id: 'shoes-3',
    name: 'Padded Cupsole',
    category: 'shoes',
    level: 3,
    price: 130,
    description: 'Impact protection for big gaps.',
    statBonus: { nerve: 1, endurance: 1 },
  },
  {
    id: 'shoes-4',
    name: 'Signature Pro Model',
    category: 'shoes',
    level: 4,
    price: 250,
    description: 'Worn by the legends. You earned it.',
    statBonus: { style: 2, nerve: 1, balance: 1 },
  },
];
