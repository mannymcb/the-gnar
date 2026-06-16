import type { City } from './types';

export const CITIES: City[] = [
  {
    id: 'seattle',
    name: 'Seattle',
    state: 'WA',
    tagline: 'Wet streets. Parking blocks. Where it begins.',
    unlockAfter: null,
    rival: {
      name: 'Drizzle Dan',
      nickname: 'The Rain King',
      score: 8000,
      avatar: '🌧️',
      taunt: "You skate in the rain, or you don't skate at all.",
      defeatLine: "Alright. You got me. Rain's on your side today.",
      lossLine: "Come back when you can handle wet concrete, rookie.",
    },
    palette: {
      sky: ['#1e2d3d', '#2d4a6b', '#3d6694'],
      ground: '#2a2a2a',
      stripe: '#4a7fb5',
    },
    landmark: 'space-needle',
  },
  {
    id: 'portland',
    name: 'Portland',
    state: 'OR',
    tagline: 'DIY concrete. No rules. Burnside never sleeps.',
    unlockAfter: 'seattle',
    rival: {
      name: 'Concrete Rosa',
      nickname: 'The Burnside Boss',
      score: 18000,
      avatar: '🌹',
      taunt: "We built these banks with our hands. You're a tourist.",
      defeatLine: "Okay. You skate like you built it. I respect that.",
      lossLine: "Burnside eats people like you.",
    },
    palette: {
      sky: ['#12121f', '#1a1a2e', '#0f2040'],
      ground: '#3a3535',
      stripe: '#e94560',
    },
    landmark: 'st-johns-bridge',
  },
  {
    id: 'sf',
    name: 'San Francisco',
    state: 'CA',
    tagline: 'Marble ledges. Bay breeze. Cathedral of street skating.',
    unlockAfter: 'portland',
    rival: {
      name: 'Bay Ray',
      nickname: 'The Marble Whisperer',
      score: 32000,
      avatar: '🌉',
      taunt: "This marble has seen legends. Are you one? Probably not.",
      defeatLine: "That run was actually legendary. Don't waste it.",
      lossLine: "The marble doesn't lie. It just didn't feel you today.",
    },
    palette: {
      sky: ['#e8875a', '#d4634a', '#b84030'],
      ground: '#c8b8a0',
      stripe: '#f6c87a',
    },
    landmark: 'golden-gate',
  },
];

export const getCityById = (id: string) => CITIES.find(c => c.id === id);
