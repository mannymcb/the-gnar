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

// ─── CONSTANTS ────────────────────────────────────────────────────────────────
const RUN_DURATION   = 60;
const MAX_BAILS      = 3;
const GROUND_RATIO   = 0.70;   // ground Y as fraction of canvas H
const SKATER_FRAC    = 0.28;   // skater fixed screen-X fraction
const BASE_SCROLL    = 2.6;    // world scroll px/frame
const OBS_SPACING    = 440;    // world px between obstacles
const OBS_FIRST      = 320;    // world X of first obstacle
const GRAVITY        = 0.52;
const JUMP_VY        = -12.5;  // initial jump velocity (upward = negative)
const FLIP_RPM       = 16;     // board rotation deg/frame during flip tricks
const BAIL_FRAMES    = 55;     // frames to stay in bail pose before auto-reset
const TAP_WINDOW_MS  = 900;    // total landing window in ms
const GRIND_PTS_TICK = 8;      // points per frame while grinding
const GRIND_MULT     = 1.5;    // score multiplier while grinding

// ─── STATE MACHINE ────────────────────────────────────────────────────────────
// Skater FSM:
//   rolling → (swipe up/left/right) → airborne → (tap) → rolling | bail
//   rolling → (swipe down)          → manual   → (auto timeout) → rolling
//   rolling → (hold near obstacle)  → grinding → (obstacle end) → rolling
//   rolling/airborne/grinding/manual → (miss tap or timeout) → bail → rolling

type TrickPhase = 'rolling' | 'airborne' | 'grinding' | 'manual' | 'bail_anim';

interface Obstacle {
  type: 'ledge' | 'rail' | 'gap' | 'block' | 'stairs' | 'bank';
  worldX: number;
  w: number; h: number;
  label: string;
  grindable: boolean;
  scored: boolean;   // grind score already given
}

interface Particle {
  x: number; y: number;
  vx: number; vy: number;
  life: number; maxLife: number;
  color: string; r: number;
  type: 'dust' | 'spark';
}

interface FloatText {
  x: number; y: number; vy: number;
  text: string; color: string; size: number;
  life: number; maxLife: number;
}

// Everything mutable lives here — no React state in the hot path
interface GS {
  // meta
  running: boolean;
  timeLeft: number;
  frameCount: number;
  // world
  worldOffset: number;
  // physics
  skaterY: number;      // px above ground line (0 = on ground)
  skaterVY: number;     // px/frame, positive = falling
  onGround: boolean;
  // FSM
  phase: TrickPhase;
  bailFrames: number;   // countdown to auto-recover from bail
  currentTrick: string | null;
  boardRot: number;     // degrees, for flip anim
  bodyTilt: number;     // body lean in air
  airFrames: number;    // frames in air
  // landing window
  tapOpen: boolean;
  tapStart: number;     // Date.now() when window opened
  tapProgress: number;  // 0→1 as window fills
  // grind
  grindIdx: number;     // obstacle index being ground (-1 = none)
  grindFrames: number;  // how long we've been grinding
  sparkTimer: number;   // frame counter for spark emission
  // manual
  manualBalance: number; // −1…1 drift
  manualFrames: number;
  // scoring
  score: number;
  combo: number;
  multiplier: number;
  lastTrickId: string | null;
  consecutiveSame: number;
  trickHistory: TrickResult[];
  bails: number;
  // feedback
  shakeX: number; shakeY: number; shakeTTL: number;
  walkFrame: number;
}

function makeGS(): GS {
  return {
    running: false, timeLeft: RUN_DURATION, frameCount: 0,
    worldOffset: 0,
    skaterY: 0, skaterVY: 0, onGround: true,
    phase: 'rolling', bailFrames: 0,
    currentTrick: null, boardRot: 0, bodyTilt: 0, airFrames: 0,
    tapOpen: false, tapStart: 0, tapProgress: 0,
    grindIdx: -1, grindFrames: 0, sparkTimer: 0,
    manualBalance: 0, manualFrames: 0,
    score: 0, combo: 0, multiplier: 1,
    lastTrickId: null, consecutiveSame: 0,
    trickHistory: [], bails: 0,
    shakeX: 0, shakeY: 0, shakeTTL: 0,
    walkFrame: 0,
  };
}

function makeObstacles(level: Level): Obstacle[] {
  return level.obstacles.map((cfg, i) => {
    const base = { type: cfg.type, worldX: OBS_FIRST + i * OBS_SPACING, label: cfg.label, scored: false };
    switch (cfg.type) {
      case 'ledge':  return { ...base, w: 120, h: 18, grindable: true  };
      case 'rail':   return { ...base, w: 100, h:  8, grindable: true  };
      case 'block':  return { ...base, w:  50, h: 30, grindable: true  };
      case 'gap':    return { ...base, w:  58, h:  0, grindable: false };
      case 'stairs': return { ...base, w:  80, h: 40, grindable: false };
      case 'bank':   return { ...base, w:  80, h: 44, grindable: false };
      default:       return { ...base, w:  80, h: 20, grindable: false };
    }
  });
}

// ─── DRAW: BACKGROUND ────────────────────────────────────────────────────────
function drawBg(ctx: CanvasRenderingContext2D, W: number, H: number, level: Level, wo: number) {
  const [sky1, sky2, sky3] = level.palette.sky;
  const grd = ctx.createLinearGradient(0, 0, 0, H);
  grd.addColorStop(0, sky1); grd.addColorStop(0.5, sky2); grd.addColorStop(1, sky3);
  ctx.fillStyle = grd; ctx.fillRect(0, 0, W, H);

  const GY = H * GROUND_RATIO;

  // Seattle rain
  if (level.id === 'seattle') {
    ctx.save(); ctx.strokeStyle = 'rgba(160,200,255,0.09)'; ctx.lineWidth = 1;
    const ro = (wo * 2.2) % 72;
    for (let i = 0; i < 36; i++) {
      const rx = ((i * 61 + ro) % W);
      ctx.beginPath(); ctx.moveTo(rx, 0); ctx.lineTo(rx - 7, GY); ctx.stroke();
    }
    ctx.restore();
  }

  // Buildings (parallax 0.2×)
  const bOff = (wo * 0.2) % W;
  const BH = [0.40, 0.28, 0.46, 0.34, 0.52, 0.38, 0.44, 0.30, 0.50, 0.36, 0.42, 0.26];
  const BW = [0.08, 0.065, 0.10, 0.07, 0.09, 0.06, 0.11, 0.075, 0.085, 0.07, 0.095, 0.06];
  for (let pass = 0; pass < 2; pass++) {
    let bx = pass === 0 ? -bOff : W - bOff;
    for (let i = 0; i < BH.length; i++) {
      const bw = BW[i] * W, bh = BH[i] * GY, by = GY - bh;
      ctx.fillStyle = level.id === 'sf' ? 'rgba(0,0,0,0.5)' : 'rgba(0,0,0,0.4)';
      ctx.fillRect(bx, by, bw - 1, bh);
      const wc = level.id === 'sf' ? 'rgba(255,210,100,0.30)' : level.id === 'portland' ? 'rgba(200,70,50,0.22)' : 'rgba(190,215,255,0.18)';
      ctx.fillStyle = wc;
      for (let wy = by + 8; wy < GY - 10; wy += 14)
        for (let wx = bx + 4; wx < bx + bw - 8; wx += 10)
          if ((i + Math.floor(wy / 14)) % 3 !== 0) ctx.fillRect(wx, wy, 5, 7);
      bx += bw;
    }
  }

  // Portland bridge
  if (level.id === 'portland') {
    const by2 = GY * 0.60;
    ctx.fillStyle = 'rgba(30,30,50,0.75)'; ctx.fillRect(0, by2, W, 9);
    for (let i = 0; i < 5; i++) { ctx.fillRect((i / 4) * W - 5, by2, 10, GY - by2); }
  }
}

// ─── DRAW: GROUND ─────────────────────────────────────────────────────────────
function drawGround(ctx: CanvasRenderingContext2D, W: number, H: number, level: Level, wo: number) {
  const GY = H * GROUND_RATIO;
  ctx.fillStyle = level.palette.ground; ctx.fillRect(0, GY, W, H - GY);
  ctx.fillStyle = 'rgba(0,0,0,0.32)'; ctx.fillRect(0, GY, W, 3);

  // Seattle wet reflection strips
  if (level.id === 'seattle') {
    ctx.fillStyle = 'rgba(90,140,210,0.08)';
    const ro = wo % 110;
    for (let i = 0; i < 12; i++) ctx.fillRect((i * 110 - ro + W) % W, GY + 5, 55, 9);
  }

  // Pavement joints
  ctx.strokeStyle = 'rgba(0,0,0,0.16)'; ctx.lineWidth = 1.5;
  const jSp = level.id === 'portland' ? 50 : 78;
  const jO = wo % jSp;
  for (let i = 0; i <= Math.ceil(W / jSp) + 1; i++) {
    const jx = i * jSp - jO;
    ctx.beginPath(); ctx.moveTo(jx, GY); ctx.lineTo(jx, H); ctx.stroke();
  }
}

// ─── DRAW: OBSTACLES ──────────────────────────────────────────────────────────
function drawObstacle(ctx: CanvasRenderingContext2D, obs: Obstacle, sx: number, GY: number, isGrinding: boolean) {
  const { w, h, type } = obs;
  const bx = sx, by = GY - h;

  ctx.save();
  if (isGrinding) { ctx.shadowColor = '#FFD700'; ctx.shadowBlur = 10; }

  switch (type) {
    case 'ledge':
    case 'block': {
      const c = type === 'block' ? ['#b0a090','#ccbbaa'] : ['#8090a0','#a0b4c8'];
      ctx.fillStyle = 'rgba(0,0,0,0.22)'; ctx.fillRect(bx + 4, by + 4, w, h);
      ctx.fillStyle = c[0]; ctx.fillRect(bx, by, w, h);
      ctx.fillStyle = c[1]; ctx.fillRect(bx, by, w, 5);
      ctx.fillStyle = 'rgba(255,255,255,0.28)'; ctx.fillRect(bx + 2, by + 1, w - 4, 2);
      ctx.fillStyle = 'rgba(0,0,0,0.18)'; ctx.fillRect(bx, by + 5, 4, h - 5);
      break;
    }
    case 'rail': {
      ctx.fillStyle = '#555';
      ctx.fillRect(bx + 8, by + h, 4, GY - by - h);
      ctx.fillRect(bx + w - 12, by + h, 4, GY - by - h);
      const rg = ctx.createLinearGradient(0, by, 0, by + h);
      rg.addColorStop(0,'#eee'); rg.addColorStop(0.4,'#bbb'); rg.addColorStop(1,'#888');
      ctx.fillStyle = rg;
      ctx.beginPath(); ctx.roundRect(bx, by, w, h, 3); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.65)'; ctx.fillRect(bx + 4, by + 1, w - 8, 2);
      break;
    }
    case 'gap': {
      ctx.fillStyle = 'rgba(255,90,40,0.45)'; ctx.fillRect(bx, GY - 2, w, 3);
      ctx.setLineDash([5, 4]);
      ctx.strokeStyle = 'rgba(255,200,0,0.5)'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(bx, GY - 1); ctx.lineTo(bx + w, GY - 1); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.fillRect(bx + 3, GY + 2, w - 6, 18);
      break;
    }
    case 'stairs': {
      const steps = 5, sw = w / steps;
      for (let s = 0; s < steps; s++) {
        const sx2 = bx + s * sw, sy2 = GY - (h / steps) * (steps - s);
        ctx.fillStyle = s % 2 === 0 ? '#888' : '#aaa';
        ctx.fillRect(sx2, sy2, sw, GY - sy2);
        ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.fillRect(sx2, sy2, sw, 2);
      }
      break;
    }
    case 'bank': {
      ctx.fillStyle = '#667';
      ctx.beginPath(); ctx.moveTo(bx, GY); ctx.lineTo(bx + w, GY - h); ctx.lineTo(bx + w, GY); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#889'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(bx, GY); ctx.lineTo(bx + w, GY - h); ctx.stroke();
      break;
    }
  }

  // label
  ctx.shadowBlur = 0;
  ctx.globalAlpha = 0.5; ctx.fillStyle = '#fff'; ctx.font = '8px monospace'; ctx.textAlign = 'center';
  ctx.fillText(obs.label.toUpperCase(), bx + w / 2, by - 4);
  ctx.restore();
}

// ─── DRAW: SKATER ─────────────────────────────────────────────────────────────
function drawSkater(ctx: CanvasRenderingContext2D, sx: number, sy: number, gs: GS) {
  ctx.save();
  ctx.translate(sx, sy);

  const { phase, boardRot, bodyTilt, walkFrame } = gs;
  const isAir   = phase === 'airborne';
  const isGrind = phase === 'grinding';
  const isManual= phase === 'manual';
  const isBail  = phase === 'bail_anim';

  // ── BOARD ─────────────────────────────────────────────────────────────────
  ctx.save();
  if (isAir)    ctx.rotate((boardRot * Math.PI) / 180);
  if (isManual) ctx.rotate(0.20);   // nose up
  if (isBail)   { ctx.translate(18, 8); ctx.rotate((boardRot * Math.PI) / 180); }

  const DW = 36, DH = 7;
  const dg = ctx.createLinearGradient(0, -DH / 2, 0, DH / 2);
  dg.addColorStop(0, '#d44'); dg.addColorStop(0.5, '#c33'); dg.addColorStop(1, '#922');
  ctx.fillStyle = dg;
  ctx.beginPath(); ctx.roundRect(-DW / 2, -DH / 2, DW, DH, 3); ctx.fill();
  // grip
  ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.fillRect(-DW / 2 + 2, -DH / 2 + 1, DW - 4, 2);
  // stripe
  ctx.fillStyle = 'rgba(255,255,255,0.14)'; ctx.fillRect(-7, -DH / 2 + 3, 14, 2);
  // trucks
  ctx.fillStyle = '#aaa';
  ctx.fillRect(-DW / 2 + 3, DH / 2 - 2, 9, 4);
  ctx.fillRect(DW / 2 - 12, DH / 2 - 2, 9, 4);
  // wheels
  const wr = 4;
  [[-DW/2+5, DH/2+2],[DW/2-5, DH/2+2],[-DW/2+5,-DH/2-2],[DW/2-5,-DH/2-2]].forEach(([wx,wy]) => {
    ctx.fillStyle = '#ddd'; ctx.beginPath(); ctx.arc(wx, wy, wr, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = '#999'; ctx.beginPath(); ctx.arc(wx, wy, wr*0.45, 0, Math.PI*2); ctx.fill();
  });
  ctx.restore();

  if (isBail) {
    // ragdoll body
    ctx.save(); ctx.rotate(boardRot * 0.006);
    ctx.fillStyle = '#ffcc99'; ctx.beginPath(); ctx.arc(14, -18, 8, 0, Math.PI*2); ctx.fill();
    ctx.strokeStyle = '#5577aa'; ctx.lineWidth = 5; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(6,-14); ctx.lineTo(-6,-6); ctx.lineTo(-14,-2); ctx.stroke();
    ctx.strokeStyle = '#445';
    ctx.beginPath(); ctx.moveTo(-6,-6); ctx.lineTo(-8,6); ctx.lineTo(4,14); ctx.stroke();
    ctx.restore();
    ctx.restore();
    return;
  }

  // ── BODY ──────────────────────────────────────────────────────────────────
  ctx.save();
  if (isAir) ctx.rotate((bodyTilt * Math.PI) / 180);

  const legSw  = isAir ? 0 : Math.sin(walkFrame * 0.18) * 4;
  const bodyBob= isAir ? 0 : Math.abs(Math.sin(walkFrame * 0.18)) * 1.5;
  const torsoY = -DH / 2 - 30 - bodyBob;

  // back leg
  ctx.strokeStyle = '#445'; ctx.lineWidth = 5; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(-4, -DH/2); ctx.lineTo(-6+legSw, -DH/2-14); ctx.lineTo(-10+legSw*.5, -DH/2-7); ctx.stroke();
  ctx.fillStyle = '#222'; ctx.beginPath(); ctx.ellipse(-10+legSw*.5, -DH/2-5, 6, 3, 0, 0, Math.PI*2); ctx.fill();
  // front leg
  ctx.strokeStyle = '#556';
  ctx.beginPath(); ctx.moveTo(6, -DH/2); ctx.lineTo(8-legSw, -DH/2-16); ctx.lineTo(12-legSw*.5, -DH/2-7); ctx.stroke();
  ctx.fillStyle = '#334'; ctx.beginPath(); ctx.ellipse(12-legSw*.5, -DH/2-5, 6, 3, 0, 0, Math.PI*2); ctx.fill();

  // torso
  ctx.fillStyle = '#4466aa';
  ctx.beginPath(); ctx.roundRect(-7, torsoY + 10, 14, 14, 3); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.fillRect(-3, torsoY + 13, 6, 4);

  // arms
  const armSw = isGrind ? 14 : isManual ? -10 : Math.sin(walkFrame * 0.18) * 6;
  ctx.lineWidth = 4;
  ctx.strokeStyle = '#3355aa';
  ctx.beginPath(); ctx.moveTo(-6, torsoY+14); ctx.lineTo(-14, torsoY+22+armSw); ctx.stroke();
  ctx.strokeStyle = '#5577bb';
  ctx.beginPath(); ctx.moveTo(6, torsoY+14); ctx.lineTo(13, torsoY+20-armSw); ctx.stroke();

  // head
  ctx.fillStyle = '#ffcc99'; ctx.beginPath(); ctx.arc(1, torsoY+5, 9, 0, Math.PI*2); ctx.fill();
  // helmet
  ctx.fillStyle = '#cc2222'; ctx.beginPath(); ctx.ellipse(1, torsoY+2, 9, 6, 0, Math.PI, 0); ctx.fill();
  // shades
  ctx.fillStyle = '#111';
  ctx.fillRect(-6, torsoY+5, 5, 3); ctx.fillRect(1, torsoY+5, 5, 3);
  ctx.strokeStyle = '#333'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(-1, torsoY+6); ctx.lineTo(1, torsoY+6); ctx.stroke();

  ctx.restore();
  ctx.restore();
}

// ─── DRAW: PARTICLES ──────────────────────────────────────────────────────────
function drawParticles(ctx: CanvasRenderingContext2D, ps: Particle[]) {
  for (const p of ps) {
    const a = p.life / p.maxLife;
    ctx.save(); ctx.globalAlpha = a;
    if (p.type === 'spark') {
      ctx.fillStyle = p.color; ctx.shadowColor = p.color; ctx.shadowBlur = 8;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r * a, 0, Math.PI*2); ctx.fill();
    } else {
      ctx.fillStyle = p.color;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r * a, 0, Math.PI*2); ctx.fill();
    }
    ctx.restore();
  }
}

// ─── DRAW: HUD ────────────────────────────────────────────────────────────────
function drawHUD(
  ctx: CanvasRenderingContext2D, W: number, H: number, gs: GS,
  floats: FloatText[], obstacles: Obstacle[],
) {
  const GY = H * GROUND_RATIO;
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.9)'; ctx.shadowBlur = 6;

  // ── Score ─────────────────────────────────────────────────────────────────
  ctx.textAlign = 'right'; ctx.font = 'bold 30px "Bebas Neue",Impact,sans-serif';
  ctx.fillStyle = '#fff'; ctx.fillText(formatScore(gs.score), W - 14, 46);

  // ── Timer ─────────────────────────────────────────────────────────────────
  ctx.font = 'bold 14px monospace';
  ctx.fillStyle = gs.timeLeft <= 10 ? '#ff4444' : 'rgba(255,255,255,0.75)';
  ctx.fillText(`${gs.timeLeft}s`, W - 14, 64);

  // ── Bail indicators (top-left) ────────────────────────────────────────────
  ctx.textAlign = 'left'; ctx.font = '9px monospace';
  ctx.fillStyle = 'rgba(255,255,255,0.45)'; ctx.fillText('BAILS', 14, 30);
  for (let i = 0; i < MAX_BAILS; i++) {
    ctx.fillStyle = i < gs.bails ? '#ff4444' : 'rgba(255,255,255,0.2)';
    ctx.beginPath(); ctx.arc(14 + 4 + i * 16, 40, 5, 0, Math.PI * 2); ctx.fill();
  }

  // ── Multiplier (top-center) ───────────────────────────────────────────────
  if (gs.multiplier > 1.05) {
    ctx.textAlign = 'center';
    ctx.font = `bold ${gs.multiplier > 4 ? 26 : 20}px "Bebas Neue",Impact,sans-serif`;
    ctx.fillStyle = '#FFD700'; ctx.shadowColor = 'rgba(255,200,0,0.7)'; ctx.shadowBlur = 14;
    ctx.fillText(`x${gs.multiplier.toFixed(1)}`, W / 2, 50);
    ctx.shadowBlur = 6;
  }

  // ── Combo dots (bottom-left) ──────────────────────────────────────────────
  if (gs.combo > 0) {
    const SHOW = Math.min(gs.combo, 14);
    ctx.textAlign = 'left'; ctx.font = '9px monospace';
    ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.fillText('COMBO', 14, H - 80);
    for (let i = 0; i < SHOW; i++) {
      ctx.fillStyle = i < 5 ? '#ff6b35' : i < 10 ? '#FFD700' : '#00ff88';
      ctx.beginPath(); ctx.arc(14 + 5 + i * 13, H - 65, 5, 0, Math.PI*2); ctx.fill();
    }
    if (gs.combo > 14) {
      ctx.fillStyle = '#fff'; ctx.font = '9px monospace';
      ctx.fillText(`+${gs.combo - 14}`, 14 + 14 * 13 + 8, H - 62);
    }
  }

  // ── TAP LANDING WINDOW ────────────────────────────────────────────────────
  if (gs.tapOpen) {
    const TW = 140, TH = 12;
    const tx = W / 2 - TW / 2, ty = GY - 68;
    // BG
    ctx.fillStyle = 'rgba(0,0,0,0.65)';
    ctx.beginPath(); ctx.roundRect(tx - 3, ty - 3, TW + 6, TH + 6, 6); ctx.fill();
    // track
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.beginPath(); ctx.roundRect(tx, ty, TW, TH, 4); ctx.fill();
    // GREEN zone (0–35%)
    ctx.fillStyle = '#00ff88';
    ctx.beginPath(); ctx.roundRect(tx, ty, TW * 0.35, TH, 4); ctx.fill();
    // YELLOW zone (35–65%)
    ctx.fillStyle = '#FFD700';
    ctx.beginPath(); ctx.roundRect(tx + TW * 0.35, ty, TW * 0.30, TH, 0); ctx.fill();
    // RED zone (65–100%)
    ctx.fillStyle = '#ff5544';
    ctx.beginPath(); ctx.roundRect(tx + TW * 0.65, ty, TW * 0.35, TH, [0,4,4,0]); ctx.fill();
    // cursor bar
    const cPos = tx + TW * gs.tapProgress;
    ctx.fillStyle = '#fff'; ctx.shadowColor = '#fff'; ctx.shadowBlur = 8;
    ctx.fillRect(cPos - 2, ty - 3, 4, TH + 6);
    ctx.shadowBlur = 6;
    // label
    ctx.textAlign = 'center'; ctx.font = 'bold 10px monospace';
    ctx.fillStyle = '#fff'; ctx.shadowColor = '#000'; ctx.shadowBlur = 4;
    ctx.fillText('TAP TO LAND', W / 2, ty - 8);
    // quality preview
    const qLabel = gs.tapProgress < 0.35 ? 'CLEAN' : gs.tapProgress < 0.65 ? 'SKETCHY' : 'BAIL ZONE';
    const qColor = gs.tapProgress < 0.35 ? '#00ff88' : gs.tapProgress < 0.65 ? '#FFD700' : '#ff5544';
    ctx.fillStyle = qColor; ctx.font = '9px monospace'; ctx.shadowBlur = 0;
    ctx.fillText(qLabel, W / 2, ty + TH + 12);
  }

  // ── GRIND indicator ───────────────────────────────────────────────────────
  if (gs.phase === 'grinding') {
    const obs = obstacles[gs.grindIdx];
    if (obs) {
      ctx.textAlign = 'center'; ctx.font = 'bold 11px monospace';
      ctx.fillStyle = '#FFD700'; ctx.shadowColor = '#FFD700'; ctx.shadowBlur = 10;
      ctx.fillText('GRINDING +POINTS', W / 2, GY - 80);
      ctx.shadowBlur = 6;
    }
  }

  // ── MANUAL balance bar ────────────────────────────────────────────────────
  if (gs.phase === 'manual') {
    const BW2 = 100, BH = 8, bx = W / 2 - BW2 / 2, by = H - 52;
    ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.beginPath(); ctx.roundRect(bx, by, BW2, BH, 4); ctx.fill();
    const bal = (gs.manualBalance + 1) / 2;
    ctx.fillStyle = Math.abs(gs.manualBalance) > 0.65 ? '#ff4444' : '#00ff88';
    ctx.fillRect(bx + 2, by + 2, (BW2 - 4) * bal, BH - 4);
    ctx.fillStyle = '#fff'; ctx.fillRect(bx + BW2 / 2 - 1, by, 2, BH);
    ctx.textAlign = 'center'; ctx.font = '9px monospace';
    ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.shadowBlur = 0;
    ctx.fillText('MANUAL — BALANCE', W / 2, by - 5);
  }

  // ── Float texts ───────────────────────────────────────────────────────────
  for (const ft of floats) {
    const a = ft.life / ft.maxLife;
    ctx.save(); ctx.globalAlpha = a; ctx.textAlign = 'center';
    ctx.font = `bold ${ft.size}px "Bebas Neue",Impact,sans-serif`;
    ctx.fillStyle = ft.color; ctx.shadowColor = 'rgba(0,0,0,0.95)'; ctx.shadowBlur = 10;
    ctx.fillText(ft.text, ft.x, ft.y);
    ctx.restore();
  }

  ctx.restore();
}

// ─── COMPONENT ────────────────────────────────────────────────────────────────
export const SkateRun: React.FC<Props> = ({ level, player, levelIndex, onComplete, onBack }) => {
  const canvasRef   = useRef<HTMLCanvasElement>(null);
  const gs          = useRef<GS>(makeGS());
  const obstacles   = useRef<Obstacle[]>(makeObstacles(level));
  const particles   = useRef<Particle[]>([]);
  const floats      = useRef<FloatText[]>([]);
  const raf         = useRef<number>(0);
  const timer       = useRef<ReturnType<typeof setInterval> | null>(null);
  const touch       = useRef<{x:number;y:number;t:number;moved:boolean}|null>(null);
  const holdTimer   = useRef<ReturnType<typeof setTimeout>|null>(null);
  const finishedRef = useRef(false);
  const [screenPhase, setScreenPhase] = useState<'idle'|'running'|'finished'>('idle');

  const tricks = getTricksForLevel(levelIndex).filter(t => player.unlockedTricks.includes(t.id));

  function trickFor(dir: SwipeDirection, hold: boolean) {
    const g = hold ? `hold-${dir}` as const : `swipe-${dir}` as const;
    const cs = tricks.filter(t => t.gesture === g);
    if (!cs.length) return null;
    return cs.reduce((b, t) => t.unlockLevel > b.unlockLevel ? t : b, cs[0]);
  }

  // ── particle helpers ───────────────────────────────────────────────────────
  function emitParticles(cx: number, cy: number, type: Particle['type'], color: string, n: number) {
    for (let i = 0; i < n; i++) {
      particles.current.push({
        x: cx + (Math.random() - 0.5) * 18, y: cy,
        vx: (Math.random() - 0.5) * 7, vy: -1.5 - Math.random() * 4.5,
        life: 28 + Math.random() * 22, maxLife: 50,
        color, r: 2.5 + Math.random() * 2.5, type,
      });
    }
  }

  function emitSparks(cx: number, cy: number) {
    for (let i = 0; i < 4; i++) {
      particles.current.push({
        x: cx + (Math.random()-0.5)*14, y: cy - 2,
        vx: (Math.random()-0.5)*6, vy: -0.5 - Math.random()*3,
        life: 18, maxLife: 18,
        color: Math.random() > 0.5 ? '#FFD700' : '#ff9900',
        r: 2 + Math.random() * 2, type: 'spark',
      });
    }
  }

  function floatText(x: number, y: number, text: string, color: string, size: number) {
    floats.current.push({ x, y, vy: -1.1, text, color, size, life: 70, maxLife: 70 });
  }

  // ── CORE LANDING LOGIC ─────────────────────────────────────────────────────
  const doLand = useCallback((trickId: string, tapProg: number) => {
    const g = gs.current;
    if (g.phase !== 'airborne') return;

    const trick = ALL_TRICKS.find(t => t.id === trickId);
    if (!trick) return;

    const canvas = canvasRef.current;
    const W = canvas?.offsetWidth ?? 375, H = canvas?.offsetHeight ?? 812;
    const GY = H * GROUND_RATIO;
    const cx = W * SKATER_FRAC, cy = GY - g.skaterY;

    // Quality: green zone = clean (0–0.35), yellow = sketchy (0.35–0.65), else bail
    const quality: TrickResult['landingQuality'] =
      tapProg <= 0.35 ? 'perfect'
      : tapProg <= 0.65 ? 'clean'
      : tapProg <= 0.85 ? 'sloppy'
      : 'bail';

    g.tapOpen = false; g.currentTrick = null;

    if (quality === 'bail') {
      // BAIL — reset after animation, count against run
      g.phase = 'bail_anim';
      g.bailFrames = BAIL_FRAMES;
      g.boardRot = 100 + Math.random() * 160;
      g.bails++;
      g.multiplier = 1; g.combo = 0;
      emitParticles(cx, cy, 'dust', '#ff4444', 10);
      floatText(cx, cy - 50, 'BAIL!', '#ff4444', 28);
      floatText(cx, cy - 76, `${g.bails}/${MAX_BAILS} bails`, '#ff8866', 13);

      if (g.bails >= MAX_BAILS) {
        // end run after brief delay
        setTimeout(() => {
          g.running = false; g.phase = 'rolling';
          if (!finishedRef.current) {
            finishedRef.current = true;
            setScreenPhase('finished');
            setTimeout(() => onComplete(g.score, g.trickHistory), 1200);
          }
        }, 900);
      }
      return;
    }

    // Successful land
    const result = calculateTrickScore(trick, quality, {
      score: g.score, combo: g.combo, multiplier: g.multiplier,
      trickHistory: g.trickHistory, isComboActive: g.combo > 0,
      runTimeLeft: g.timeLeft, isRunning: g.running,
      bails: g.bails, currentObstacleIndex: g.grindIdx,
      manualActive: false, grindActive: false, grindProgress: 0,
      playerX: g.worldOffset, phase: 'skating',
      lastTrickId: g.lastTrickId, consecutiveSameTrick: g.consecutiveSame,
    }, player, level.multiplier);

    g.score += result.total;
    g.combo  = quality === 'sloppy' ? Math.max(0, g.combo - 1) : g.combo + 1;
    g.multiplier = getNextMultiplier(g.multiplier, quality, player);
    g.consecutiveSame = g.lastTrickId === trick.id ? g.consecutiveSame + 1 : 0;
    g.lastTrickId = trick.id;
    g.trickHistory.push(result);
    g.phase = 'rolling'; g.boardRot = 0; g.bodyTilt = 0;

    const ql = quality === 'perfect' ? 'CLEAN!' : quality === 'clean' ? 'CLEAN' : 'SKETCHY';
    const qc = quality === 'perfect' ? '#FFD700' : quality === 'clean' ? '#00ff88' : '#ffcc44';
    if (quality === 'perfect') { g.shakeTTL = 8; emitParticles(cx, cy, 'spark', '#FFD700', 18); }
    else emitParticles(cx, cy, 'dust', '#ff8833', 10);

    floatText(cx, cy - 52, trick.name.toUpperCase(), '#ffffff', 24);
    floatText(cx, cy - 78, ql, qc, 16);
    floatText(cx, cy - 98, `+${formatScore(result.total)}`, '#ff6b35', 17);
  }, [player, level]);

  // ── GESTURE HANDLER ────────────────────────────────────────────────────────
  const onGesture = useCallback((dir: SwipeDirection, hold: boolean) => {
    const g = gs.current;
    if (!g.running) return;
    if (g.phase === 'bail_anim') return;   // can't input during bail animation
    if (g.tapOpen) return;                 // already mid-trick

    const trick = trickFor(dir, hold);
    if (!trick) return;

    const canvas = canvasRef.current;
    const W = canvas?.offsetWidth ?? 375, H = canvas?.offsetHeight ?? 812;
    const GY = H * GROUND_RATIO;
    const cx = W * SKATER_FRAC;

    // ── OLLIE / FLIP (air tricks) ─────────────────────────────────────────
    if ((dir === 'up' || dir === 'left' || dir === 'right') && !hold) {
      if (!g.onGround && g.phase === 'airborne') return; // already in air trick
      g.skaterVY = JUMP_VY - player.stats.pop * 0.28;
      g.onGround = false;
      g.phase = 'airborne';
      g.currentTrick = trick.id;
      g.boardRot = 0; g.bodyTilt = 0; g.airFrames = 0;
      g.tapOpen = true;
      g.tapStart = Date.now();
      g.tapProgress = 0;
      return;
    }

    // ── MANUAL ────────────────────────────────────────────────────────────
    if (dir === 'down' && !hold) {
      if (!g.onGround) return;
      g.phase = 'manual';
      g.currentTrick = trick.id;
      g.manualBalance = 0; g.manualFrames = 0;
      floatText(cx, GY - g.skaterY - 55, 'MANUAL', '#ffffff', 22);
      // Auto-end after balance-scaled duration
      const dur = 1100 + player.stats.balance * 180;
      setTimeout(() => {
        if (gs.current.phase !== 'manual') return;
        const bal = Math.abs(gs.current.manualBalance);
        // Score the manual
        const manTrick = ALL_TRICKS.find(t => t.id === trick.id)!;
        const manQuality: TrickResult['landingQuality'] = bal < 0.5 ? 'clean' : bal < 0.75 ? 'sloppy' : 'bail';
        const g2 = gs.current;
        const result = calculateTrickScore(manTrick, manQuality, {
          score: g2.score, combo: g2.combo, multiplier: g2.multiplier,
          trickHistory: g2.trickHistory, isComboActive: g2.combo > 0,
          runTimeLeft: g2.timeLeft, isRunning: g2.running, bails: g2.bails,
          currentObstacleIndex: -1, manualActive: true, grindActive: false,
          grindProgress: 0, playerX: g2.worldOffset, phase: 'skating',
          lastTrickId: g2.lastTrickId, consecutiveSameTrick: g2.consecutiveSame,
        }, player, level.multiplier);
        g2.score += result.total;
        g2.combo++; g2.multiplier = getNextMultiplier(g2.multiplier, result.landingQuality, player);
        g2.trickHistory.push(result);
        g2.phase = 'rolling'; g2.skaterY = 0;
        floatText(cx, GY - 70, 'MANUAL DONE', '#00ff88', 18);
        floatText(cx, GY - 92, `+${formatScore(result.total)}`, '#ff6b35', 15);
      }, dur);
      return;
    }

    // ── GRIND ─────────────────────────────────────────────────────────────
    if (hold) {
      const obs = obstacles.current;
      const skSX = W * SKATER_FRAC;
      const nearIdx = obs.findIndex(o => {
        const sx = o.worldX - g.worldOffset;
        return o.grindable && sx > skSX - 40 && sx < skSX + 100;
      });
      if (nearIdx < 0) return; // no obstacle in range
      const ob = obs[nearIdx];
      g.phase = 'grinding';
      g.currentTrick = trick.id;
      g.grindIdx = nearIdx;
      g.grindFrames = 0;
      g.sparkTimer = 0;
      g.skaterY = ob.h + 4;
      g.skaterVY = 0;
      g.onGround = false;
      floatText(cx, GY - ob.h - 50, trick.name.toUpperCase(), '#FFD700', 20);
    }
  }, [tricks, player, level]);

  // ── TAP HANDLER ────────────────────────────────────────────────────────────
  const onTap = useCallback(() => {
    const g = gs.current;
    if (!g.tapOpen || !g.currentTrick) return;
    doLand(g.currentTrick, g.tapProgress);
  }, [doLand]);

  // ── TOUCH EVENTS ──────────────────────────────────────────────────────────
  const onTouchStart = useCallback((e: React.TouchEvent) => {
    const t = e.touches[0];
    touch.current = { x: t.clientX, y: t.clientY, t: Date.now(), moved: false };
    holdTimer.current = setTimeout(() => {
      if (touch.current && !touch.current.moved) onGesture('up', true);
    }, 260);
  }, [onGesture]);

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    if (!touch.current) return;
    const t = e.touches[0];
    const d = Math.hypot(t.clientX - touch.current.x, t.clientY - touch.current.y);
    if (d > 10) touch.current.moved = true;
  }, []);

  const onTouchEnd = useCallback((e: React.TouchEvent) => {
    if (holdTimer.current) clearTimeout(holdTimer.current);
    if (!touch.current) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - touch.current.x, dy = t.clientY - touch.current.y;
    const dist = Math.hypot(dx, dy);
    touch.current = null;

    if (dist < 18) {
      onTap();
    } else if (dist >= 32) {
      const dir: SwipeDirection = Math.abs(dy) > Math.abs(dx)
        ? (dy < 0 ? 'up' : 'down')
        : (dx > 0 ? 'right' : 'left');
      onGesture(dir, false);
    }
  }, [onTap, onGesture]);

  // ── START RUN ─────────────────────────────────────────────────────────────
  const startRun = useCallback(() => {
    gs.current = makeGS();
    gs.current.running = true;
    obstacles.current = makeObstacles(level);
    particles.current = [];
    floats.current = [];
    finishedRef.current = false;
    setScreenPhase('running');

    timer.current = setInterval(() => {
      const g = gs.current;
      if (!g.running) return;
      if (g.timeLeft <= 1) {
        clearInterval(timer.current!);
        g.running = false;
        if (!finishedRef.current) {
          finishedRef.current = true;
          setScreenPhase('finished');
          setTimeout(() => onComplete(g.score, g.trickHistory), 1200);
        }
      } else { g.timeLeft--; }
    }, 1000);
  }, [level, onComplete]);

  // ── RAF LOOP ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext('2d')!;

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      canvas.width  = canvas.offsetWidth  * dpr;
      canvas.height = canvas.offsetHeight * dpr;
      ctx.scale(dpr, dpr);
    };
    resize();
    window.addEventListener('resize', resize);

    const loop = () => {
      const W = canvas.offsetWidth, H = canvas.offsetHeight;
      const GY = H * GROUND_RATIO;
      const g = gs.current;
      const obs = obstacles.current;

      // ── UPDATE ─────────────────────────────────────────────────────────
      if (g.running) {
        g.frameCount++;
        const spd = BASE_SCROLL + player.stats.speed * 0.07;
        g.worldOffset += spd;
        g.walkFrame++;

        // Gravity / landing
        if (!g.onGround || g.skaterY > 0) {
          g.skaterVY += GRAVITY;
          g.skaterY  -= g.skaterVY;
          if (g.skaterY <= 0 && g.phase !== 'grinding') {
            g.skaterY = 0; g.skaterVY = 0; g.onGround = true;
            // If airborne trick with open tap window, auto-resolve as bail
            if (g.phase === 'airborne' && g.tapOpen && g.currentTrick) {
              doLand(g.currentTrick, 1.0); // guaranteed bail zone
            }
          }
        }

        // Board spin during air tricks
        if (g.phase === 'airborne') {
          g.airFrames++;
          const trick = ALL_TRICKS.find(t => t.id === g.currentTrick);
          if (trick?.category === 'flip') {
            // kickflip = positive spin, heelflip = negative
            const dir = (trick.id === 'heelflip' || trick.id === 'inward-heel') ? -1 : 1;
            g.boardRot += FLIP_RPM * dir;
          } else if (trick?.category === 'ollie') {
            g.bodyTilt += 1.5; // slight lean in ollie
          }
        }

        // Landing window progress
        if (g.tapOpen) {
          g.tapProgress = Math.min((Date.now() - g.tapStart) / TAP_WINDOW_MS, 1);
          if (g.tapProgress >= 1 && g.currentTrick) {
            doLand(g.currentTrick, 1.0); // auto-bail on timeout
          }
        }

        // Bail animation countdown → auto-recover
        if (g.phase === 'bail_anim') {
          g.bailFrames--;
          g.boardRot += 3;
          if (g.bailFrames <= 0 && g.bails < MAX_BAILS) {
            g.phase = 'rolling';
            g.skaterY = 0; g.skaterVY = 0; g.onGround = true;
            g.boardRot = 0; g.bodyTilt = 0;
          }
        }

        // Grind update
        if (g.phase === 'grinding' && g.grindIdx >= 0) {
          const ob = obs[g.grindIdx];
          if (ob) {
            const osx = ob.worldX - g.worldOffset;
            g.skaterY = ob.h + 4;
            g.grindFrames++;

            // Sparks every 3 frames
            g.sparkTimer++;
            if (g.sparkTimer % 3 === 0) {
              emitSparks(W * SKATER_FRAC, GY - g.skaterY);
            }

            // Trickle score while grinding
            if (!ob.scored && g.grindFrames % 8 === 0) {
              const pts = Math.round(GRIND_PTS_TICK * GRIND_MULT * g.multiplier * level.multiplier);
              g.score += pts;
            }

            // Obstacle fully passed → end grind cleanly
            if (osx + ob.w < W * SKATER_FRAC - 10) {
              const grindTrick = ALL_TRICKS.find(t => t.id === g.currentTrick);
              if (grindTrick) {
                const result = calculateTrickScore(grindTrick, 'clean', {
                  score: g.score, combo: g.combo, multiplier: g.multiplier,
                  trickHistory: g.trickHistory, isComboActive: g.combo > 0,
                  runTimeLeft: g.timeLeft, isRunning: g.running, bails: g.bails,
                  currentObstacleIndex: g.grindIdx, manualActive: false,
                  grindActive: true, grindProgress: 1,
                  playerX: g.worldOffset, phase: 'skating',
                  lastTrickId: g.lastTrickId, consecutiveSameTrick: g.consecutiveSame,
                }, player, level.multiplier);
                g.score += result.total;
                g.combo++; g.multiplier = getNextMultiplier(g.multiplier, 'clean', player);
                g.trickHistory.push(result);
                const cx2 = W * SKATER_FRAC;
                floatText(cx2, GY - g.skaterY - 50, 'GRIND!', '#FFD700', 22);
                floatText(cx2, GY - g.skaterY - 74, `+${formatScore(result.total)}`, '#ff6b35', 15);
                g.shakeTTL = 5;
              }
              g.phase = 'rolling';
              g.skaterY = 0; g.skaterVY = 0; g.onGround = true;
              g.grindIdx = -1; g.boardRot = 0;
            }
          }
        }

        // Manual balance drift
        if (g.phase === 'manual') {
          g.manualFrames++;
          g.manualBalance += (Math.random() - 0.50) * 0.035;
          g.manualBalance = Math.max(-1, Math.min(1, g.manualBalance));
        }

        // Screen shake decay
        if (g.shakeTTL > 0) {
          g.shakeX = (Math.random() - 0.5) * 5;
          g.shakeY = (Math.random() - 0.5) * 4;
          g.shakeTTL--;
        } else { g.shakeX = 0; g.shakeY = 0; }
      }

      // Particles + floats
      particles.current = particles.current
        .filter(p => p.life > 0)
        .map(p => ({ ...p, x: p.x+p.vx, y: p.y+p.vy, vy: p.vy+0.14, life: p.life-1 }));
      floats.current = floats.current
        .filter(f => f.life > 0)
        .map(f => ({ ...f, y: f.y+f.vy, life: f.life-1 }));

      // ── DRAW ───────────────────────────────────────────────────────────
      ctx.save();
      ctx.translate(g.shakeX, g.shakeY);

      drawBg(ctx, W, H, level, g.worldOffset);

      // Obstacles
      obs.forEach(ob => {
        const sx = ob.worldX - g.worldOffset;
        if (sx > -ob.w - 30 && sx < W + 30) {
          const isGrinding = g.phase === 'grinding' && obs.indexOf(ob) === g.grindIdx;
          ctx.save();
          ctx.globalAlpha = (ob.worldX + ob.w < g.worldOffset - 30) ? 0.25 : 1;
          drawObstacle(ctx, ob, sx, GY, isGrinding);
          ctx.restore();
        }
      });

      drawGround(ctx, W, H, level, g.worldOffset);

      // Skater
      drawSkater(ctx, W * SKATER_FRAC, GY - g.skaterY, g);

      drawParticles(ctx, particles.current);
      drawHUD(ctx, W, H, g, floats.current, obs);

      ctx.restore();
      raf.current = requestAnimationFrame(loop);
    };

    raf.current = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(raf.current); window.removeEventListener('resize', resize); };
  }, [level, player, doLand]);

  useEffect(() => () => { clearInterval(timer.current!); }, []);

  // ── FINISHED ──────────────────────────────────────────────────────────────
  if (screenPhase === 'finished') {
    const g = gs.current;
    const grade = getLetterGrade(g.score, level.multiplier);
    const gc    = getGradeColor(grade);
    return (
      <div style={{ height:'100dvh', background:'#0a0a0f', display:'flex', flexDirection:'column',
        alignItems:'center', justifyContent:'center', gap:12, padding:24,
        fontFamily:"'Bebas Neue',Impact,sans-serif" }}>
        <div style={{ color:'rgba(255,255,255,0.35)', fontSize:10, letterSpacing:4, fontFamily:'monospace' }}>
          {level.city.toUpperCase()} · {level.spotName.toUpperCase()}
        </div>
        <div style={{ fontSize:100, lineHeight:1, color:gc, filter:`drop-shadow(0 0 36px ${gc}88)` }}>{grade}</div>
        <div style={{ color:'#fff', fontSize:46 }}>{formatScore(g.score)}</div>
        <div style={{ color:'rgba(255,255,255,0.4)', fontSize:12, fontFamily:'monospace', letterSpacing:2 }}>
          {g.trickHistory.length} TRICKS · {g.bails} BAILS · MAX x{Math.max(...g.trickHistory.map(t=>t.multiplier),1).toFixed(1)}
        </div>
        <div style={{ color:'rgba(255,255,255,0.2)', fontSize:10, fontFamily:'monospace', letterSpacing:2, marginTop:8 }}>
          SAVING...
        </div>
      </div>
    );
  }

  // ── MAIN CANVAS RENDER ────────────────────────────────────────────────────
  return (
    <div style={{ position:'relative', width:'100%', height:'100dvh', overflow:'hidden', background:'#111',
      touchAction:'none', userSelect:'none' }}
      onTouchStart={screenPhase==='running' ? onTouchStart : undefined}
      onTouchMove={screenPhase==='running' ? onTouchMove : undefined}
      onTouchEnd={screenPhase==='running' ? onTouchEnd : undefined}
    >
      <canvas ref={canvasRef} style={{ position:'absolute', inset:0, width:'100%', height:'100%' }} />

      {/* Back button */}
      <button onClick={onBack} style={{
        position:'absolute', top:16, left:16, zIndex:20,
        background:'rgba(0,0,0,0.55)', border:'1px solid rgba(255,255,255,0.2)',
        borderRadius:8, color:'#fff', fontSize:18, width:40, height:40,
        cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center',
      }}>←</button>

      {/* City label */}
      {screenPhase === 'running' && (
        <div style={{ position:'absolute', top:16, left:64, zIndex:10,
          fontFamily:"'Bebas Neue',Impact,sans-serif", pointerEvents:'none' }}>
          <div style={{ color:'#fff', fontSize:20, lineHeight:1, textShadow:'0 1px 6px rgba(0,0,0,0.9)' }}>
            {level.city}
          </div>
          <div style={{ color:'rgba(255,255,255,0.45)', fontSize:8, fontFamily:'monospace', letterSpacing:2 }}>
            {level.spotName.toUpperCase()}
          </div>
        </div>
      )}

      {/* START OVERLAY */}
      {screenPhase === 'idle' && (
        <div style={{ position:'absolute', inset:0, background:'rgba(0,0,0,0.80)', zIndex:30,
          display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center',
          gap:14, padding:24, fontFamily:"'Bebas Neue',Impact,sans-serif" }}>

          <div style={{ color:'rgba(255,255,255,0.35)', fontSize:10, letterSpacing:4, fontFamily:'monospace' }}>
            {level.state} · {level.spotName.toUpperCase()}
          </div>
          <div style={{ fontSize:54, color:'#fff', lineHeight:1 }}>{level.city}</div>
          <div style={{ color:'rgba(255,255,255,0.45)', fontSize:11, fontFamily:'monospace',
            textAlign:'center', maxWidth:270, lineHeight:1.6 }}>
            {level.description}
          </div>

          {/* How to play */}
          <div style={{ background:'rgba(255,255,255,0.05)', border:'1px solid rgba(255,255,255,0.1)',
            borderRadius:12, padding:'14px 18px', width:'100%', maxWidth:300,
            display:'grid', gridTemplateColumns:'1fr 1fr', gap:'7px 10px' }}>
            {[
              ['↑ Swipe Up','Ollie'],['← Swipe Left','Kickflip'],
              ['→ Swipe Right','Heelflip'],['↓ Swipe Down','Manual'],
              ['Hold near rail','Grind'],['Tap (GREEN zone)','Clean land'],
            ].map(([g2, n]) => (
              <div key={g2} style={{ display:'flex', gap:5 }}>
                <span style={{ color:'#ff6b35', fontSize:9, fontFamily:'monospace', minWidth:80 }}>{g2}</span>
                <span style={{ color:'rgba(255,255,255,0.4)', fontSize:9, fontFamily:'monospace' }}>{n}</span>
              </div>
            ))}
          </div>

          {/* Bail rules */}
          <div style={{ background:'rgba(255,60,60,0.08)', border:'1px solid rgba(255,60,60,0.2)',
            borderRadius:8, padding:'10px 16px', width:'100%', maxWidth:300 }}>
            <div style={{ color:'#ff8866', fontSize:12, letterSpacing:2, textAlign:'center', marginBottom:4 }}>
              BAIL RULES
            </div>
            <div style={{ color:'rgba(255,255,255,0.5)', fontSize:9, fontFamily:'monospace',
              textAlign:'center', lineHeight:1.7 }}>
              Miss the tap window = BAIL<br/>
              3 bails = RUN OVER<br/>
              Bail breaks your combo<br/>
              You auto get up and keep skating
            </div>
          </div>

          <button onClick={startRun} style={{
            background:'linear-gradient(135deg,#ff6b35,#f7c59f)',
            border:'none', borderRadius:10, color:'#fff',
            fontSize:26, letterSpacing:4, padding:'18px 52px',
            fontFamily:"'Bebas Neue',Impact,sans-serif",
            cursor:'pointer', marginTop:4,
            boxShadow:'0 4px 28px rgba(255,107,53,0.55)',
          }}>
            DROP IN →
          </button>
        </div>
      )}
    </div>
  );
};
