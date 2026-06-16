/**
 * THE GNAR v5 — Three-Lane Endless Runner
 *
 * Controls:
 *   Swipe LEFT / RIGHT  → change lane
 *   Swipe UP            → ollie (jump over barriers / onto rails)
 *   Swipe DOWN          → slide (duck under barriers)
 *
 * Obstacles:
 *   BARRIER  – block in one lane, swipe to dodge
 *   RAIL     – grind lane, swipe UP to mount, auto-grinds, swipe UP again to jump off
 *   LOW_BAR  – bar across lane, swipe DOWN to slide under
 *   GAP      – pit in lane, swipe UP to ollie over
 */
import React, { useEffect, useRef, useCallback, useState } from 'react';
import type { City, Player, TrickResult } from '../game/types';
import { POINTS, comboMultiplier, formatScore } from '../game/scoring';

// ─── CONSTANTS ────────────────────────────────────────────────────────────────
const LANE_W      = 90;       // px per lane
const BASE_SPEED  = 5.5;      // world px / frame
const ACCEL       = 0.0018;   // speed increase per frame
const MAX_SPEED   = 14;
const JUMP_FRAMES = 22;       // frames for a full ollie arc
const SLIDE_FRAMES= 20;
const OBS_MIN_GAP = 260;      // min world-px between obstacles
const OBS_SPAWN_Z = 1400;     // world-z at which obstacles spawn
const SKATER_Z    = 180;      // skater sits at this world-z
const VANISH_Y    = 0.36;     // horizon as fraction of canvas height
const GRIND_PTS_TICK = 6;     // frames between grind score ticks

// Lane center X offsets relative to canvas center: left=0 mid=1 right=2
const LANE_X_OFFSET = [-LANE_W, 0, LANE_W];

// ─── TYPES ────────────────────────────────────────────────────────────────────
type ObsType = 'barrier' | 'rail' | 'low-bar' | 'gap';

interface Obs {
  id: number;
  type: ObsType;
  lane: number;      // 0 1 2
  z: number;         // world z (decreases as it approaches)
  hit: boolean;      // already triggered
  passed: boolean;
}

interface FloatMsg {
  text: string;
  color: string;
  y: number;         // screen y
  life: number;      // frames remaining
  size: number;
}

type Phase = 'idle' | 'countdown' | 'running' | 'dead' | 'finished';

interface GS {
  phase: Phase;
  frame: number;
  speed: number;
  worldZ: number;           // total distance travelled

  // Skater
  lane: number;             // 0 1 2
  targetLane: number;
  laneT: number;            // 0..1 lane-change interpolation
  jumpT: number;            // 0..1 (0=ground, peak at 0.5, land at 1)
  jumpPhase: number;        // frames into jump (0 = not jumping)
  sliding: boolean;
  slideFrames: number;
  grinding: boolean;
  grindTick: number;

  // Score
  score: number;
  combo: number;
  trickHistory: TrickResult[];

  // Feedback
  msgs: FloatMsg[];
  shakeFrames: number;
  sparkX: number; sparkY: number; sparkOn: boolean;

  // Obstacles
  obs: Obs[];
  nextObsId: number;
  nextObsZ: number;

  // Death
  hitObs: Obs | null;
  deadFrames: number;
}

function makeGS(): GS {
  return {
    phase: 'idle', frame: 0, speed: BASE_SPEED, worldZ: 0,
    lane: 1, targetLane: 1, laneT: 1,
    jumpT: 0, jumpPhase: 0,
    sliding: false, slideFrames: 0,
    grinding: false, grindTick: 0,
    score: 0, combo: 0, trickHistory: [],
    msgs: [], shakeFrames: 0, sparkX: 0, sparkY: 0, sparkOn: false,
    obs: [], nextObsId: 0, nextObsZ: OBS_SPAWN_Z,
    hitObs: null, deadFrames: 0,
  };
}

// ─── PROJECTION ───────────────────────────────────────────────────────────────
// Simple pseudo-3D: objects at world-z project to a vanishing point.
// z=SKATER_Z → bottom of screen, z→∞ → vanish point
function project(worldZ: number, laneOffset: number, W: number, H: number): { x: number; y: number; scale: number } {
  const VX = W / 2;
  const VY = H * VANISH_Y;
  const groundY = H * 0.88;

  const t = Math.max(0.001, (worldZ - SKATER_Z) / (OBS_SPAWN_Z - SKATER_Z));
  const y = groundY - (groundY - VY) * t;
  const scale = 1 - t * 0.85;
  const x = VX + laneOffset * scale;
  return { x, y, scale };
}

// ─── DRAW: ROAD ───────────────────────────────────────────────────────────────
function drawRoad(ctx: CanvasRenderingContext2D, W: number, H: number, city: City, worldZ: number) {
  const VX = W / 2;
  const VY = H * VANISH_Y;
  const groundY = H * 0.88;
  const [s1, s2, s3] = city.palette.sky;

  // Sky gradient
  const skyG = ctx.createLinearGradient(0, 0, 0, H);
  skyG.addColorStop(0, s1); skyG.addColorStop(0.55, s2); skyG.addColorStop(1, s3);
  ctx.fillStyle = skyG; ctx.fillRect(0, 0, W, H);

  // Road trapezoid
  ctx.fillStyle = city.id === 'sf' ? '#b8a898' : city.id === 'portland' ? '#2e2e2e' : '#1e1e1e';
  ctx.beginPath();
  ctx.moveTo(0, groundY);
  ctx.lineTo(W, groundY);
  ctx.lineTo(VX + LANE_W * 2, VY);
  ctx.lineTo(VX - LANE_W * 2, VY);
  ctx.closePath(); ctx.fill();

  // Road edge lines
  ctx.strokeStyle = 'rgba(255,255,255,0.18)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(VX - LANE_W * 2, VY); ctx.lineTo(0, groundY); ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(VX + LANE_W * 2, VY); ctx.lineTo(W, groundY); ctx.stroke();

  // Lane dividers (dashed, scrolling)
  ctx.strokeStyle = city.palette.stripe;
  ctx.lineWidth = 2;
  const dashSpacing = 80;
  const dashOffset = worldZ % dashSpacing;
  for (let li = 0; li < 2; li++) {
    const laneX = (li === 0 ? -LANE_W : LANE_W);
    for (let dz = SKATER_Z; dz < OBS_SPAWN_Z; dz += dashSpacing) {
      const dz1 = dz - dashOffset;
      const dz2 = dz1 + dashSpacing * 0.45;
      if (dz1 > OBS_SPAWN_Z || dz2 < SKATER_Z) continue;
      const p1 = project(dz1, laneX, W, H);
      const p2 = project(Math.min(dz2, OBS_SPAWN_Z), laneX, W, H);
      ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.stroke();
    }
  }

  // Pavement surface after road (foreground strip)
  ctx.fillStyle = city.palette.ground;
  ctx.fillRect(0, groundY, W, H - groundY);
}

// ─── DRAW: LANDMARK ───────────────────────────────────────────────────────────
function drawLandmark(ctx: CanvasRenderingContext2D, W: number, H: number, city: City, worldZ: number) {
  const VY = H * VANISH_Y;
  const drift = (worldZ * 0.04) % 60;  // very slow parallax

  ctx.save();
  ctx.globalAlpha = 0.72;

  if (city.landmark === 'space-needle') {
    const cx = W * 0.78 - drift;
    const base = VY + (H * 0.88 - VY) * 0.62;
    ctx.fillStyle = 'rgba(15,30,55,0.92)';
    // Legs
    ctx.beginPath(); ctx.moveTo(cx - 18, base); ctx.lineTo(cx - 4, base - 95); ctx.lineTo(cx + 4, base - 95); ctx.lineTo(cx + 18, base); ctx.closePath(); ctx.fill();
    // Shaft
    ctx.fillRect(cx - 3, base - 140, 6, 50);
    // Saucer
    ctx.beginPath(); ctx.ellipse(cx, base - 140, 22, 8, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(cx, base - 148, 13, 5, 0, 0, Math.PI * 2); ctx.fill();
    // Spire
    ctx.fillRect(cx - 2, base - 195, 4, 50);
    ctx.fillStyle = 'rgba(255,80,60,0.8)';
    ctx.beginPath(); ctx.arc(cx, base - 196, 3, 0, Math.PI * 2); ctx.fill();
    // Mt Rainier
    const mx = W * 0.22 - drift * 0.3;
    ctx.fillStyle = 'rgba(35,55,85,0.55)';
    ctx.beginPath(); ctx.moveTo(mx - 70, base); ctx.lineTo(mx, VY + 8); ctx.lineTo(mx + 70, base); ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(220,235,255,0.6)';
    ctx.beginPath(); ctx.moveTo(mx - 22, VY + 24); ctx.lineTo(mx, VY + 8); ctx.lineTo(mx + 22, VY + 24); ctx.closePath(); ctx.fill();

  } else if (city.landmark === 'golden-gate') {
    const bx = W * 0.5 - drift * 0.5;
    const base = VY + (H * 0.88 - VY) * 0.7;
    ctx.fillStyle = 'rgba(180,55,25,0.82)';
    // Deck
    ctx.fillRect(bx - 85, base, 170, 7);
    // Towers
    ctx.fillRect(bx - 68, base - 90, 10, 90);
    ctx.fillRect(bx + 58, base - 90, 10, 90);
    // Crossbeams
    ctx.fillRect(bx - 70, base - 58, 14, 5);
    ctx.fillRect(bx + 56, base - 58, 14, 5);
    ctx.fillRect(bx - 70, base - 36, 14, 5);
    ctx.fillRect(bx + 56, base - 36, 14, 5);
    // Cables
    ctx.strokeStyle = 'rgba(180,55,25,0.6)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(bx - 63, base - 88); ctx.quadraticCurveTo(bx, base - 38, bx + 63, base - 88); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(bx - 63, base - 80); ctx.quadraticCurveTo(bx, base - 30, bx + 63, base - 80); ctx.stroke();
    // Verticals
    ctx.lineWidth = 1;
    for (let i = -70; i <= 70; i += 14) {
      const py = base - 38 - 0.0036 * i * i;
      ctx.beginPath(); ctx.moveTo(bx + i, py); ctx.lineTo(bx + i, base); ctx.stroke();
    }

  } else if (city.landmark === 'st-johns-bridge') {
    const bx = W * 0.55 - drift * 0.4;
    const base = VY + (H * 0.88 - VY) * 0.65;
    ctx.fillStyle = 'rgba(15,18,38,0.90)';
    // Deck
    ctx.fillRect(bx - 80, base, 160, 8);
    // Gothic towers
    ctx.fillRect(bx - 66, base - 100, 12, 100);
    ctx.fillRect(bx + 54, base - 100, 12, 100);
    // Pointed spires
    const spire = (x: number) => {
      ctx.beginPath(); ctx.moveTo(x - 6, base - 100); ctx.lineTo(x + 6, base - 100);
      ctx.lineTo(x + 3, base - 122); ctx.lineTo(x, base - 130); ctx.lineTo(x - 3, base - 122); ctx.closePath(); ctx.fill();
    };
    spire(bx - 60); spire(bx + 60);
    // Cables
    ctx.strokeStyle = 'rgba(30,35,65,0.7)'; ctx.lineWidth = 1.5;
    for (let i = -70; i <= 70; i += 18) {
      ctx.beginPath(); ctx.moveTo(bx - 60, base - 128); ctx.lineTo(bx + i, base); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(bx + 60, base - 128); ctx.lineTo(bx + i, base); ctx.stroke();
    }
  }

  ctx.restore();
}

// ─── DRAW: OBSTACLE ───────────────────────────────────────────────────────────
function drawObs(ctx: CanvasRenderingContext2D, ob: Obs, W: number, H: number) {
  const p = project(ob.z, LANE_X_OFFSET[ob.lane], W, H);
  const s = p.scale;

  ctx.save();
  ctx.translate(p.x, p.y);

  const lw = LANE_W * s * 0.82;
  const alpha = Math.min(1, (OBS_SPAWN_Z - ob.z) / 300);
  ctx.globalAlpha = ob.hit ? 0.3 : alpha;

  if (ob.type === 'barrier') {
    // Concrete barrier block
    const bw = lw, bh = 44 * s;
    ctx.fillStyle = '#6688aa';
    ctx.fillRect(-bw / 2, -bh, bw, bh);
    ctx.fillStyle = '#88aacc';
    ctx.fillRect(-bw / 2, -bh, bw, bh * 0.22);
    ctx.fillStyle = 'rgba(255,255,255,0.2)';
    ctx.fillRect(-bw / 2 + 3 * s, -bh + 2 * s, bw - 6 * s, 3 * s);
    // Chevron warning
    ctx.strokeStyle = '#ffcc00'; ctx.lineWidth = 2 * s;
    ctx.beginPath(); ctx.moveTo(-lw * 0.3, -bh * 0.5); ctx.lineTo(0, -bh * 0.8); ctx.lineTo(lw * 0.3, -bh * 0.5); ctx.stroke();

  } else if (ob.type === 'rail') {
    // Elevated grind rail
    const rw = lw * 0.88, rh = 8 * s;
    const ry = -36 * s; // above ground
    // Posts
    ctx.fillStyle = '#555';
    ctx.fillRect(-rw * 0.38, ry + rh, 4 * s, 36 * s);
    ctx.fillRect( rw * 0.34, ry + rh, 4 * s, 36 * s);
    // Rail tube
    const rg = ctx.createLinearGradient(0, ry, 0, ry + rh);
    rg.addColorStop(0, '#eee'); rg.addColorStop(0.4, '#bbb'); rg.addColorStop(1, '#888');
    ctx.fillStyle = rg;
    ctx.beginPath(); ctx.roundRect(-rw / 2, ry, rw, rh, 3 * s); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.65)';
    ctx.fillRect(-rw / 2 + 4 * s, ry + 1 * s, rw - 8 * s, 2 * s);
    // Label
    ctx.fillStyle = '#FFD700'; ctx.globalAlpha *= 0.8;
    ctx.font = `bold ${10 * s}px monospace`; ctx.textAlign = 'center';
    ctx.fillText('GRIND', 0, ry - 6 * s);

  } else if (ob.type === 'low-bar') {
    // Bar to duck under
    const bw = lw;
    const barY = -28 * s;
    // Posts
    ctx.fillStyle = '#aa4400';
    ctx.fillRect(-bw / 2, barY, 6 * s, 28 * s);
    ctx.fillRect( bw / 2 - 6 * s, barY, 6 * s, 28 * s);
    // Bar
    ctx.fillStyle = '#ff6600';
    ctx.fillRect(-bw / 2, barY, bw, 8 * s);
    // Hazard stripes
    ctx.fillStyle = '#ffcc00';
    const strW = bw / 5;
    for (let i = 0; i < 5; i += 2) {
      ctx.fillRect(-bw / 2 + i * strW, barY, strW, 8 * s);
    }
    // Slide hint
    ctx.fillStyle = '#fff'; ctx.globalAlpha *= 0.7;
    ctx.font = `bold ${9 * s}px monospace`; ctx.textAlign = 'center';
    ctx.fillText('↓ SLIDE', 0, barY - 7 * s);

  } else if (ob.type === 'gap') {
    // Pit / gap — dark with warning edges
    const gw = lw * 0.9;
    const gh = 20 * s;
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.fillRect(-gw / 2, -gh, gw, gh);
    ctx.fillStyle = '#ff4400';
    ctx.fillRect(-gw / 2, -gh, gw, 3 * s);
    ctx.fillRect(-gw / 2, -3 * s, gw, 3 * s);
    ctx.setLineDash([5, 4]);
    ctx.strokeStyle = '#ffcc00'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(-gw / 2, -gh / 2); ctx.lineTo(gw / 2, -gh / 2); ctx.stroke();
    ctx.setLineDash([]);
  }

  ctx.restore();
}

// ─── DRAW: SKATER ─────────────────────────────────────────────────────────────
function drawSkater(ctx: CanvasRenderingContext2D, W: number, H: number, g: GS) {
  const groundY = H * 0.88;
  const laneX = W / 2 + (g.lane + (g.targetLane - g.lane) * g.laneT) * LANE_W;

  // Jump arc: parabola peaks at midpoint
  const airHeight = g.jumpPhase > 0
    ? Math.sin((g.jumpPhase / JUMP_FRAMES) * Math.PI) * 62
    : 0;
  const slideSquish = g.sliding ? 0.55 : 1;
  const sy = groundY - airHeight;

  ctx.save();
  ctx.translate(laneX, sy);
  if (g.shakeFrames > 0) {
    ctx.translate((Math.random() - 0.5) * 5, (Math.random() - 0.5) * 4);
  }

  const t = g.frame;
  const pushCycle = Math.sin(t * 0.15);

  // Scale for slide
  ctx.scale(1, slideSquish);

  // ── BOARD ──────────────────────────────────────────────────────────────
  const DW = 44, DH = 8;
  const boardRot = g.jumpPhase > 0
    ? Math.sin((g.jumpPhase / JUMP_FRAMES) * Math.PI * 2) * (g.grinding ? 0 : 22)
    : 0;
  ctx.save();
  ctx.rotate((boardRot * Math.PI) / 180);
  const dg = ctx.createLinearGradient(0, -DH / 2, 0, DH / 2);
  dg.addColorStop(0, '#e05535'); dg.addColorStop(0.5, '#c03020'); dg.addColorStop(1, '#801810');
  ctx.fillStyle = dg;
  ctx.beginPath(); ctx.roundRect(-DW / 2, -DH / 2, DW, DH, 4); ctx.fill();
  // Grip
  ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(-DW / 2 + 2, -DH / 2 + 1, DW - 4, 3);
  // Graphic stripe
  ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.fillRect(-9, -DH / 2 + 4, 18, 2);
  // Trucks
  ctx.fillStyle = '#c0c0c0';
  ctx.fillRect(-DW / 2 + 4, DH / 2 - 2, 12, 5);
  ctx.fillRect(DW / 2 - 16, DH / 2 - 2, 12, 5);
  // Wheels (2 visible from side)
  const wR = 5.5;
  [['-', DH / 2 + 3], ['+', DH / 2 + 3]].forEach(([_side], i) => {
    const wx = i === 0 ? -DW / 2 + 10 : DW / 2 - 10;
    ctx.fillStyle = '#e8e8e8'; ctx.beginPath(); ctx.arc(wx, DH / 2 + 3, wR, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#888'; ctx.beginPath(); ctx.arc(wx, DH / 2 + 3, wR * 0.42, 0, Math.PI * 2); ctx.fill();
  });
  ctx.restore();

  const DH2 = 8;
  const isAir = g.jumpPhase > 0;
  const isGrind = g.grinding;

  // ── LEGS ───────────────────────────────────────────────────────────────
  ctx.strokeStyle = '#223'; ctx.lineWidth = 6; ctx.lineCap = 'round';
  if (isAir) {
    // Tucked
    ctx.beginPath(); ctx.moveTo(-6, -DH2 / 2); ctx.lineTo(-8, -DH2 / 2 - 22); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(7, -DH2 / 2); ctx.lineTo(10, -DH2 / 2 - 20); ctx.stroke();
    ctx.fillStyle = '#111'; ctx.beginPath(); ctx.roundRect(-15, -DH2 / 2 - 25, 14, 7, 2); ctx.fill();
    ctx.fillStyle = '#334'; ctx.beginPath(); ctx.roundRect(7, -DH2 / 2 - 23, 13, 7, 2); ctx.fill();
  } else if (isGrind) {
    // Low crouch
    ctx.beginPath(); ctx.moveTo(-6, -DH2 / 2); ctx.lineTo(-9, -DH2 / 2 - 13); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(7, -DH2 / 2); ctx.lineTo(11, -DH2 / 2 - 11); ctx.stroke();
    ctx.fillStyle = '#111'; ctx.beginPath(); ctx.roundRect(-15, -DH2 / 2 - 16, 12, 6, 2); ctx.fill();
    ctx.fillStyle = '#334'; ctx.beginPath(); ctx.roundRect(8, -DH2 / 2 - 14, 12, 6, 2); ctx.fill();
  } else {
    // Push stride
    const stride = pushCycle * 5;
    ctx.strokeStyle = '#334';
    ctx.beginPath(); ctx.moveTo(-6, -DH2 / 2); ctx.lineTo(-8 + stride, -DH2 / 2 - 18); ctx.lineTo(-12 + stride * 0.5, -DH2 / 2 - 8); ctx.stroke();
    ctx.strokeStyle = '#445';
    ctx.beginPath(); ctx.moveTo(7, -DH2 / 2); ctx.lineTo(9 - stride, -DH2 / 2 - 20); ctx.lineTo(13 - stride * 0.5, -DH2 / 2 - 9); ctx.stroke();
    ctx.fillStyle = '#111'; ctx.beginPath(); ctx.roundRect(-17 + stride * 0.5, -DH2 / 2 - 11, 13, 7, 2); ctx.fill();
    ctx.fillStyle = '#334'; ctx.beginPath(); ctx.roundRect(9 - stride * 0.5, -DH2 / 2 - 12, 12, 6, 2); ctx.fill();
  }

  const legTop = -DH2 / 2 - 23;
  const tH = 18, tW = 15;
  const torsoY = isGrind ? legTop - tH + 9 : legTop - tH;

  // ── TORSO ──────────────────────────────────────────────────────────────
  ctx.fillStyle = '#3355aa';
  ctx.beginPath(); ctx.roundRect(-tW / 2, torsoY, tW, tH, 3); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.16)'; ctx.fillRect(-4, torsoY + 4, 8, 4);

  // ── ARMS ───────────────────────────────────────────────────────────────
  const armSw = isGrind ? 14 : pushCycle * 9;
  ctx.lineWidth = 5;
  ctx.strokeStyle = '#2244aa';
  ctx.beginPath(); ctx.moveTo(-tW / 2, torsoY + 5); ctx.lineTo(-tW / 2 - 10, torsoY + 15 + armSw); ctx.stroke();
  ctx.strokeStyle = '#4466cc';
  ctx.beginPath(); ctx.moveTo(tW / 2, torsoY + 5); ctx.lineTo(tW / 2 + 10, torsoY + 13 - armSw); ctx.stroke();

  // ── HEAD + NECK ────────────────────────────────────────────────────────
  ctx.fillStyle = '#e8c090'; ctx.fillRect(-3, torsoY - 5, 6, 7);
  ctx.beginPath(); ctx.arc(1, torsoY - 5, 10, 0, Math.PI * 2); ctx.fill();

  // ── BEANIE ─────────────────────────────────────────────────────────────
  ctx.fillStyle = '#cc1111';
  ctx.beginPath(); ctx.roundRect(-10, torsoY - 14, 20, 6, 2); ctx.fill();
  ctx.fillStyle = '#dd2222';
  ctx.beginPath(); ctx.ellipse(1, torsoY - 14, 10.5, 9, 0, Math.PI, 0); ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.18)'; ctx.lineWidth = 1;
  for (let ri = 0; ri < 3; ri++) {
    ctx.beginPath(); ctx.ellipse(1, torsoY - 13 - ri * 2.2, 10.5 - ri * 0.5, 1.5, 0, 0, Math.PI * 2); ctx.stroke();
  }
  ctx.fillStyle = '#ff4444'; ctx.beginPath(); ctx.arc(1, torsoY - 23, 4, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.45)'; ctx.beginPath(); ctx.arc(-0.5, torsoY - 24.5, 1.8, 0, Math.PI * 2); ctx.fill();

  // ── SHADES ─────────────────────────────────────────────────────────────
  ctx.fillStyle = 'rgba(10,10,10,0.88)';
  ctx.beginPath(); ctx.roundRect(-8, torsoY - 8, 6, 4, 1); ctx.fill();
  ctx.beginPath(); ctx.roundRect(2, torsoY - 8, 6, 4, 1); ctx.fill();
  ctx.strokeStyle = '#333'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(-2, torsoY - 6); ctx.lineTo(2, torsoY - 6); ctx.stroke();

  ctx.restore();
}

// ─── DRAW: SPARKS ─────────────────────────────────────────────────────────────
function drawSparks(ctx: CanvasRenderingContext2D, x: number, y: number, frame: number) {
  for (let i = 0; i < 6; i++) {
    const a = (frame * 0.7 + i * 1.05) % (Math.PI * 2);
    const r = 6 + Math.random() * 8;
    ctx.save();
    ctx.globalAlpha = 0.7 + Math.random() * 0.3;
    ctx.fillStyle = Math.random() > 0.5 ? '#FFD700' : '#ff9900';
    ctx.shadowColor = '#FFD700'; ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.arc(x + Math.cos(a) * r, y + Math.sin(a) * r * 0.4, 2.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

// ─── DRAW: HUD ────────────────────────────────────────────────────────────────
function drawHUD(ctx: CanvasRenderingContext2D, W: number, H: number, g: GS, rival: { name: string; score: number; avatar: string }) {
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.9)'; ctx.shadowBlur = 8;

  // Score
  ctx.textAlign = 'left'; ctx.font = 'bold 34px "Bebas Neue",Impact,sans-serif';
  ctx.fillStyle = '#fff'; ctx.fillText(formatScore(g.score), 16, 46);

  // Distance / speed meter
  ctx.font = '9px monospace'; ctx.fillStyle = 'rgba(255,255,255,0.4)';
  ctx.fillText(`${Math.floor(g.worldZ / 10)}m`, 16, 62);

  // Rival score (top-right)
  const rivalBeating = g.score > rival.score;
  ctx.textAlign = 'right';
  ctx.font = '9px monospace';
  ctx.fillStyle = rivalBeating ? '#00ff88' : 'rgba(255,255,255,0.4)';
  ctx.fillText(rival.avatar + ' ' + rival.name, W - 14, 30);
  ctx.font = 'bold 18px "Bebas Neue",Impact,sans-serif';
  ctx.fillStyle = rivalBeating ? '#00ff88' : '#ff6b35';
  ctx.fillText(formatScore(rival.score), W - 14, 50);
  if (rivalBeating) {
    ctx.font = '8px monospace'; ctx.fillStyle = '#00ff88';
    ctx.fillText('BEATING RIVAL ✓', W - 14, 62);
  }

  // Combo (top center)
  if (g.combo >= 2) {
    const mult = comboMultiplier(g.combo);
    ctx.textAlign = 'center';
    ctx.font = `bold ${mult >= 4 ? 28 : 22}px "Bebas Neue",Impact,sans-serif`;
    ctx.fillStyle = '#FFD700'; ctx.shadowColor = 'rgba(255,200,0,0.8)'; ctx.shadowBlur = 16;
    ctx.fillText(`x${mult.toFixed(1)} COMBO`, W / 2, 48);
    ctx.shadowBlur = 8;
  }

  // Speed strip bottom
  const speedPct = (g.speed - BASE_SPEED) / (MAX_SPEED - BASE_SPEED);
  ctx.shadowBlur = 0;
  ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.fillRect(0, H - 28, W, 28);
  const sGrd = ctx.createLinearGradient(0, 0, W * speedPct, 0);
  sGrd.addColorStop(0, '#ff6b35'); sGrd.addColorStop(1, '#FFD700');
  ctx.fillStyle = sGrd; ctx.fillRect(0, H - 26, W * speedPct, 4);
  ctx.textAlign = 'center'; ctx.font = '9px monospace'; ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.fillText('SPEED', W / 2, H - 10);

  // Float messages
  for (const m of g.msgs) {
    const a = Math.min(1, m.life / 20);
    ctx.save(); ctx.globalAlpha = a; ctx.textAlign = 'center';
    ctx.font = `bold ${m.size}px "Bebas Neue",Impact,sans-serif`;
    ctx.fillStyle = m.color; ctx.shadowColor = 'rgba(0,0,0,0.95)'; ctx.shadowBlur = 10;
    ctx.fillText(m.text, W / 2, m.y);
    ctx.restore();
  }

  // Grind hint
  if (g.grinding) {
    ctx.textAlign = 'center'; ctx.font = 'bold 13px "Bebas Neue",Impact,sans-serif';
    ctx.fillStyle = '#FFD700'; ctx.shadowColor = '#FFD700'; ctx.shadowBlur = 14;
    ctx.fillText('↑ JUMP OFF', W / 2, H * 0.72);
    ctx.shadowBlur = 6;
  }

  ctx.restore();
}

// ─── COMPONENT ────────────────────────────────────────────────────────────────
interface Props {
  city: City;
  player: Player;
  onComplete: (score: number, tricks: TrickResult[]) => void;
  onBack: () => void;
}

export const SkateRun: React.FC<Props> = ({ city, player, onComplete, onBack }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gsRef     = useRef<GS>(makeGS());
  const rafRef    = useRef<number>(0);
  const doneRef   = useRef(false);
  const [scrPhase, setScrPhase] = useState<'idle' | 'countdown' | 'running' | 'dead' | 'finished'>('idle');

  // ── SPAWN OBSTACLES ────────────────────────────────────────────────────────
  function spawnObs(g: GS) {
    if (g.worldZ + OBS_SPAWN_Z < g.nextObsZ) return;
    const types: ObsType[] = ['barrier', 'barrier', 'rail', 'low-bar', 'gap', 'barrier'];
    const type = types[Math.floor(Math.random() * types.length)];
    // Pick lane — avoid same lane as last if possible
    const lane = Math.floor(Math.random() * 3);
    g.obs.push({ id: g.nextObsId++, type, lane, z: OBS_SPAWN_Z, hit: false, passed: false });
    g.nextObsZ = g.worldZ + OBS_SPAWN_Z + OBS_MIN_GAP + Math.random() * 180;
  }

  // ── ADD MESSAGE ────────────────────────────────────────────────────────────
  function msg(g: GS, text: string, color: string, size = 26) {
    const H = canvasRef.current?.offsetHeight ?? 812;
    g.msgs.push({ text, color, y: H * 0.55, life: 55, size });
  }

  // ── SCORE TRICK ────────────────────────────────────────────────────────────
  function addTrickScore(g: GS, name: string, basePts: number) {
    g.combo++;
    const mult = comboMultiplier(g.combo);
    const pts = Math.round(basePts * mult);
    g.score += pts;
    g.trickHistory.push({ name, points: basePts, combo: g.combo, total: pts, timestamp: Date.now() });
    msg(g, `${name.toUpperCase()}`, '#fff', 24);
    const H = canvasRef.current?.offsetHeight ?? 812;
    g.msgs.push({ text: `+${formatScore(pts)}${g.combo >= 2 ? `  x${mult.toFixed(1)}` : ''}`, color: '#ff6b35', y: H * 0.63, life: 50, size: 17 });
  }

  // ── COLLISION DETECTION ────────────────────────────────────────────────────
  function checkCollisions(g: GS) {
    for (const ob of g.obs) {
      if (ob.hit || ob.passed) continue;
      if (ob.z > SKATER_Z + 60 || ob.z < SKATER_Z - 30) continue;
      if (ob.lane !== g.lane) continue;
      // In same lane, close z
      if (ob.type === 'barrier') {
        if (g.jumpPhase <= 2) { // not in air
          ob.hit = true; triggerDeath(g);
        } else {
          ob.passed = true; addTrickScore(g, 'Ollie', POINTS.ollie);
        }
      } else if (ob.type === 'rail') {
        if (!g.grinding && !g.sliding) {
          if (g.jumpPhase > 0) {
            // Mounting rail
            ob.passed = true;
            g.grinding = true; g.grindTick = 0;
            g.jumpPhase = 0;  // land on rail
            addTrickScore(g, 'Nosegrind', POINTS.ollie);
            g.sparkOn = true;
          } else {
            // Hit rail head-on
            ob.hit = true; triggerDeath(g);
          }
        }
      } else if (ob.type === 'low-bar') {
        if (!g.sliding) {
          ob.hit = true; triggerDeath(g);
        } else {
          ob.passed = true; addTrickScore(g, 'Slide', POINTS.slide);
        }
      } else if (ob.type === 'gap') {
        if (g.jumpPhase > 4) {
          ob.passed = true; addTrickScore(g, 'Gap!', POINTS.gap);
          g.shakeFrames = 0; // no shake on gap clear
        } else {
          ob.hit = true; triggerDeath(g);
        }
      }
    }
    // End grind if no more rail ahead
    if (g.grinding) {
      const hasRailAhead = g.obs.some(ob => ob.type === 'rail' && ob.lane === g.lane && !ob.passed && ob.z < SKATER_Z + 150);
      if (!hasRailAhead) {
        g.grinding = false; g.sparkOn = false;
        addTrickScore(g, 'Grind out!', POINTS.ollie);
      }
    }
  }

  function triggerDeath(g: GS) {
    g.phase = 'dead';
    g.deadFrames = 0;
    g.combo = 0;
    g.shakeFrames = 20;
    g.grinding = false; g.sparkOn = false;
    msg(g, 'BAILED!', '#ff4444', 36);
  }

  // ── GESTURE ────────────────────────────────────────────────────────────────
  const onGesture = useCallback((dir: 'up' | 'down' | 'left' | 'right') => {
    const g = gsRef.current;
    if (g.phase !== 'running') return;

    if (dir === 'left') {
      if (g.lane > 0) {
        g.targetLane = g.lane - 1;
        g.laneT = 0;
        g.grinding = false; g.sparkOn = false;
      }
    } else if (dir === 'right') {
      if (g.lane < 2) {
        g.targetLane = g.lane + 1;
        g.laneT = 0;
        g.grinding = false; g.sparkOn = false;
      }
    } else if (dir === 'up') {
      if (g.grinding) {
        // Jump off rail
        g.grinding = false; g.sparkOn = false;
        g.jumpPhase = 1;
        addTrickScore(g, 'Kickflip', POINTS.kickflip);
      } else if (g.jumpPhase === 0 && !g.sliding) {
        g.jumpPhase = 1;
        addTrickScore(g, 'Ollie', POINTS.ollie);
      }
    } else if (dir === 'down') {
      if (!g.sliding && g.jumpPhase === 0 && !g.grinding) {
        g.sliding = true;
        g.slideFrames = SLIDE_FRAMES;
        addTrickScore(g, 'Slide', POINTS.slide);
      }
    }
  }, []);

  // ── TOUCH ──────────────────────────────────────────────────────────────────
  const touchRef = useRef<{ x: number; y: number; t: number } | null>(null);

  const onTS = useCallback((e: React.TouchEvent) => {
    const t = e.touches[0];
    touchRef.current = { x: t.clientX, y: t.clientY, t: Date.now() };
  }, []);

  const onTE = useCallback((e: React.TouchEvent) => {
    if (!touchRef.current) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - touchRef.current.x;
    const dy = t.clientY - touchRef.current.y;
    const dist = Math.hypot(dx, dy);
    touchRef.current = null;
    if (dist < 28) return; // too small
    const dir = Math.abs(dy) > Math.abs(dx)
      ? (dy < 0 ? 'up' : 'down')
      : (dx > 0 ? 'right' : 'left');
    onGesture(dir);
  }, [onGesture]);

  // Keyboard
  useEffect(() => {
    const kd = (e: KeyboardEvent) => {
      const map: Record<string, 'up' | 'down' | 'left' | 'right'> = {
        ArrowUp: 'up', ArrowLeft: 'left', ArrowRight: 'right', ArrowDown: 'down',
        w: 'up', a: 'left', d: 'right', s: 'down',
      };
      if (map[e.key]) { e.preventDefault(); onGesture(map[e.key]); }
    };
    window.addEventListener('keydown', kd);
    return () => window.removeEventListener('keydown', kd);
  }, [onGesture]);

  // ── START ──────────────────────────────────────────────────────────────────
  const startRun = useCallback(() => {
    doneRef.current = false;
    gsRef.current = makeGS();
    gsRef.current.phase = 'running';
    setScrPhase('running');
  }, []);

  // ── RAF LOOP ───────────────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext('2d')!;

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      canvas.width = canvas.offsetWidth * dpr;
      canvas.height = canvas.offsetHeight * dpr;
      ctx.scale(dpr, dpr);
    };
    resize();
    window.addEventListener('resize', resize);

    const loop = () => {
      const W = canvas.offsetWidth, H = canvas.offsetHeight;
      const g = gsRef.current;

      // ── UPDATE ─────────────────────────────────────────────────────
      if (g.phase === 'running') {
        g.frame++;
        // Accelerate
        g.speed = Math.min(MAX_SPEED, g.speed + ACCEL);
        g.worldZ += g.speed;

        // Lane interpolation
        if (g.laneT < 1) {
          g.laneT = Math.min(1, g.laneT + 0.16);
          if (g.laneT >= 1) g.lane = g.targetLane;
        }

        // Jump arc
        if (g.jumpPhase > 0) {
          g.jumpPhase++;
          if (g.jumpPhase > JUMP_FRAMES) g.jumpPhase = 0;
        }

        // Slide countdown
        if (g.sliding) {
          g.slideFrames--;
          if (g.slideFrames <= 0) g.sliding = false;
        }

        // Grind trickle score
        if (g.grinding) {
          g.grindTick++;
          if (g.grindTick % GRIND_PTS_TICK === 0) {
            const pts = Math.round(POINTS.grind * comboMultiplier(g.combo));
            g.score += pts;
          }
        }

        // Spawn + move obstacles
        spawnObs(g);
        for (const ob of g.obs) ob.z -= g.speed;
        g.obs = g.obs.filter(ob => ob.z > SKATER_Z - 80);

        // Collision
        checkCollisions(g);

        // Shake
        if (g.shakeFrames > 0) g.shakeFrames--;

        // Sparks position
        const laneX = W / 2 + (g.lane + (g.targetLane - g.lane) * g.laneT) * LANE_W;
        g.sparkX = laneX; g.sparkY = H * 0.84;

        // Float msgs
        g.msgs = g.msgs.filter(m => m.life > 0).map(m => ({ ...m, y: m.y - 0.9, life: m.life - 1 }));

      } else if (g.phase === 'dead') {
        g.deadFrames++;
        g.msgs = g.msgs.filter(m => m.life > 0).map(m => ({ ...m, y: m.y - 0.9, life: m.life - 1 }));
        if (g.deadFrames > 70) {
          // Respawn — keep score, lose combo, give 3s of immunity
          g.phase = 'running';
          g.jumpPhase = 0; g.sliding = false; g.grinding = false;
          g.shakeFrames = 0; g.sparkOn = false;
          // Clear obs near skater to give breathing room
          g.obs = g.obs.filter(ob => ob.z < SKATER_Z - 60);
        }
        // After 3 deaths total → end run
        if (g.deadFrames === 1) {
          g.trickHistory.push({ name: '__death', points: 0, combo: 0, total: 0, timestamp: Date.now() });
        }
        const deathCount = g.trickHistory.filter(t => t.name === '__death').length;
        if (deathCount >= 3 && g.deadFrames > 40 && !doneRef.current) {
          doneRef.current = true;
          g.phase = 'finished';
          setScrPhase('finished');
          const finalScore = g.score;
          const finalTricks = g.trickHistory.filter(t => t.name !== '__death');
          setTimeout(() => onComplete(finalScore, finalTricks), 1200);
        }
      }

      // ── DRAW ───────────────────────────────────────────────────────
      const shake = g.shakeFrames > 0;
      ctx.save();
      if (shake) ctx.translate((Math.random() - 0.5) * 6, (Math.random() - 0.5) * 5);

      drawRoad(ctx, W, H, city, g.worldZ);
      drawLandmark(ctx, W, H, city, g.worldZ);

      // Obstacles (back to front)
      const sorted = [...g.obs].sort((a, b) => b.z - a.z);
      for (const ob of sorted) drawObs(ctx, ob, W, H);

      // Skater
      drawSkater(ctx, W, H, g);

      // Grind sparks
      if (g.sparkOn && g.grinding) drawSparks(ctx, g.sparkX, g.sparkY, g.frame);

      // Dead overlay
      if (g.phase === 'dead') {
        ctx.fillStyle = `rgba(180,0,0,${Math.min(0.45, g.deadFrames * 0.007)})`;
        ctx.fillRect(0, 0, W, H);
      }

      drawHUD(ctx, W, H, g, city.rival);

      ctx.restore();
      rafRef.current = requestAnimationFrame(loop);
    };

    rafRef.current = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(rafRef.current); window.removeEventListener('resize', resize); };
  }, [city, player]);

  // ── FINISH SCREEN ──────────────────────────────────────────────────────────
  if (scrPhase === 'finished') {
    const g = gsRef.current;
    const won = g.score >= city.rival.score;
    const gc = won ? '#00ff88' : '#ff4444';
    return (
      <div style={{ height: '100dvh', background: '#0a0a0f', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, padding: 24, fontFamily: "'Bebas Neue',Impact,sans-serif" }}>
        <div style={{ color: 'rgba(255,255,255,0.35)', fontSize: 10, letterSpacing: 4, fontFamily: 'monospace' }}>{city.name.toUpperCase()}</div>
        <div style={{ fontSize: 20, color: won ? '#00ff88' : '#ff4444', letterSpacing: 3 }}>
          {won ? `${city.rival.avatar} RIVAL BEATEN!` : `${city.rival.avatar} SO CLOSE`}
        </div>
        <div style={{ fontSize: 80, lineHeight: 1, color: gc, filter: `drop-shadow(0 0 30px ${gc}88)` }}>{formatScore(g.score)}</div>
        <div style={{ color: 'rgba(255,255,255,0.35)', fontSize: 12, fontFamily: 'monospace' }}>
          {won ? city.rival.defeatLine : city.rival.lossLine}
        </div>
        <div style={{ color: 'rgba(255,255,255,0.25)', fontSize: 10, fontFamily: 'monospace', marginTop: 4, letterSpacing: 2 }}>
          {g.trickHistory.filter(t => t.name !== '__death').length} TRICKS · {Math.floor(g.worldZ / 10)}m SKATED
        </div>
        <div style={{ color: 'rgba(255,255,255,0.2)', fontSize: 9, fontFamily: 'monospace', marginTop: 4 }}>SAVING...</div>
      </div>
    );
  }

  // ── MAIN CANVAS VIEW ───────────────────────────────────────────────────────
  return (
    <div style={{ position: 'relative', width: '100%', height: '100dvh', overflow: 'hidden', background: '#111', touchAction: 'none', userSelect: 'none' }}
      onTouchStart={scrPhase === 'running' ? onTS : undefined}
      onTouchEnd={scrPhase === 'running' ? onTE : undefined}
    >
      <canvas ref={canvasRef} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} />

      <button onClick={onBack} style={{
        position: 'absolute', top: 16, left: 16, zIndex: 20,
        background: 'rgba(0,0,0,0.55)', border: '1px solid rgba(255,255,255,0.2)',
        borderRadius: 8, color: '#fff', fontSize: 18, width: 40, height: 40,
        cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>←</button>

      {/* START OVERLAY */}
      {scrPhase === 'idle' && (
        <div style={{
          position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.86)', zIndex: 30,
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          gap: 18, padding: 28, fontFamily: "'Bebas Neue',Impact,sans-serif",
        }}>
          <div style={{ color: 'rgba(255,255,255,0.35)', fontSize: 10, letterSpacing: 4, fontFamily: 'monospace' }}>{city.state} · ENDLESS RUN</div>
          <div style={{ fontSize: 56, color: '#fff', lineHeight: 1 }}>{city.name}</div>
          <div style={{ color: 'rgba(255,255,255,0.45)', fontSize: 11, fontFamily: 'monospace', textAlign: 'center', maxWidth: 280, lineHeight: 1.7 }}>
            {city.tagline}
          </div>

          {/* Rival */}
          <div style={{ background: 'rgba(255,107,53,0.08)', border: '1px solid rgba(255,107,53,0.25)', borderRadius: 12, padding: '14px 18px', width: '100%', maxWidth: 310, display: 'flex', gap: 14, alignItems: 'center' }}>
            <div style={{ fontSize: 36 }}>{city.rival.avatar}</div>
            <div>
              <div style={{ color: '#fff', fontSize: 20, lineHeight: 1 }}>{city.rival.name}</div>
              <div style={{ color: 'rgba(255,255,255,0.35)', fontSize: 9, fontFamily: 'monospace', letterSpacing: 2 }}>"{city.rival.nickname}" · BEAT {formatScore(city.rival.score)}</div>
              <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 10, fontFamily: 'monospace', marginTop: 5, fontStyle: 'italic' }}>"{city.rival.taunt}"</div>
            </div>
          </div>

          {/* Controls */}
          <div style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, padding: '12px 16px', width: '100%', maxWidth: 310, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 14px' }}>
            {[['← → Swipe', 'Change lane'], ['↑ Swipe Up', 'Ollie / Jump'], ['↓ Swipe Down', 'Slide under'], ['↑ on RAIL', 'Mount & Grind']].map(([g2, n]) => (
              <React.Fragment key={g2}>
                <span style={{ color: '#ff6b35', fontSize: 10, fontFamily: 'monospace' }}>{g2}</span>
                <span style={{ color: 'rgba(255,255,255,0.45)', fontSize: 10, fontFamily: 'monospace' }}>{n}</span>
              </React.Fragment>
            ))}
          </div>

          <button onClick={startRun} style={{
            background: 'linear-gradient(135deg,#ff6b35,#f7c59f)', border: 'none', borderRadius: 10,
            color: '#fff', fontSize: 28, letterSpacing: 4, padding: '18px 52px',
            fontFamily: "'Bebas Neue',Impact,sans-serif", cursor: 'pointer',
            boxShadow: '0 4px 28px rgba(255,107,53,0.55)',
          }}>
            DROP IN →
          </button>
        </div>
      )}
    </div>
  );
};
