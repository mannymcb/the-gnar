import React, { useEffect, useRef, useCallback, useState } from 'react';
import type { Player, Level, TrickResult } from '../game/types';
import { ALL_TRICKS, getTricksForLevel } from '../game/tricks';
import { calculateTrickScore, getNextMultiplier, formatScore, getLetterGrade, getGradeColor } from '../game/scoring';
import type { SwipeDirection } from '../game/types';

interface Props {
  level: Level;
  player: Player;
  levelIndex: number;
  onComplete: (score: number, trickHistory: TrickResult[]) => void;
  onBack: () => void;
}

// ─── GAME CONSTANTS ──────────────────────────────────────────────────────────
const RUN_DURATION = 60;
const GROUND_Y_RATIO = 0.72;       // ground line as fraction of canvas height
const SKATER_X = 0.28;             // skater fixed at 28% from left
const SCROLL_SPEED = 2.8;          // px per frame base world scroll
const OBSTACLE_SPACING = 420;      // px between obstacles in world space
const GRAVITY = 0.55;
const JUMP_FORCE = -13;
const TRICK_ROTATION_SPEED = 18;   // deg per frame for flip tricks

// ─── TYPES ───────────────────────────────────────────────────────────────────
interface Particle {
  x: number; y: number; vx: number; vy: number;
  life: number; maxLife: number;
  color: string; size: number; type: 'spark' | 'dust' | 'star';
}

interface FloatText {
  x: number; y: number; vy: number;
  text: string; color: string; size: number;
  life: number; maxLife: number; alpha: number;
}

interface ObstacleWorld {
  type: 'ledge' | 'rail' | 'gap' | 'block' | 'stairs' | 'bank';
  worldX: number;   // position in scrolling world
  width: number;
  height: number;
  label: string;
  color: string;
  topColor: string;
  passed: boolean;
  grindable: boolean;
}

interface GameState {
  // timing
  running: boolean;
  timeLeft: number;
  phase: 'idle' | 'running' | 'finished';
  // world
  worldOffset: number;
  // skater physics
  skaterY: number;      // offset from ground (positive = up)
  skaterVY: number;
  onGround: boolean;
  // trick state
  trickPhase: 'none' | 'airborne' | 'grind' | 'manual' | 'bail';
  currentTrickId: string | null;
  boardRotation: number;   // degrees
  bodyRotation: number;
  airTime: number;
  // grind
  grindObstacleIdx: number;
  grindProgress: number;   // 0..1
  // landing
  awaitingTap: boolean;
  tapWindowStart: number;
  tapWindowDuration: number;
  tapProgress: number;     // 0..1
  // scoring
  score: number;
  combo: number;
  multiplier: number;
  lastTrickId: string | null;
  consecutiveSame: number;
  trickHistory: TrickResult[];
  bails: number;
  // animation
  walkFrame: number;
  frameCount: number;
  // feedback
  shakeX: number; shakeY: number; shakeFrames: number;
  manualBalance: number;   // -1..1 wobble
  manualFrames: number;
  grindSparkTimer: number;
}

// ─── OBSTACLE FACTORY ────────────────────────────────────────────────────────
function makeObstacles(level: Level): ObstacleWorld[] {
  const configs = level.obstacles;
  return configs.map((cfg, i) => {
    const base: Partial<ObstacleWorld> = {
      type: cfg.type, label: cfg.label, passed: false,
      worldX: 300 + i * OBSTACLE_SPACING,
    };
    switch (cfg.type) {
      case 'ledge':  return { ...base, width: 110, height: 18, color: '#8899aa', topColor: '#aabbcc', grindable: true } as ObstacleWorld;
      case 'rail':   return { ...base, width: 90,  height: 6,  color: '#aaaaaa', topColor: '#dddddd', grindable: true } as ObstacleWorld;
      case 'block':  return { ...base, width: 48,  height: 32, color: '#b0a090', topColor: '#ccbbaa', grindable: true } as ObstacleWorld;
      case 'gap':    return { ...base, width: 60,  height: 2,  color: 'transparent', topColor: 'transparent', grindable: false } as ObstacleWorld;
      case 'stairs': return { ...base, width: 80,  height: 40, color: '#888',    topColor: '#aaa', grindable: false } as ObstacleWorld;
      case 'bank':   return { ...base, width: 80,  height: 44, color: '#667',    topColor: '#889', grindable: false } as ObstacleWorld;
      default:       return { ...base, width: 80,  height: 20, color: '#888', topColor: '#aaa', grindable: false } as ObstacleWorld;
    }
  });
}

// ─── DRAW HELPERS ─────────────────────────────────────────────────────────────

function drawBackground(ctx: CanvasRenderingContext2D, w: number, h: number, level: Level, worldOffset: number) {
  const [sky1, sky2, sky3] = level.palette.sky;
  const grd = ctx.createLinearGradient(0, 0, 0, h);
  grd.addColorStop(0, sky1); grd.addColorStop(0.55, sky2); grd.addColorStop(1, sky3);
  ctx.fillStyle = grd; ctx.fillRect(0, 0, w, h);

  const groundY = h * GROUND_Y_RATIO;

  // ── city-specific backgrounds ─────────────────────────────────────────────
  if (level.id === 'seattle') {
    // Rain streaks
    ctx.save();
    ctx.strokeStyle = 'rgba(180,200,255,0.10)';
    ctx.lineWidth = 1;
    const rainOff = (worldOffset * 2.5) % 80;
    for (let i = 0; i < 40; i++) {
      const rx = ((i * 53 + rainOff) % w);
      ctx.beginPath(); ctx.moveTo(rx, 0); ctx.lineTo(rx - 8, h * 0.75); ctx.stroke();
    }
    ctx.restore();
  }

  // ── building silhouettes (parallax at 0.25x) ──────────────────────────────
  const bldOff = (worldOffset * 0.25) % w;
  const bldHeights = [0.38, 0.28, 0.44, 0.32, 0.50, 0.36, 0.42, 0.30, 0.48, 0.34, 0.40, 0.26];
  const bldWidths  = [0.08, 0.06, 0.10, 0.07, 0.09, 0.065, 0.11, 0.075, 0.085, 0.07, 0.095, 0.06];

  for (let pass = 0; pass < 2; pass++) {
    const xOff = pass === 0 ? -bldOff : w - bldOff;
    let bx = xOff;
    for (let i = 0; i < bldHeights.length; i++) {
      const bw = bldWidths[i] * w;
      const bh = bldHeights[i] * groundY;
      const by = groundY - bh;

      // building body
      const alpha = level.id === 'sf' ? 0.55 : 0.45;
      ctx.fillStyle = `rgba(0,0,0,${alpha})`;
      ctx.fillRect(bx, by, bw - 2, bh);

      // windows
      if (level.id === 'sf') {
        ctx.fillStyle = 'rgba(255,220,120,0.35)';
      } else if (level.id === 'portland') {
        ctx.fillStyle = 'rgba(220,80,60,0.25)';
      } else {
        ctx.fillStyle = 'rgba(200,220,255,0.20)';
      }
      for (let wy = by + 8; wy < groundY - 10; wy += 14) {
        for (let wx2 = bx + 4; wx2 < bx + bw - 8; wx2 += 10) {
          if ((i + Math.floor(wy / 14)) % 3 !== 0)
            ctx.fillRect(wx2, wy, 5, 7);
        }
      }
      bx += bw;
    }
  }

  // level-specific mid-ground details
  if (level.id === 'portland') {
    // Bridge structure
    const bridgeY = groundY * 0.62;
    ctx.fillStyle = 'rgba(40,40,60,0.7)';
    ctx.fillRect(0, bridgeY, w, 8);
    // Bridge pillars
    for (let i = 0; i < 4; i++) {
      const px = (i / 3) * w;
      ctx.fillRect(px - 5, bridgeY, 10, groundY - bridgeY);
    }
  }

  if (level.id === 'sf') {
    // Bay shimmer far right
    const bayGrd = ctx.createLinearGradient(w * 0.6, 0, w, 0);
    bayGrd.addColorStop(0, 'transparent');
    bayGrd.addColorStop(1, 'rgba(100,180,255,0.12)');
    ctx.fillStyle = bayGrd;
    ctx.fillRect(0, groundY * 0.5, w, groundY * 0.5);
  }
}

function drawGround(ctx: CanvasRenderingContext2D, w: number, h: number, level: Level, worldOffset: number) {
  const groundY = h * GROUND_Y_RATIO;

  // ground fill
  ctx.fillStyle = level.palette.ground;
  ctx.fillRect(0, groundY, w, h - groundY);

  // ground top edge / shadow
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.fillRect(0, groundY, w, 3);

  // scrolling pavement lines
  if (level.id === 'seattle') {
    // wet reflections
    ctx.fillStyle = 'rgba(100,150,220,0.10)';
    const reflOff = worldOffset % 120;
    for (let i = 0; i < 12; i++) {
      ctx.fillRect((i * 120 - reflOff + w) % w, groundY + 5, 60, 8);
    }
  }

  // pavement joints
  ctx.strokeStyle = 'rgba(0,0,0,0.18)';
  ctx.lineWidth = 1.5;
  const jointSpacing = level.id === 'portland' ? 55 : 80;
  const jointOff = worldOffset % jointSpacing;
  for (let i = 0; i < Math.ceil(w / jointSpacing) + 1; i++) {
    const jx = i * jointSpacing - jointOff;
    ctx.beginPath(); ctx.moveTo(jx, groundY); ctx.lineTo(jx, h); ctx.stroke();
  }

  // Portland graffiti tags on ground level
  if (level.id === 'portland') {
    ctx.save();
    ctx.globalAlpha = 0.18;
    ctx.fillStyle = '#e94560';
    const tagOff = worldOffset * 0.6 % 300;
    ctx.font = 'bold 22px monospace';
    ctx.fillText('DIY', (200 - tagOff + w * 2) % w, groundY + 28);
    ctx.fillText('SKATE', (500 - tagOff + w * 2) % w, groundY + 30);
    ctx.restore();
  }
}

function drawObstacle(ctx: CanvasRenderingContext2D, obs: ObstacleWorld, screenX: number, groundY: number, _level: Level) {
  const bx = screenX;
  const by = groundY - obs.height;

  switch (obs.type) {
    case 'ledge': {
      // shadow
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.fillRect(bx + 4, groundY - obs.height + 4, obs.width, obs.height);
      // body
      ctx.fillStyle = obs.color;
      ctx.fillRect(bx, by, obs.width, obs.height);
      // top waxed surface
      ctx.fillStyle = obs.topColor;
      ctx.fillRect(bx, by, obs.width, 5);
      // highlight
      ctx.fillStyle = 'rgba(255,255,255,0.3)';
      ctx.fillRect(bx + 2, by + 1, obs.width - 4, 2);
      // front face darker
      ctx.fillStyle = 'rgba(0,0,0,0.2)';
      ctx.fillRect(bx, by + 5, 5, obs.height - 5);
      break;
    }
    case 'rail': {
      const railY = by;
      // posts
      ctx.fillStyle = '#666';
      ctx.fillRect(bx + 10, railY + 4, 4, groundY - railY - 4);
      ctx.fillRect(bx + obs.width - 14, railY + 4, 4, groundY - railY - 4);
      // rail bar
      const rGrd = ctx.createLinearGradient(0, railY, 0, railY + obs.height);
      rGrd.addColorStop(0, '#eee'); rGrd.addColorStop(0.4, '#bbb'); rGrd.addColorStop(1, '#888');
      ctx.fillStyle = rGrd;
      ctx.beginPath();
      ctx.roundRect(bx, railY, obs.width, obs.height, 3);
      ctx.fill();
      // shine
      ctx.fillStyle = 'rgba(255,255,255,0.6)';
      ctx.fillRect(bx + 4, railY + 1, obs.width - 8, 2);
      break;
    }
    case 'block': {
      ctx.fillStyle = 'rgba(0,0,0,0.2)';
      ctx.fillRect(bx + 4, by + 4, obs.width, obs.height);
      ctx.fillStyle = obs.color;
      ctx.fillRect(bx, by, obs.width, obs.height);
      ctx.fillStyle = obs.topColor;
      ctx.fillRect(bx, by, obs.width, 6);
      ctx.fillStyle = 'rgba(255,255,255,0.2)';
      ctx.fillRect(bx + 2, by + 1, obs.width - 4, 2);
      ctx.fillStyle = 'rgba(0,0,0,0.15)';
      ctx.fillRect(bx, by + 6, 5, obs.height - 6);
      break;
    }
    case 'gap': {
      // danger stripe marking
      ctx.fillStyle = 'rgba(255,107,53,0.5)';
      ctx.fillRect(bx, groundY - 2, obs.width, 3);
      ctx.setLineDash([6, 4]);
      ctx.strokeStyle = 'rgba(255,200,0,0.5)';
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(bx, groundY - 1); ctx.lineTo(bx + obs.width, groundY - 1); ctx.stroke();
      ctx.setLineDash([]);
      // drop shadow
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(bx + 2, groundY + 2, obs.width - 4, 20);
      break;
    }
    case 'stairs': {
      const steps = 5;
      const sw = obs.width / steps;
      const sh = obs.height / steps;
      for (let s = 0; s < steps; s++) {
        const sx = bx + s * sw;
        const sy = groundY - sh * (steps - s);
        ctx.fillStyle = s % 2 === 0 ? obs.color : obs.topColor;
        ctx.fillRect(sx, sy, sw, sh * (steps - s));
        ctx.fillStyle = 'rgba(255,255,255,0.15)';
        ctx.fillRect(sx, sy, sw, 2);
      }
      break;
    }
    case 'bank': {
      ctx.fillStyle = obs.color;
      ctx.beginPath();
      ctx.moveTo(bx, groundY);
      ctx.lineTo(bx + obs.width, groundY - obs.height);
      ctx.lineTo(bx + obs.width, groundY);
      ctx.closePath();
      ctx.fill();
      // surface highlight
      ctx.strokeStyle = obs.topColor;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(bx, groundY);
      ctx.lineTo(bx + obs.width, groundY - obs.height);
      ctx.stroke();
      break;
    }
  }

  // obstacle label
  ctx.save();
  ctx.globalAlpha = 0.55;
  ctx.fillStyle = '#fff';
  ctx.font = '8px monospace';
  ctx.textAlign = 'center';
  ctx.fillText(obs.label.toUpperCase(), bx + obs.width / 2, by - 5);
  ctx.restore();
}

// ─── DRAW SKATER ──────────────────────────────────────────────────────────────
function drawSkater(
  ctx: CanvasRenderingContext2D,
  sx: number, sy: number,   // screen center-bottom of skater
  gs: GameState,
  _level: Level,
) {
  ctx.save();
  ctx.translate(sx, sy);

  const phase = gs.trickPhase;
  const boardRot = gs.boardRotation;
  const bodyRot  = gs.bodyRotation;
  const walk = gs.walkFrame;
  const isBail = phase === 'bail';
  const isGrind = phase === 'grind';
  const isManual = phase === 'manual';
  const isAir = phase === 'airborne';

  // ── BOARD ─────────────────────────────────────────────────────────────────
  ctx.save();
  if (isAir || isGrind) {
    ctx.rotate((boardRot * Math.PI) / 180);
  } else if (isManual) {
    // nose manual: tilt board
    ctx.rotate(0.22);
  } else if (isBail) {
    ctx.rotate((boardRot * Math.PI) / 180);
    ctx.translate(20, 10);
  }

  // deck
  const deckW = 36, deckH = 7;
  const deckGrd = ctx.createLinearGradient(0, -deckH / 2, 0, deckH / 2);
  deckGrd.addColorStop(0, '#d44'); deckGrd.addColorStop(0.5, '#c33'); deckGrd.addColorStop(1, '#922');
  ctx.fillStyle = deckGrd;
  ctx.beginPath();
  ctx.roundRect(-deckW / 2, -deckH / 2, deckW, deckH, 3);
  ctx.fill();
  // grip tape
  ctx.fillStyle = 'rgba(0,0,0,0.4)';
  ctx.fillRect(-deckW / 2 + 2, -deckH / 2 + 1, deckW - 4, 2);
  // deck graphic stripe
  ctx.fillStyle = 'rgba(255,255,255,0.15)';
  ctx.fillRect(-8, -deckH / 2 + 3, 16, 2);
  // trucks
  ctx.fillStyle = '#aaa';
  ctx.fillRect(-deckW / 2 + 3, deckH / 2 - 2, 10, 4);
  ctx.fillRect(deckW / 2 - 13, deckH / 2 - 2, 10, 4);
  // wheels
  ctx.fillStyle = '#ddd';
  const wheelR = 4;
  [[-deckW / 2 + 5, deckH / 2 + 2], [deckW / 2 - 5, deckH / 2 + 2],
   [-deckW / 2 + 5, -deckH / 2 - 2], [deckW / 2 - 5, -deckH / 2 - 2]].forEach(([wx, wy]) => {
    ctx.beginPath(); ctx.arc(wx, wy, wheelR, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#999'; ctx.beginPath(); ctx.arc(wx, wy, wheelR * 0.45, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ddd';
  });

  ctx.restore();

  // ── BODY ──────────────────────────────────────────────────────────────────
  if (!isBail) {
    ctx.save();
    if (isAir) ctx.rotate((bodyRot * Math.PI) / 180);
    const legSwing = isAir ? 0 : Math.sin(walk * 0.18) * 4;
    const bodyBob  = isAir ? -Math.abs(gs.skaterY) * 0.15 : Math.abs(Math.sin(walk * 0.18)) * 1.5;

    // board-foot leg (back)
    ctx.strokeStyle = '#445'; ctx.lineWidth = 5; ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-4, -deckH / 2 - 2);
    ctx.lineTo(-6 + legSwing, -deckH / 2 - 16);
    ctx.lineTo(-9 + legSwing * 0.5, -deckH / 2 - 8);
    ctx.stroke();
    // shoe back
    ctx.fillStyle = '#222';
    ctx.beginPath(); ctx.ellipse(-9 + legSwing * 0.5, -deckH / 2 - 6, 6, 3, 0, 0, Math.PI * 2); ctx.fill();

    // front leg
    ctx.strokeStyle = '#556';
    ctx.beginPath();
    ctx.moveTo(6, -deckH / 2 - 2);
    ctx.lineTo(8 - legSwing, -deckH / 2 - 18);
    ctx.lineTo(11 - legSwing * 0.5, -deckH / 2 - 8);
    ctx.stroke();
    // shoe front
    ctx.fillStyle = '#334';
    ctx.beginPath(); ctx.ellipse(11 - legSwing * 0.5, -deckH / 2 - 6, 6, 3, 0, 0, Math.PI * 2); ctx.fill();

    const torsoTop = -deckH / 2 - 32 - bodyBob;

    // torso
    ctx.fillStyle = '#5577aa';
    ctx.beginPath();
    ctx.roundRect(-7, torsoTop + 10, 14, 14, 3);
    ctx.fill();
    // logo on shirt
    ctx.fillStyle = 'rgba(255,255,255,0.2)';
    ctx.fillRect(-3, torsoTop + 13, 6, 4);

    // arms
    ctx.strokeStyle = '#5577aa'; ctx.lineWidth = 4;
    const armSwing = isGrind ? 15 : (isManual ? -10 : Math.sin(walk * 0.18) * 6);
    // back arm
    ctx.strokeStyle = '#4466aa';
    ctx.beginPath();
    ctx.moveTo(-6, torsoTop + 14);
    ctx.lineTo(-14, torsoTop + 22 + armSwing);
    ctx.stroke();
    // front arm
    ctx.strokeStyle = '#6688bb';
    ctx.beginPath();
    ctx.moveTo(6, torsoTop + 14);
    ctx.lineTo(13, torsoTop + 20 - armSwing);
    ctx.stroke();

    // head
    ctx.fillStyle = '#ffcc99';
    ctx.beginPath(); ctx.arc(1, torsoTop + 5, 9, 0, Math.PI * 2); ctx.fill();
    // helmet / hat
    ctx.fillStyle = '#cc2222';
    ctx.beginPath(); ctx.ellipse(1, torsoTop + 2, 9, 6, 0, Math.PI, 0); ctx.fill();
    // sunglasses
    ctx.fillStyle = '#111';
    ctx.fillRect(-6, torsoTop + 5, 5, 3);
    ctx.fillRect(1, torsoTop + 5, 5, 3);
    ctx.strokeStyle = '#333'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(-1, torsoTop + 6); ctx.lineTo(1, torsoTop + 6); ctx.stroke();

    ctx.restore();
  } else {
    // BAIL — ragdoll
    ctx.save();
    ctx.rotate((boardRot * Math.PI) / 180 * 0.4);
    ctx.fillStyle = '#ffcc99';
    ctx.beginPath(); ctx.arc(16, -20, 8, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#5577aa'; ctx.lineWidth = 5; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(8, -16); ctx.lineTo(-4, -8); ctx.lineTo(-12, -4); ctx.stroke();
    ctx.strokeStyle = '#445';
    ctx.beginPath(); ctx.moveTo(-4, -8); ctx.lineTo(-6, 4); ctx.lineTo(4, 12); ctx.stroke();
    ctx.restore();
  }

  ctx.restore();
}

// ─── DRAW GRIND SPARKS ────────────────────────────────────────────────────────
function spawnGrindSparks(gs: GameState, sx: number, sy: number): Particle[] {
  if (!gs.grindSparkTimer) return [];
  return Array.from({ length: 3 }, () => ({
    x: sx + (Math.random() - 0.5) * 16,
    y: sy - 4,
    vx: (Math.random() - 0.5) * 5,
    vy: -1 - Math.random() * 3,
    life: 20, maxLife: 20,
    color: Math.random() > 0.5 ? '#FFD700' : '#ff6b35',
    size: 2 + Math.random() * 2,
    type: 'spark' as const,
  }));
}

// ─── DRAW PARTICLES ───────────────────────────────────────────────────────────
function drawParticles(ctx: CanvasRenderingContext2D, particles: Particle[]) {
  for (const p of particles) {
    const alpha = p.life / p.maxLife;
    ctx.save();
    ctx.globalAlpha = alpha;
    if (p.type === 'spark') {
      ctx.fillStyle = p.color;
      ctx.shadowColor = p.color;
      ctx.shadowBlur = 6;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * alpha, 0, Math.PI * 2);
      ctx.fill();
    } else if (p.type === 'star') {
      ctx.fillStyle = p.color;
      ctx.font = `${p.size}px sans-serif`;
      ctx.fillText('★', p.x, p.y);
    } else {
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * alpha, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
}

// ─── HUD helpers ─────────────────────────────────────────────────────────────
function drawHUD(
  ctx: CanvasRenderingContext2D, w: number, h: number,
  gs: GameState, _level: Level,
  floatTexts: FloatText[], landingProgress: number, awaitingTap: boolean,
) {
  // Score top-right
  ctx.save();
  ctx.font = 'bold 28px "Bebas Neue", Impact, sans-serif';
  ctx.fillStyle = '#ffffff';
  ctx.shadowColor = 'rgba(0,0,0,0.8)';
  ctx.shadowBlur = 8;
  ctx.textAlign = 'right';
  ctx.fillText(formatScore(gs.score), w - 16, 44);
  ctx.shadowBlur = 0;

  // Timer top-right under score
  const tColor = gs.timeLeft <= 10 ? '#ff4444' : 'rgba(255,255,255,0.7)';
  ctx.font = `bold 14px monospace`;
  ctx.fillStyle = tColor;
  ctx.fillText(`${gs.timeLeft}s`, w - 16, 62);

  // Multiplier top-center
  if (gs.multiplier > 1.05) {
    ctx.textAlign = 'center';
    ctx.font = `bold ${gs.multiplier > 3 ? 24 : 18}px "Bebas Neue", Impact, sans-serif`;
    ctx.fillStyle = '#FFD700';
    ctx.shadowColor = 'rgba(255,200,0,0.6)';
    ctx.shadowBlur = 12;
    ctx.fillText(`x${gs.multiplier.toFixed(1)}`, w / 2, 50);
    ctx.shadowBlur = 0;
  }

  // Combo chain dots bottom-left
  if (gs.combo > 0) {
    ctx.textAlign = 'left';
    ctx.font = '10px monospace';
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.fillText(`COMBO`, 16, h - 80);
    const dotSize = 8, dotGap = 11;
    for (let i = 0; i < Math.min(gs.combo, 12); i++) {
      ctx.fillStyle = i < 4 ? '#ff6b35' : i < 8 ? '#FFD700' : '#00ff88';
      ctx.beginPath();
      ctx.arc(16 + i * dotGap + dotSize / 2, h - 66, dotSize / 2, 0, Math.PI * 2);
      ctx.fill();
    }
    if (gs.combo > 12) {
      ctx.fillStyle = '#fff';
      ctx.font = '9px monospace';
      ctx.fillText(`+${gs.combo - 12}`, 16 + 12 * dotGap + 6, h - 62);
    }
  }

  // Manual balance meter
  if (gs.trickPhase === 'manual') {
    const mw = 100, mh = 8;
    const mx = w / 2 - mw / 2, my = h - 55;
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.beginPath(); ctx.roundRect(mx, my, mw, mh, 4); ctx.fill();
    // balance fill
    const bal = (gs.manualBalance + 1) / 2; // 0..1
    ctx.fillStyle = Math.abs(gs.manualBalance) > 0.6 ? '#ff4444' : '#00ff88';
    ctx.fillRect(mx + 2, my + 2, (mw - 4) * bal, mh - 4);
    // center line
    ctx.fillStyle = '#fff';
    ctx.fillRect(mx + mw / 2 - 1, my, 2, mh);
    ctx.textAlign = 'center';
    ctx.font = '9px monospace';
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.fillText('MANUAL', w / 2, my - 4);
  }

  // Landing tap meter
  if (awaitingTap) {
    const tw = 130, th = 10;
    const tx = w / 2 - tw / 2, ty = h * GROUND_Y_RATIO - 60;
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.beginPath(); ctx.roundRect(tx - 2, ty - 2, tw + 4, th + 4, 5); ctx.fill();
    // track
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    ctx.beginPath(); ctx.roundRect(tx, ty, tw, th, 4); ctx.fill();
    // fill — green early, gold mid, red late
    const prog = landingProgress;
    ctx.fillStyle = prog < 0.35 ? '#00ff88' : prog < 0.65 ? '#FFD700' : '#ff4444';
    ctx.beginPath(); ctx.roundRect(tx, ty, tw * prog, th, 4); ctx.fill();
    // pulse label
    ctx.textAlign = 'center';
    ctx.font = 'bold 10px monospace';
    ctx.fillStyle = '#fff';
    ctx.shadowBlur = 6; ctx.shadowColor = '#fff';
    ctx.fillText('TAP TO LAND', w / 2, ty - 6);
    ctx.shadowBlur = 0;
  }

  // Float texts
  for (const ft of floatTexts) {
    ctx.save();
    ctx.globalAlpha = ft.alpha;
    ctx.textAlign = 'center';
    ctx.font = `bold ${ft.size}px "Bebas Neue", Impact, sans-serif`;
    ctx.fillStyle = ft.color;
    ctx.shadowColor = 'rgba(0,0,0,0.9)';
    ctx.shadowBlur = 8;
    ctx.fillText(ft.text, ft.x, ft.y);
    ctx.restore();
  }

  ctx.restore();
}

// ─── MAIN COMPONENT ───────────────────────────────────────────────────────────
export const SkateRun: React.FC<Props> = ({ level, player, levelIndex, onComplete, onBack }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gsRef = useRef<GameState>(makeInitialGS());
  const obstaclesRef = useRef<ObstacleWorld[]>(makeObstacles(level));
  const particlesRef = useRef<Particle[]>([]);
  const floatTextsRef = useRef<FloatText[]>([]);
  const rafRef = useRef<number>(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const touchRef = useRef<{ startX: number; startY: number; startTime: number; moved: boolean } | null>(null);
  const holdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [phase, setPhase] = useState<'idle' | 'running' | 'finished'>('idle');
  const finishedRef = useRef(false);

  function makeInitialGS(): GameState {
    return {
      running: false, timeLeft: RUN_DURATION, phase: 'idle',
      worldOffset: 0,
      skaterY: 0, skaterVY: 0, onGround: true,
      trickPhase: 'none', currentTrickId: null,
      boardRotation: 0, bodyRotation: 0, airTime: 0,
      grindObstacleIdx: -1, grindProgress: 0,
      awaitingTap: false, tapWindowStart: 0, tapWindowDuration: 800, tapProgress: 0,
      score: 0, combo: 0, multiplier: 1, lastTrickId: null, consecutiveSame: 0,
      trickHistory: [], bails: 0,
      walkFrame: 0, frameCount: 0,
      shakeX: 0, shakeY: 0, shakeFrames: 0,
      manualBalance: 0, manualFrames: 0,
      grindSparkTimer: 0,
    };
  }

  const availableTricks = getTricksForLevel(levelIndex).filter(t => player.unlockedTricks.includes(t.id));

  function getGestureToTrick(dir: SwipeDirection, isHold: boolean) {
    const gesture = isHold ? `hold-${dir}` as const : `swipe-${dir}` as const;
    const candidates = availableTricks.filter(t => t.gesture === gesture);
    if (!candidates.length) return null;
    return candidates.reduce((best, t) => t.unlockLevel > best.unlockLevel ? t : best, candidates[0]);
  }

  // ── EMIT helpers ───────────────────────────────────────────────────────────
  function spawnLandingParticles(cx: number, cy: number, quality: string, count: number) {
    const color = quality === 'perfect' ? '#FFD700' : quality === 'bail' ? '#ff4444' : '#ff6b35';
    const newP: Particle[] = Array.from({ length: count }, () => ({
      x: cx + (Math.random() - 0.5) * 20,
      y: cy,
      vx: (Math.random() - 0.5) * 7,
      vy: -2 - Math.random() * 5,
      life: 30 + Math.random() * 20, maxLife: 50,
      color, size: 3 + Math.random() * 3,
      type: (quality === 'perfect' ? 'star' : 'dust') as Particle['type'],
    }));
    particlesRef.current.push(...newP);
  }

  function spawnFloatText(x: number, y: number, text: string, color: string, size: number) {
    floatTextsRef.current.push({ x, y, vy: -1.2, text, color, size, life: 60, maxLife: 60, alpha: 1 });
  }

  // ── SCORING ────────────────────────────────────────────────────────────────
  function landTrick(trickId: string, accuracy: number, w: number, h: number) {
    const gs = gsRef.current;
    const trick = ALL_TRICKS.find(t => t.id === trickId);
    if (!trick) return;

    const quality: TrickResult['landingQuality'] =
      accuracy >= 0.85 ? 'perfect' : accuracy >= 0.55 ? 'clean' : accuracy >= 0.25 ? 'sloppy' : 'bail';

    const cx = w * SKATER_X;
    const cy = h * GROUND_Y_RATIO - gs.skaterY;

    if (quality === 'bail') {
      gs.trickPhase = 'bail';
      gs.boardRotation = 90 + Math.random() * 180;
      gs.bails++;
      gs.multiplier = 1; gs.combo = 0;
      gs.awaitingTap = false;
      spawnLandingParticles(cx, cy, 'bail', 8);
      spawnFloatText(cx, cy - 50, 'BAIL!', '#ff4444', 26);
      setTimeout(() => {
        gsRef.current.trickPhase = 'none';
        gsRef.current.boardRotation = 0;
        gsRef.current.bodyRotation = 0;
      }, 500);
      return;
    }

    const result = calculateTrickScore(trick, quality, {
      ...gs, isComboActive: gs.combo > 0,
      trickHistory: gs.trickHistory, bails: gs.bails, runTimeLeft: gs.timeLeft,
      isRunning: gs.running, currentObstacleIndex: gs.grindObstacleIdx,
      manualActive: gs.trickPhase === 'manual', grindActive: gs.trickPhase === 'grind',
      grindProgress: gs.grindProgress, playerX: gs.worldOffset, phase: 'skating',
      lastTrickId: gs.lastTrickId, consecutiveSameTrick: gs.consecutiveSame,
    }, player, level.multiplier);

    const newMult = getNextMultiplier(gs.multiplier, quality, player);

    gs.score += result.total;
    gs.combo = quality === 'sloppy' ? Math.max(0, gs.combo - 1) : gs.combo + 1;
    gs.multiplier = newMult;
    gs.consecutiveSame = gs.lastTrickId === trick.id ? gs.consecutiveSame + 1 : 0;
    gs.lastTrickId = trick.id;
    gs.trickHistory.push(result);
    gs.trickPhase = 'none';
    gs.awaitingTap = false;
    gs.boardRotation = 0; gs.bodyRotation = 0;

    spawnLandingParticles(cx, cy, quality, quality === 'perfect' ? 20 : 10);

    const qualLabel = quality === 'perfect' ? 'PERFECT!' : quality === 'clean' ? 'CLEAN' : 'SLOPPY';
    const qualColor = quality === 'perfect' ? '#FFD700' : quality === 'clean' ? '#00ff88' : '#aaa';
    if (quality === 'perfect') gs.shakeFrames = 8;

    spawnFloatText(cx, cy - 60, trick.name, '#fff', 22);
    spawnFloatText(cx, cy - 82, qualLabel, qualColor, 14);
    spawnFloatText(cx, cy - 100, `+${formatScore(result.total)}`, '#ff6b35', 16);
  }

  // ── GESTURE HANDLER ────────────────────────────────────────────────────────
  const handleGesture = useCallback((dir: SwipeDirection, isHold: boolean) => {
    const gs = gsRef.current;
    if (!gs.running || gs.phase !== 'running') return;
    if (gs.awaitingTap) return;

    const trick = getGestureToTrick(dir, isHold);
    if (!trick) return;

    if (dir === 'up' || (!isHold && (dir === 'left' || dir === 'right'))) {
      // Air trick
      if (!gs.onGround && gs.trickPhase !== 'none') return;
      gs.skaterVY = JUMP_FORCE - (player.stats.pop * 0.3);
      gs.onGround = false;
      gs.trickPhase = 'airborne';
      gs.currentTrickId = trick.id;
      gs.boardRotation = 0;
      gs.airTime = 0;

      const dur = 600 + trick.difficulty * 80;
      gs.tapWindowStart = Date.now();
      gs.tapWindowDuration = dur;
      gs.awaitingTap = true;
      gs.tapProgress = 0;

    } else if (dir === 'down' && !isHold) {
      // Manual
      if (!gs.onGround) return;
      gs.trickPhase = 'manual';
      gs.currentTrickId = trick.id;
      gs.manualBalance = 0;
      gs.manualFrames = 0;
      gs.awaitingTap = false;

      const canvas = canvasRef.current;
      const w = canvas?.width ?? 375, h = canvas?.height ?? 812;
      const cx = w * SKATER_X, cy = h * GROUND_Y_RATIO;
      spawnFloatText(cx, cy - 50, 'MANUAL', '#fff', 20);

      // Auto end manual after duration
      setTimeout(() => {
        if (gsRef.current.trickPhase === 'manual') {
          const bal = Math.abs(gsRef.current.manualBalance);
          const acc = bal < 0.4 ? 0.9 : bal < 0.7 ? 0.6 : 0.2;
          const canvas2 = canvasRef.current;
          landTrick(trick.id, acc, canvas2?.width ?? 375, canvas2?.height ?? 812);
        }
      }, 1200 + player.stats.balance * 200);

    } else if (isHold) {
      // Grind — find nearest upcoming obstacle
      const obs = obstaclesRef.current;
      const canvas = canvasRef.current;
      const w = canvas?.width ?? 375;
      const skaterScreenX = w * SKATER_X;
      const nearIdx = obs.findIndex(o => {
        const screenX = o.worldX - gs.worldOffset;
        return !o.passed && o.grindable && screenX > skaterScreenX - 30 && screenX < skaterScreenX + 80;
      });
      if (nearIdx < 0) return;
      const target = obs[nearIdx];
      gs.trickPhase = 'grind';
      gs.currentTrickId = trick.id;
      gs.grindObstacleIdx = nearIdx;
      gs.grindProgress = 0;
      gs.skaterY = target.height + 2;
      gs.skaterVY = 0;
      gs.onGround = false;
      gs.awaitingTap = false;
      gs.grindSparkTimer = 1;

      const canvas2 = canvasRef.current;
      const h = canvas2?.height ?? 812;
      const cx = w * SKATER_X, cy = h * GROUND_Y_RATIO - target.height;
      spawnFloatText(cx, cy - 30, trick.name, '#FFD700', 20);
    }
  }, [availableTricks, player]);

  const handleTap = useCallback((accuracy: number) => {
    const gs = gsRef.current;
    if (!gs.awaitingTap || !gs.currentTrickId) return;
    const canvas = canvasRef.current;
    landTrick(gs.currentTrickId, accuracy, canvas?.width ?? 375, canvas?.height ?? 812);
  }, []);

  // ── TOUCH HANDLING ─────────────────────────────────────────────────────────
  const onTouchStart = useCallback((e: React.TouchEvent) => {
    const t = e.touches[0];
    touchRef.current = { startX: t.clientX, startY: t.clientY, startTime: Date.now(), moved: false };
    holdTimerRef.current = setTimeout(() => {
      if (touchRef.current && !touchRef.current.moved) {
        handleGesture('up', true);
      }
    }, 260);
  }, [handleGesture]);

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    if (!touchRef.current) return;
    const t = e.touches[0];
    const dx = t.clientX - touchRef.current.startX;
    const dy = t.clientY - touchRef.current.startY;
    if (Math.sqrt(dx * dx + dy * dy) > 10) touchRef.current.moved = true;
  }, []);

  const onTouchEnd = useCallback((e: React.TouchEvent) => {
    if (holdTimerRef.current) clearTimeout(holdTimerRef.current);
    if (!touchRef.current) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - touchRef.current.startX;
    const dy = t.clientY - touchRef.current.startY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const elapsed = Date.now() - touchRef.current.startTime;

    if (dist < 18 && elapsed < 280) {
      // TAP
      const gs = gsRef.current;
      if (gs.awaitingTap && gs.currentTrickId) {
        const prog = gs.tapProgress;
        // accuracy: best near 0.3 (early-mid), worst at 1.0
        const accuracy = Math.max(0, 1 - Math.abs(prog - 0.3) * 1.6);
        handleTap(accuracy);
      }
    } else if (dist >= 35) {
      const absX = Math.abs(dx), absY = Math.abs(dy);
      const dir: SwipeDirection = absY > absX ? (dy < 0 ? 'up' : 'down') : (dx > 0 ? 'right' : 'left');
      handleGesture(dir, false);
    }
    touchRef.current = null;
  }, [handleGesture, handleTap]);

  // ── GAME LOOP ──────────────────────────────────────────────────────────────
  const startRun = useCallback(() => {
    gsRef.current = makeInitialGS();
    gsRef.current.running = true;
    gsRef.current.phase = 'running';
    obstaclesRef.current = makeObstacles(level);
    particlesRef.current = [];
    floatTextsRef.current = [];
    finishedRef.current = false;
    setPhase('running');

    timerRef.current = setInterval(() => {
      const gs = gsRef.current;
      if (gs.timeLeft <= 1) {
        clearInterval(timerRef.current!);
        gs.running = false;
        gs.phase = 'finished';
        gs.timeLeft = 0;
        if (!finishedRef.current) {
          finishedRef.current = true;
          setPhase('finished');
          setTimeout(() => onComplete(gs.score, gs.trickHistory), 1400);
        }
      } else {
        gs.timeLeft--;
      }
    }, 1000);
  }, [level, onComplete]);

  // ── RAF GAME LOOP ──────────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;

    const resize = () => {
      canvas.width = canvas.offsetWidth * window.devicePixelRatio;
      canvas.height = canvas.offsetHeight * window.devicePixelRatio;
      ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
    };
    resize();
    window.addEventListener('resize', resize);

    const loop = () => {
      const w = canvas.offsetWidth, h = canvas.offsetHeight;
      const gs = gsRef.current;
      const obs = obstaclesRef.current;

      // ── PHYSICS UPDATE ─────────────────────────────────────────────────────
      if (gs.running) {
        gs.frameCount++;
        gs.worldOffset += SCROLL_SPEED + (player.stats.speed * 0.08);
        gs.walkFrame++;

        // Gravity
        if (!gs.onGround || gs.skaterY > 0) {
          gs.skaterVY += GRAVITY;
          gs.skaterY -= gs.skaterVY;
          if (gs.skaterY <= 0) {
            gs.skaterY = 0; gs.skaterVY = 0; gs.onGround = true;
            if (gs.trickPhase === 'airborne' && gs.currentTrickId && !gs.awaitingTap) {
              // missed tap = auto bail
              landTrick(gs.currentTrickId, 0.1, w, h);
            }
          }
        }

        // Board rotation during air tricks
        if (gs.trickPhase === 'airborne') {
          gs.airTime++;
          const trick = ALL_TRICKS.find(t => t.id === gs.currentTrickId);
          if (trick) {
            if (trick.category === 'flip') {
              gs.boardRotation += TRICK_ROTATION_SPEED;
              if (trick.id === 'heelflip' || trick.id === 'inward-heel') gs.boardRotation -= TRICK_ROTATION_SPEED * 2;
            } else if (trick.category === 'ollie') {
              gs.bodyRotation += 2;
            }
          }
        }

        // Tap window progress
        if (gs.awaitingTap) {
          gs.tapProgress = Math.min((Date.now() - gs.tapWindowStart) / gs.tapWindowDuration, 1);
          if (gs.tapProgress >= 1) {
            // auto land badly
            if (gs.currentTrickId) landTrick(gs.currentTrickId, 0.1, w, h);
          }
        }

        // Grind
        if (gs.trickPhase === 'grind' && gs.grindObstacleIdx >= 0) {
          const gObs = obs[gs.grindObstacleIdx];
          if (gObs) {
            const screenX = gObs.worldX - gs.worldOffset;
            gs.grindProgress = 1 - (screenX / w);
            gs.skaterY = gObs.height + 2;
            gs.grindSparkTimer = (gs.grindSparkTimer + 1) % 3;
            // spawn sparks
            if (gs.grindSparkTimer === 0) {
              const sparks = spawnGrindSparks(gs, w * SKATER_X, h * GROUND_Y_RATIO - gs.skaterY);
              particlesRef.current.push(...sparks);
            }
            // End grind when obstacle passes
            if (screenX < -gObs.width) {
              const acc = 0.75 + Math.random() * 0.2;
              landTrick(gs.currentTrickId!, acc, w, h);
              gs.skaterY = 0;
            }
          }
        }

        // Manual drift
        if (gs.trickPhase === 'manual') {
          gs.manualFrames++;
          gs.manualBalance += (Math.random() - 0.5) * 0.04;
          gs.manualBalance = Math.max(-1, Math.min(1, gs.manualBalance));
        }

        // Screen shake decay
        if (gs.shakeFrames > 0) {
          gs.shakeX = (Math.random() - 0.5) * 5;
          gs.shakeY = (Math.random() - 0.5) * 4;
          gs.shakeFrames--;
        } else { gs.shakeX = 0; gs.shakeY = 0; }

        // Mark passed obstacles
        obs.forEach(o => {
          const sx = o.worldX - gs.worldOffset;
          if (sx < -o.width - 20 && !o.passed) o.passed = true;
        });
      }

      // ── PARTICLES UPDATE ───────────────────────────────────────────────────
      particlesRef.current = particlesRef.current
        .filter(p => p.life > 0)
        .map(p => ({ ...p, x: p.x + p.vx, y: p.y + p.vy, vy: p.vy + 0.15, life: p.life - 1 }));

      // Float texts update
      floatTextsRef.current = floatTextsRef.current
        .filter(f => f.life > 0)
        .map(f => ({ ...f, y: f.y + f.vy, life: f.life - 1, alpha: f.life / f.maxLife }));

      // ── DRAW ──────────────────────────────────────────────────────────────
      ctx.save();
      ctx.translate(gs.shakeX, gs.shakeY);

      const groundY = h * GROUND_Y_RATIO;

      drawBackground(ctx, w, h, level, gs.worldOffset);

      // obstacles
      obs.forEach(o => {
        const screenX = o.worldX - gs.worldOffset;
        if (screenX > -o.width - 20 && screenX < w + 20) {
          ctx.save();
          ctx.globalAlpha = o.passed ? 0.3 : 1;
          drawObstacle(ctx, o, screenX, groundY, level);
          ctx.restore();
        }
      });

      drawGround(ctx, w, h, level, gs.worldOffset);

      // skater
      const skaterScreenX = w * SKATER_X;
      const skaterScreenY = groundY - gs.skaterY;
      drawSkater(ctx, skaterScreenX, skaterScreenY, gs, level);

      // particles
      drawParticles(ctx, particlesRef.current);

      // HUD
      drawHUD(ctx, w, h, gs, level, floatTextsRef.current, gs.tapProgress, gs.awaitingTap);

      ctx.restore();

      rafRef.current = requestAnimationFrame(loop);
    };

    rafRef.current = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener('resize', resize);
    };
  }, [level, player]);

  useEffect(() => {
    return () => { clearInterval(timerRef.current!); };
  }, []);

  // ── FINISHED OVERLAY ──────────────────────────────────────────────────────
  if (phase === 'finished') {
    const gs = gsRef.current;
    const grade = getLetterGrade(gs.score, level.multiplier);
    const gradeColor = getGradeColor(grade);
    return (
      <div style={{
        height: '100dvh', background: '#0a0a0f', display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        fontFamily: "'Bebas Neue', Impact, sans-serif", padding: 24, gap: 12,
      }}>
        <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 10, letterSpacing: 4, fontFamily: 'monospace' }}>
          {level.city.toUpperCase()} · {level.spotName.toUpperCase()}
        </div>
        <div style={{ fontSize: 110, lineHeight: 1, color: gradeColor, filter: `drop-shadow(0 0 40px ${gradeColor}88)` }}>
          {grade}
        </div>
        <div style={{ color: '#fff', fontSize: 48 }}>{formatScore(gs.score)}</div>
        <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12, fontFamily: 'monospace', letterSpacing: 2 }}>
          {gs.trickHistory.length} TRICKS · {gs.bails} BAILS · MAX x{Math.max(...gs.trickHistory.map(t => t.multiplier), 1).toFixed(1)}
        </div>
        <div style={{ color: 'rgba(255,255,255,0.2)', fontSize: 10, fontFamily: 'monospace', letterSpacing: 2, marginTop: 8 }}>
          SAVING...
        </div>
      </div>
    );
  }

  // ── IDLE / START SCREEN ───────────────────────────────────────────────────
  return (
    <div style={{ position: 'relative', width: '100%', height: '100dvh', overflow: 'hidden', background: '#111' }}
      onTouchStart={phase === 'running' ? onTouchStart : undefined}
      onTouchMove={phase === 'running' ? onTouchMove : undefined}
      onTouchEnd={phase === 'running' ? onTouchEnd : undefined}
    >
      <canvas
        ref={canvasRef}
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', display: 'block' }}
      />

      {/* Back button always visible */}
      <button onClick={onBack} style={{
        position: 'absolute', top: 16, left: 16, zIndex: 20,
        background: 'rgba(0,0,0,0.5)', border: '1px solid rgba(255,255,255,0.2)',
        borderRadius: 8, color: '#fff', fontSize: 18, width: 40, height: 40,
        cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: 'sans-serif',
      }}>←</button>

      {/* City name HUD (top left) */}
      {phase === 'running' && (
        <div style={{
          position: 'absolute', top: 16, left: 64, zIndex: 10,
          fontFamily: "'Bebas Neue', Impact, sans-serif",
        }}>
          <div style={{ color: '#fff', fontSize: 20, lineHeight: 1, textShadow: '0 1px 6px rgba(0,0,0,0.9)' }}>
            {level.city}
          </div>
          <div style={{ color: 'rgba(255,255,255,0.45)', fontSize: 8, fontFamily: 'monospace', letterSpacing: 2 }}>
            {level.spotName.toUpperCase()}
          </div>
        </div>
      )}

      {/* START OVERLAY */}
      {phase === 'idle' && (
        <div style={{
          position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.78)', zIndex: 30,
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          gap: 14, padding: '24px',
          fontFamily: "'Bebas Neue', Impact, sans-serif",
        }}>
          <div style={{ color: 'rgba(255,255,255,0.35)', fontSize: 10, letterSpacing: 4, fontFamily: 'monospace' }}>
            {level.state} · {level.spotName}
          </div>
          <div style={{ fontSize: 56, color: '#fff', lineHeight: 1 }}>{level.city}</div>
          <div style={{
            color: 'rgba(255,255,255,0.45)', fontSize: 11, fontFamily: 'monospace',
            textAlign: 'center', maxWidth: 260, lineHeight: 1.6, letterSpacing: 0.5,
          }}>
            {level.description}
          </div>

          <div style={{
            background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 12, padding: '14px 18px', width: '100%', maxWidth: 300,
            display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '7px 12px',
          }}>
            {[
              ['↑ Swipe Up', 'Ollie / Air Trick'],
              ['↓ Swipe Down', 'Manual'],
              ['← Swipe Left', 'Kickflip'],
              ['→ Swipe Right', 'Heelflip'],
              ['Hold on obstacle', 'Grind'],
              ['Tap (in air)', 'Land trick'],
            ].map(([g, n]) => (
              <div key={g} style={{ display: 'flex', gap: 6 }}>
                <span style={{ color: '#ff6b35', fontSize: 9, fontFamily: 'monospace', minWidth: 80 }}>{g}</span>
                <span style={{ color: 'rgba(255,255,255,0.35)', fontSize: 9, fontFamily: 'monospace' }}>{n}</span>
              </div>
            ))}
          </div>

          <button onClick={startRun} style={{
            background: 'linear-gradient(135deg, #ff6b35, #f7c59f)',
            border: 'none', borderRadius: 10, color: '#fff',
            fontSize: 26, letterSpacing: 4, padding: '18px 52px',
            fontFamily: "'Bebas Neue', Impact, sans-serif",
            cursor: 'pointer', marginTop: 6,
            boxShadow: '0 4px 28px rgba(255,107,53,0.55)',
          }}>
            DROP IN →
          </button>
        </div>
      )}
    </div>
  );
};
