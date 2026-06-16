/**
 * THE GNAR – SkateRun
 * Three-lane endless runner. No redesigns. Focused fix pass.
 *
 * Controls:
 *   Swipe LEFT / RIGHT → change lane
 *   Swipe UP           → ollie (clears barriers, mounts rails)
 *   Swipe DOWN         → slide (clears low-bars)
 *   Swipe UP (grinding)→ jump off rail
 */
import React, { useEffect, useRef, useCallback, useState } from 'react';
import type { City, Player, TrickResult } from '../game/types';
import { POINTS, comboMultiplier, formatScore } from '../game/scoring';

// ─── CONSTANTS ────────────────────────────────────────────────────────────────
const LANE_W         = 90;
const BASE_SPEED     = 5.5;
const ACCEL          = 0.0015;
const MAX_SPEED      = 13;
const JUMP_FRAMES    = 24;    // frames for full ollie arc
const SLIDE_FRAMES   = 22;
const OBS_SPAWN_Z    = 1400;  // z-distance at which obs are created
const SKATER_Z       = 180;   // skater's fixed z-position
const VANISH_Y       = 0.36;  // horizon fraction of H
const OBS_HIT_Z_LO  = SKATER_Z - 20;   // collision window
const OBS_HIT_Z_HI  = SKATER_Z + 55;
const MAX_DEATHS     = 3;
const DEATH_RECOVER_FRAMES = 72;  // frames before respawn
const GRIND_END_Z   = SKATER_Z - 35;  // rail has passed when z < this
const GRIND_PTS_INTERVAL = 8; // frames between grind score ticks

const LANE_X_OFFSET = [-LANE_W, 0, LANE_W];  // screen X offset per lane

// ─── TYPES ────────────────────────────────────────────────────────────────────
type ObsType = 'barrier' | 'rail' | 'low-bar' | 'gap';

interface Obs {
  id: number;
  type: ObsType;
  lane: number;
  z: number;
  passed: boolean;   // scored/resolved — don't process again
  hit: boolean;      // caused a death — fade it out
}

interface Msg {
  text: string;
  color: string;
  y: number;
  size: number;
  life: number;       // counts down to 0
}

// Everything mutable lives in GS, updated in the RAF — no React state in hot path
interface GS {
  running: boolean;
  frame: number;
  speed: number;
  worldZ: number;
  deathCount: number;
  deadFrames: number;   // counts up while dead; 0 = alive

  // Skater position
  lane: number;
  targetLane: number;
  laneT: number;        // 0→1 lane-change lerp

  // Skater actions
  jumpFrame: number;    // 0 = not jumping; 1..JUMP_FRAMES = in arc
  sliding: boolean;
  slideFrames: number;
  grinding: boolean;
  grindObsId: number;   // id of the rail being ground (-1 if not grinding)
  grindTick: number;

  // Score
  score: number;
  combo: number;
  tricks: TrickResult[];

  // Obstacles
  obs: Obs[];
  nextObsId: number;
  nextSpawnZ: number;   // worldZ at which to spawn next obstacle

  // Visual feedback
  msgs: Msg[];
  shakeFrames: number;
  sparkOn: boolean;
}

function makeGS(): GS {
  return {
    running: false,
    frame: 0, speed: BASE_SPEED, worldZ: 0,
    deathCount: 0, deadFrames: 0,
    lane: 1, targetLane: 1, laneT: 1,
    jumpFrame: 0,
    sliding: false, slideFrames: 0,
    grinding: false, grindObsId: -1, grindTick: 0,
    score: 0, combo: 0, tricks: [],
    obs: [], nextObsId: 0, nextSpawnZ: 0,
    msgs: [], shakeFrames: 0, sparkOn: false,
  };
}

// ─── PROJECTION ───────────────────────────────────────────────────────────────
function project(z: number, laneOffset: number, W: number, H: number) {
  const VX = W / 2, VY = H * VANISH_Y, groundY = H * 0.88;
  const t = Math.max(0.001, (z - SKATER_Z) / (OBS_SPAWN_Z - SKATER_Z));
  return {
    x: VX + laneOffset * (1 - t * 0.85),
    y: groundY - (groundY - VY) * t,
    scale: 1 - t * 0.85,
  };
}

// ─── DRAW: ROAD ───────────────────────────────────────────────────────────────
function drawRoad(ctx: CanvasRenderingContext2D, W: number, H: number, city: City, worldZ: number) {
  const VX = W / 2, VY = H * VANISH_Y, groundY = H * 0.88;
  const [s1, s2, s3] = city.palette.sky;
  const skyG = ctx.createLinearGradient(0, 0, 0, H);
  skyG.addColorStop(0, s1); skyG.addColorStop(0.55, s2); skyG.addColorStop(1, s3);
  ctx.fillStyle = skyG; ctx.fillRect(0, 0, W, H);

  // Road trapezoid
  ctx.fillStyle = city.id === 'sf' ? '#b8a898' : city.id === 'portland' ? '#2e2e2e' : '#1e1e1e';
  ctx.beginPath();
  ctx.moveTo(0, groundY); ctx.lineTo(W, groundY);
  ctx.lineTo(VX + LANE_W * 2, VY); ctx.lineTo(VX - LANE_W * 2, VY);
  ctx.closePath(); ctx.fill();

  // Road edges
  ctx.strokeStyle = 'rgba(255,255,255,0.18)'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(VX - LANE_W * 2, VY); ctx.lineTo(0, groundY); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(VX + LANE_W * 2, VY); ctx.lineTo(W, groundY); ctx.stroke();

  // Scrolling lane dividers
  ctx.strokeStyle = city.palette.stripe; ctx.lineWidth = 2;
  const dSp = 80, dOff = worldZ % dSp;
  for (let li = 0; li < 2; li++) {
    const lx = li === 0 ? -LANE_W : LANE_W;
    for (let dz = SKATER_Z; dz < OBS_SPAWN_Z; dz += dSp) {
      const z1 = dz - dOff, z2 = z1 + dSp * 0.45;
      if (z1 > OBS_SPAWN_Z || z2 < SKATER_Z) continue;
      const p1 = project(z1, lx, W, H);
      const p2 = project(Math.min(z2, OBS_SPAWN_Z), lx, W, H);
      ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.stroke();
    }
  }

  // Foreground pavement strip
  ctx.fillStyle = city.palette.ground; ctx.fillRect(0, groundY, W, H - groundY);
}

// ─── DRAW: LANDMARK (Seattle only for now) ────────────────────────────────────
function drawLandmark(ctx: CanvasRenderingContext2D, W: number, H: number, city: City, worldZ: number) {
  const VY = H * VANISH_Y;
  const drift = (worldZ * 0.035) % 50;
  ctx.save(); ctx.globalAlpha = 0.7;

  if (city.landmark === 'space-needle') {
    const cx = W * 0.80 - drift;
    const base = VY + (H * 0.88 - VY) * 0.60;
    ctx.fillStyle = 'rgba(15,30,55,0.92)';
    // Legs
    ctx.beginPath();
    ctx.moveTo(cx - 20, base); ctx.lineTo(cx - 4, base - 92);
    ctx.lineTo(cx + 4, base - 92); ctx.lineTo(cx + 20, base);
    ctx.closePath(); ctx.fill();
    // Shaft
    ctx.fillRect(cx - 3, base - 138, 6, 50);
    // Saucer (two ellipses)
    ctx.beginPath(); ctx.ellipse(cx, base - 138, 24, 9, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(cx, base - 147, 14, 5, 0, 0, Math.PI * 2); ctx.fill();
    // Spire
    ctx.fillRect(cx - 2, base - 195, 4, 52);
    // Red blink dot
    ctx.fillStyle = 'rgba(255,70,50,0.85)';
    ctx.beginPath(); ctx.arc(cx, base - 196, 3.5, 0, Math.PI * 2); ctx.fill();
    // Mt Rainier
    const mx = W * 0.20 - drift * 0.25;
    ctx.fillStyle = 'rgba(35,55,88,0.5)';
    ctx.beginPath();
    ctx.moveTo(mx - 75, base); ctx.lineTo(mx, VY + 5); ctx.lineTo(mx + 75, base);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(215,230,255,0.62)';
    ctx.beginPath();
    ctx.moveTo(mx - 24, VY + 22); ctx.lineTo(mx, VY + 5); ctx.lineTo(mx + 24, VY + 22);
    ctx.closePath(); ctx.fill();

  } else if (city.landmark === 'golden-gate') {
    const bx = W * 0.5 - drift * 0.5;
    const base = VY + (H * 0.88 - VY) * 0.68;
    ctx.fillStyle = 'rgba(180,55,25,0.82)';
    ctx.fillRect(bx - 85, base, 170, 7);
    ctx.fillRect(bx - 68, base - 90, 10, 90); ctx.fillRect(bx + 58, base - 90, 10, 90);
    ctx.fillRect(bx - 70, base - 58, 14, 5); ctx.fillRect(bx + 56, base - 58, 14, 5);
    ctx.fillRect(bx - 70, base - 36, 14, 5); ctx.fillRect(bx + 56, base - 36, 14, 5);
    ctx.strokeStyle = 'rgba(180,55,25,0.6)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(bx - 63, base - 88); ctx.quadraticCurveTo(bx, base - 38, bx + 63, base - 88); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(bx - 63, base - 80); ctx.quadraticCurveTo(bx, base - 30, bx + 63, base - 80); ctx.stroke();
    ctx.lineWidth = 1;
    for (let i = -70; i <= 70; i += 14) {
      const py = base - 38 - 0.0036 * i * i;
      ctx.beginPath(); ctx.moveTo(bx + i, py); ctx.lineTo(bx + i, base); ctx.stroke();
    }

  } else if (city.landmark === 'st-johns-bridge') {
    const bx = W * 0.55 - drift * 0.4;
    const base = VY + (H * 0.88 - VY) * 0.65;
    ctx.fillStyle = 'rgba(15,18,38,0.90)';
    ctx.fillRect(bx - 80, base, 160, 8);
    ctx.fillRect(bx - 66, base - 100, 12, 100); ctx.fillRect(bx + 54, base - 100, 12, 100);
    const spire = (x: number) => {
      ctx.beginPath();
      ctx.moveTo(x - 6, base - 100); ctx.lineTo(x + 6, base - 100);
      ctx.lineTo(x + 3, base - 122); ctx.lineTo(x, base - 130); ctx.lineTo(x - 3, base - 122);
      ctx.closePath(); ctx.fill();
    };
    spire(bx - 60); spire(bx + 60);
    ctx.strokeStyle = 'rgba(30,35,65,0.7)'; ctx.lineWidth = 1.5;
    for (let i = -70; i <= 70; i += 18) {
      ctx.beginPath(); ctx.moveTo(bx - 60, base - 128); ctx.lineTo(bx + i, base); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(bx + 60, base - 128); ctx.lineTo(bx + i, base); ctx.stroke();
    }
  }

  ctx.restore();
}

// ─── DRAW: OBSTACLES ──────────────────────────────────────────────────────────
function drawObs(ctx: CanvasRenderingContext2D, ob: Obs, W: number, H: number) {
  const p = project(ob.z, LANE_X_OFFSET[ob.lane], W, H);
  const s = p.scale;
  const fadeIn = Math.min(1, (OBS_SPAWN_Z - ob.z) / 300);
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.globalAlpha = ob.hit ? 0.25 : fadeIn;
  const lw = LANE_W * s * 0.84;

  switch (ob.type) {
    case 'barrier': {
      const bh = 46 * s;
      ctx.fillStyle = '#557799';
      ctx.fillRect(-lw / 2, -bh, lw, bh);
      ctx.fillStyle = '#7799bb';
      ctx.fillRect(-lw / 2, -bh, lw, bh * 0.2);
      ctx.fillStyle = 'rgba(255,255,255,0.18)';
      ctx.fillRect(-lw / 2 + 3 * s, -bh + 2 * s, lw - 6 * s, 3 * s);
      // Warning chevron
      ctx.strokeStyle = '#ffcc00'; ctx.lineWidth = 2.5 * s;
      ctx.beginPath();
      ctx.moveTo(-lw * 0.28, -bh * 0.52); ctx.lineTo(0, -bh * 0.82); ctx.lineTo(lw * 0.28, -bh * 0.52);
      ctx.stroke();
      // Hint text
      ctx.fillStyle = '#fff'; ctx.globalAlpha *= 0.6;
      ctx.font = `bold ${9 * s}px monospace`; ctx.textAlign = 'center';
      ctx.fillText('↑ OLLIE', 0, -bh - 6 * s);
      break;
    }
    case 'rail': {
      const rh = 7 * s, ry = -34 * s;
      // Posts
      ctx.fillStyle = '#555';
      ctx.fillRect(-lw * 0.36, ry + rh, 4 * s, 34 * s);
      ctx.fillRect(lw * 0.32, ry + rh, 4 * s, 34 * s);
      // Rail tube with gradient
      const rg = ctx.createLinearGradient(0, ry, 0, ry + rh);
      rg.addColorStop(0, '#eee'); rg.addColorStop(0.4, '#bbb'); rg.addColorStop(1, '#888');
      ctx.fillStyle = rg;
      ctx.beginPath(); ctx.roundRect(-lw / 2, ry, lw, rh, 3 * s); ctx.fill();
      // Shine
      ctx.fillStyle = 'rgba(255,255,255,0.65)';
      ctx.fillRect(-lw / 2 + 5 * s, ry + 1 * s, lw - 10 * s, 2 * s);
      // Label
      ctx.fillStyle = '#FFD700'; ctx.globalAlpha *= 0.85;
      ctx.font = `bold ${9 * s}px monospace`; ctx.textAlign = 'center';
      ctx.fillText('↑ GRIND', 0, ry - 7 * s);
      break;
    }
    case 'low-bar': {
      const barY = -30 * s;
      ctx.fillStyle = '#993300';
      ctx.fillRect(-lw / 2, barY, 5 * s, 30 * s);
      ctx.fillRect(lw / 2 - 5 * s, barY, 5 * s, 30 * s);
      ctx.fillStyle = '#ff6600';
      ctx.fillRect(-lw / 2, barY, lw, 8 * s);
      // Hazard stripes
      ctx.fillStyle = '#ffcc00';
      const sw = lw / 5;
      for (let i = 0; i < 5; i += 2) ctx.fillRect(-lw / 2 + i * sw, barY, sw, 8 * s);
      ctx.fillStyle = '#fff'; ctx.globalAlpha *= 0.65;
      ctx.font = `bold ${9 * s}px monospace`; ctx.textAlign = 'center';
      ctx.fillText('↓ SLIDE', 0, barY - 7 * s);
      break;
    }
    case 'gap': {
      const gw = lw * 0.9, gh = 22 * s;
      ctx.fillStyle = 'rgba(0,0,0,0.75)';
      ctx.fillRect(-gw / 2, -gh, gw, gh);
      ctx.fillStyle = '#ff4400';
      ctx.fillRect(-gw / 2, -gh, gw, 3 * s);
      ctx.fillRect(-gw / 2, -3 * s, gw, 3 * s);
      ctx.setLineDash([5, 4]);
      ctx.strokeStyle = '#ffcc00'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(-gw / 2, -gh / 2); ctx.lineTo(gw / 2, -gh / 2); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = '#fff'; ctx.globalAlpha *= 0.6;
      ctx.font = `bold ${9 * s}px monospace`; ctx.textAlign = 'center';
      ctx.fillText('↑ OLLIE', 0, -gh - 6 * s);
      break;
    }
  }
  ctx.restore();
}

// ─── DRAW: SKATER ─────────────────────────────────────────────────────────────
function drawSkater(ctx: CanvasRenderingContext2D, W: number, H: number, g: GS) {
  const groundY = H * 0.88;
  // Current X — interpolate between lanes
  const lerpLane = g.lane + (g.targetLane - g.lane) * g.laneT;
  const sx = W / 2 + lerpLane * LANE_W;

  // Vertical position: jump arc is a sine curve
  const airH = g.jumpFrame > 0
    ? Math.sin((g.jumpFrame / JUMP_FRAMES) * Math.PI) * 58
    : 0;
  const sy = groundY - airH;

  const isAir   = g.jumpFrame > 0;
  const isGrind = g.grinding;
  const isSlide = g.sliding;
  const t       = g.frame;
  const push    = Math.sin(t * 0.14);

  ctx.save();
  ctx.translate(sx, sy);
  if (g.shakeFrames > 0) ctx.translate((Math.random() - 0.5) * 5, (Math.random() - 0.5) * 4);

  // Squish vertically when sliding
  ctx.scale(1, isSlide ? 0.52 : 1);

  // ── BOARD ──────────────────────────────────────────────────────────────────
  const DW = 44, DH = 8;
  // Board flips during ollie, stays flat during grind
  const boardRot = isAir && !isGrind
    ? Math.sin((g.jumpFrame / JUMP_FRAMES) * Math.PI * 2) * 20
    : 0;

  ctx.save();
  ctx.rotate((boardRot * Math.PI) / 180);
  const dg = ctx.createLinearGradient(0, -DH / 2, 0, DH / 2);
  dg.addColorStop(0, '#e05535'); dg.addColorStop(0.5, '#c03020'); dg.addColorStop(1, '#801810');
  ctx.fillStyle = dg;
  ctx.beginPath(); ctx.roundRect(-DW / 2, -DH / 2, DW, DH, 4); ctx.fill();
  ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(-DW / 2 + 2, -DH / 2 + 1, DW - 4, 3);
  ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.fillRect(-9, -DH / 2 + 4, 18, 2);
  // Trucks
  ctx.fillStyle = '#c0c0c0';
  ctx.fillRect(-DW / 2 + 4, DH / 2 - 2, 12, 5);
  ctx.fillRect(DW / 2 - 16, DH / 2 - 2, 12, 5);
  // Wheels
  const wR = 5.5;
  for (const wx of [-DW / 2 + 10, DW / 2 - 10]) {
    ctx.fillStyle = '#e8e8e8'; ctx.beginPath(); ctx.arc(wx, DH / 2 + 3, wR, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#777';    ctx.beginPath(); ctx.arc(wx, DH / 2 + 3, wR * 0.4, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();

  // ── LEGS ───────────────────────────────────────────────────────────────────
  const B = DH / 2; // board top Y
  ctx.lineCap = 'round'; ctx.lineWidth = 6;

  if (isAir) {
    // Knees tucked
    ctx.strokeStyle = '#2a3a2a';
    ctx.beginPath(); ctx.moveTo(-6, -B); ctx.lineTo(-7, -B - 20); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(6,  -B); ctx.lineTo(9,  -B - 18); ctx.stroke();
    ctx.fillStyle = '#1a1a1a';
    ctx.beginPath(); ctx.roundRect(-15, -B - 23, 13, 7, 2); ctx.fill();
    ctx.fillStyle = '#2a2a3a';
    ctx.beginPath(); ctx.roundRect(6, -B - 21, 12, 7, 2); ctx.fill();
  } else if (isGrind) {
    // Low crouch over the rail
    ctx.strokeStyle = '#2a3a2a';
    ctx.beginPath(); ctx.moveTo(-6, -B); ctx.lineTo(-9, -B - 12); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(6,  -B); ctx.lineTo(10, -B - 10); ctx.stroke();
    ctx.fillStyle = '#1a1a1a';
    ctx.beginPath(); ctx.roundRect(-14, -B - 14, 11, 6, 2); ctx.fill();
    ctx.fillStyle = '#2a2a3a';
    ctx.beginPath(); ctx.roundRect(7, -B - 12, 11, 6, 2); ctx.fill();
  } else {
    // Rolling push stride
    const stride = push * 5;
    ctx.strokeStyle = '#2a3a2a';
    ctx.beginPath(); ctx.moveTo(-6, -B); ctx.lineTo(-8 + stride, -B - 18); ctx.lineTo(-12 + stride * 0.5, -B - 8); ctx.stroke();
    ctx.strokeStyle = '#3a4a3a';
    ctx.beginPath(); ctx.moveTo(6, -B); ctx.lineTo(9 - stride, -B - 20); ctx.lineTo(13 - stride * 0.5, -B - 9); ctx.stroke();
    ctx.fillStyle = '#1a1a1a';
    ctx.beginPath(); ctx.roundRect(-17 + stride * 0.5, -B - 11, 13, 7, 2); ctx.fill();
    ctx.fillStyle = '#2a2a3a';
    ctx.beginPath(); ctx.roundRect(9 - stride * 0.5, -B - 12, 12, 7, 2); ctx.fill();
  }

  // Body top
  const legTopY = -B - 23;
  const torsoY  = isGrind ? legTopY - 15 + 9 : legTopY - 15;
  const torsoH  = 18, torsoW = 16;

  // ── HOODIE (torso) ────────────────────────────────────────────────────────
  // Main body
  ctx.fillStyle = '#334466';
  ctx.beginPath(); ctx.roundRect(-torsoW / 2, torsoY, torsoW, torsoH, 4); ctx.fill();
  // Hood outline at top
  ctx.fillStyle = '#445577';
  ctx.beginPath(); ctx.roundRect(-torsoW / 2, torsoY, torsoW, 6, [4, 4, 0, 0]); ctx.fill();
  // Pocket / kangaroo pouch
  ctx.fillStyle = 'rgba(0,0,0,0.2)';
  ctx.beginPath(); ctx.roundRect(-5, torsoY + 10, 10, 6, 2); ctx.fill();
  // Hoodie string
  ctx.strokeStyle = 'rgba(255,255,255,0.2)'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(-2, torsoY + 5); ctx.lineTo(-3, torsoY + 10); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(2, torsoY + 5); ctx.lineTo(3, torsoY + 10); ctx.stroke();

  // ── ARMS ──────────────────────────────────────────────────────────────────
  const armSw = isGrind ? 14 : push * 9;
  ctx.lineWidth = 5; ctx.lineCap = 'round';
  ctx.strokeStyle = '#334466';
  ctx.beginPath(); ctx.moveTo(-torsoW / 2, torsoY + 5); ctx.lineTo(-torsoW / 2 - 10, torsoY + 15 + armSw); ctx.stroke();
  ctx.strokeStyle = '#445577';
  ctx.beginPath(); ctx.moveTo(torsoW / 2, torsoY + 5); ctx.lineTo(torsoW / 2 + 10, torsoY + 13 - armSw); ctx.stroke();

  // ── NECK ─────────────────────────────────────────────────────────────────
  ctx.fillStyle = '#e0b888'; ctx.fillRect(-3, torsoY - 6, 6, 8);

  // ── HEAD ─────────────────────────────────────────────────────────────────
  ctx.fillStyle = '#e8c090';
  ctx.beginPath(); ctx.arc(1, torsoY - 6, 10, 0, Math.PI * 2); ctx.fill();

  // ── BEANIE ───────────────────────────────────────────────────────────────
  // Band (ribbed bottom)
  ctx.fillStyle = '#bb1111';
  ctx.beginPath(); ctx.roundRect(-11, torsoY - 15, 22, 6, 2); ctx.fill();
  // Main dome
  ctx.fillStyle = '#cc2222';
  ctx.beginPath(); ctx.ellipse(1, torsoY - 15, 11, 10, 0, Math.PI, 0); ctx.fill();
  // Rib lines
  ctx.strokeStyle = 'rgba(0,0,0,0.2)'; ctx.lineWidth = 1;
  for (let ri = 0; ri < 3; ri++) {
    ctx.beginPath(); ctx.ellipse(1, torsoY - 14 - ri * 2.2, 11 - ri * 0.6, 1.6, 0, 0, Math.PI * 2); ctx.stroke();
  }
  // Pom pom
  ctx.fillStyle = '#ff3333';
  ctx.beginPath(); ctx.arc(1, torsoY - 25, 4.5, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.beginPath(); ctx.arc(-0.5, torsoY - 26.5, 2, 0, Math.PI * 2); ctx.fill();

  // ── SUNGLASSES ────────────────────────────────────────────────────────────
  ctx.fillStyle = 'rgba(5,5,5,0.9)';
  ctx.beginPath(); ctx.roundRect(-9, torsoY - 10, 7, 5, 1); ctx.fill();
  ctx.beginPath(); ctx.roundRect(2, torsoY - 10, 7, 5, 1); ctx.fill();
  ctx.strokeStyle = '#444'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(-2, torsoY - 8); ctx.lineTo(2, torsoY - 8); ctx.stroke();

  ctx.restore();
}

// ─── DRAW: GRIND SPARKS ───────────────────────────────────────────────────────
function drawSparks(ctx: CanvasRenderingContext2D, W: number, H: number, g: GS) {
  const groundY = H * 0.88;
  const lerpLane = g.lane + (g.targetLane - g.lane) * g.laneT;
  const sx = W / 2 + lerpLane * LANE_W;
  const sy = groundY - 4;
  for (let i = 0; i < 7; i++) {
    const angle = (g.frame * 0.8 + i * 0.9) % (Math.PI * 2);
    const r = 5 + Math.random() * 9;
    ctx.save();
    ctx.globalAlpha = 0.6 + Math.random() * 0.4;
    ctx.fillStyle = Math.random() > 0.5 ? '#FFD700' : '#ff9900';
    ctx.shadowColor = '#FFD700'; ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.arc(sx + Math.cos(angle) * r, sy + Math.sin(angle) * r * 0.35, 2.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

// ─── DRAW: HUD ────────────────────────────────────────────────────────────────
function drawHUD(ctx: CanvasRenderingContext2D, W: number, H: number, g: GS, city: City) {
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.9)'; ctx.shadowBlur = 8;

  // Score top-left
  ctx.textAlign = 'left'; ctx.font = 'bold 36px "Bebas Neue",Impact,sans-serif';
  ctx.fillStyle = '#fff'; ctx.fillText(formatScore(g.score), 16, 48);

  // Distance
  ctx.font = '9px monospace'; ctx.fillStyle = 'rgba(255,255,255,0.4)';
  ctx.fillText(`${Math.floor(g.worldZ / 10)}m`, 16, 64);

  // Bail dots (top-left under score)
  for (let i = 0; i < MAX_DEATHS; i++) {
    ctx.fillStyle = i < g.deathCount ? '#ff4444' : 'rgba(255,255,255,0.18)';
    ctx.beginPath(); ctx.arc(16 + i * 18, 78, 6, 0, Math.PI * 2); ctx.fill();
  }
  ctx.font = '8px monospace'; ctx.fillStyle = 'rgba(255,255,255,0.3)';
  ctx.fillText('BAILS', 16 + MAX_DEATHS * 18 + 6, 82);

  // Rival — top right
  const { rival } = city;
  const beating = g.score >= rival.score;
  ctx.textAlign = 'right';
  ctx.font = '9px monospace';
  ctx.fillStyle = beating ? '#00ff88' : 'rgba(255,255,255,0.35)';
  ctx.fillText(`${rival.avatar} ${rival.name}`, W - 14, 30);
  ctx.font = 'bold 20px "Bebas Neue",Impact,sans-serif';
  ctx.fillStyle = beating ? '#00ff88' : '#ff6b35';
  ctx.fillText(formatScore(rival.score), W - 14, 52);
  if (beating) {
    ctx.font = '8px monospace'; ctx.fillStyle = '#00ff88';
    ctx.fillText('BEATING RIVAL ✓', W - 14, 64);
  }

  // Combo — top centre
  if (g.combo >= 2) {
    const mult = comboMultiplier(g.combo);
    ctx.textAlign = 'center';
    ctx.shadowColor = 'rgba(255,200,0,0.8)'; ctx.shadowBlur = 16;
    ctx.font = `bold ${mult >= 4 ? 30 : 24}px "Bebas Neue",Impact,sans-serif`;
    ctx.fillStyle = '#FFD700';
    ctx.fillText(`x${mult.toFixed(1)} COMBO`, W / 2, 50);
    ctx.shadowBlur = 8;
  }

  // Speed bar — bottom
  const pct = Math.max(0, Math.min(1, (g.speed - BASE_SPEED) / (MAX_SPEED - BASE_SPEED)));
  ctx.shadowBlur = 0;
  ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(0, H - 26, W, 26);
  const sg = ctx.createLinearGradient(0, 0, W * pct, 0);
  sg.addColorStop(0, '#ff6b35'); sg.addColorStop(1, '#FFD700');
  ctx.fillStyle = sg; ctx.fillRect(0, H - 24, W * pct, 4);
  ctx.textAlign = 'center'; ctx.font = '8px monospace';
  ctx.fillStyle = 'rgba(255,255,255,0.3)';
  ctx.fillText('SPEED', W / 2, H - 8);

  // Grind hint
  if (g.grinding) {
    ctx.textAlign = 'center'; ctx.font = 'bold 15px "Bebas Neue",Impact,sans-serif';
    ctx.fillStyle = '#FFD700'; ctx.shadowColor = '#FFD700'; ctx.shadowBlur = 14;
    ctx.fillText('↑ JUMP OFF RAIL', W / 2, H * 0.70);
    ctx.shadowBlur = 8;
  }

  // Float messages
  for (const m of g.msgs) {
    const alpha = Math.min(1, m.life / 18);
    ctx.save(); ctx.globalAlpha = alpha; ctx.textAlign = 'center';
    ctx.shadowColor = 'rgba(0,0,0,0.95)'; ctx.shadowBlur = 10;
    ctx.font = `bold ${m.size}px "Bebas Neue",Impact,sans-serif`;
    ctx.fillStyle = m.color; ctx.fillText(m.text, W / 2, m.y);
    ctx.restore();
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

export const SkateRun: React.FC<Props> = ({ city, player: _player, onComplete, onBack }) => {
  const canvasRef  = useRef<HTMLCanvasElement>(null);
  const gsRef      = useRef<GS>(makeGS());
  const rafRef     = useRef<number>(0);
  const doneRef    = useRef(false);
  const touchRef   = useRef<{ x: number; y: number } | null>(null);
  const [scrPhase, setScrPhase] = useState<'idle' | 'running' | 'finished'>('idle');

  // ── Helpers (stable refs — no closure over stale state) ──────────────────
  const addMsg = useCallback((g: GS, text: string, color: string, size: number) => {
    const H = canvasRef.current?.offsetHeight ?? 812;
    // Remove duplicate msg with same text to avoid clutter
    g.msgs = g.msgs.filter(m => m.text !== text);
    g.msgs.push({ text, color, y: H * 0.52, size, life: 58 });
  }, []);

  const addScore = useCallback((g: GS, name: string, basePts: number) => {
    g.combo++;
    const mult = comboMultiplier(g.combo);
    const pts  = Math.round(basePts * mult);
    g.score   += pts;
    g.tricks.push({ name, points: basePts, combo: g.combo, total: pts, timestamp: Date.now() });
    const H = canvasRef.current?.offsetHeight ?? 812;
    // Trick name (larger, white)
    g.msgs = g.msgs.filter(m => m.size !== 26); // replace old trick name
    g.msgs.push({ text: name.toUpperCase(), color: '#ffffff', y: H * 0.52, size: 26, life: 60 });
    // Points (smaller, orange) — slightly lower
    g.msgs.push({
      text: `+${formatScore(pts)}${g.combo >= 2 ? `  x${mult.toFixed(1)}` : ''}`,
      color: '#ff6b35', y: H * 0.61, size: 17, life: 55,
    });
  }, []);

  const triggerDeath = useCallback((g: GS) => {
    if (g.deadFrames > 0) return; // already dead
    g.deathCount++;
    g.deadFrames = 1;  // start counting
    g.combo      = 0;
    g.grinding   = false;
    g.sparkOn    = false;
    g.shakeFrames = 22;
    g.jumpFrame  = 0;
    g.sliding    = false;
    addMsg(g, 'BAIL!', '#ff4444', 38);
  }, [addMsg]);

  // ── Spawn obstacles ───────────────────────────────────────────────────────
  const spawnObs = useCallback((g: GS) => {
    if (g.worldZ < g.nextSpawnZ) return;
    const pool: ObsType[] = ['barrier', 'barrier', 'rail', 'low-bar', 'gap', 'barrier', 'rail'];
    const type = pool[Math.floor(Math.random() * pool.length)];
    const lane = Math.floor(Math.random() * 3);
    g.obs.push({ id: g.nextObsId++, type, lane, z: OBS_SPAWN_Z, passed: false, hit: false });
    // Gap between 280 and 480 world-px
    g.nextSpawnZ = g.worldZ + OBS_SPAWN_Z + 280 + Math.random() * 200;
  }, []);

  // ── Collision check ───────────────────────────────────────────────────────
  const checkCollisions = useCallback((g: GS) => {
    for (const ob of g.obs) {
      if (ob.passed || ob.hit) continue;
      if (ob.z > OBS_HIT_Z_HI || ob.z < OBS_HIT_Z_LO) continue;
      if (ob.lane !== g.lane) continue;

      switch (ob.type) {
        case 'barrier':
          if (g.jumpFrame >= 3) {
            // Cleared it
            ob.passed = true;
            addScore(g, 'Ollie!', POINTS.ollie);
            g.shakeFrames = 4;
          } else {
            ob.hit = true;
            triggerDeath(g);
          }
          break;

        case 'rail':
          if (g.grinding) break; // already grinding this or another rail
          if (g.jumpFrame >= 3) {
            // Mount the rail
            ob.passed = true;
            g.grinding    = true;
            g.grindObsId  = ob.id;
            g.grindTick   = 0;
            g.jumpFrame   = 0;   // snap to ground level (rail height)
            g.sparkOn     = true;
            addScore(g, 'Nosegrind!', POINTS.ollie);
          } else {
            ob.hit = true;
            triggerDeath(g);
          }
          break;

        case 'low-bar':
          if (g.sliding) {
            ob.passed = true;
            addScore(g, 'Slide!', POINTS.slide);
          } else {
            ob.hit = true;
            triggerDeath(g);
          }
          break;

        case 'gap':
          if (g.jumpFrame >= 5) {
            ob.passed = true;
            addScore(g, 'Gap!', POINTS.gap);
          } else {
            ob.hit = true;
            triggerDeath(g);
          }
          break;
      }
    }

    // ── Auto-end grind when the rail obstacle has scrolled past ──────────
    if (g.grinding && g.grindObsId >= 0) {
      const rail = g.obs.find(o => o.id === g.grindObsId);
      if (!rail || rail.z < GRIND_END_Z) {
        // Rail has passed — end grind cleanly
        g.grinding  = false;
        g.sparkOn   = false;
        g.grindObsId = -1;
        addScore(g, 'Grind out!', POINTS.ollie);
      }
    }
  }, [addScore, triggerDeath]);

  // ── Gesture handler ───────────────────────────────────────────────────────
  const onGesture = useCallback((dir: 'up' | 'down' | 'left' | 'right') => {
    const g = gsRef.current;
    if (!g.running) return;
    if (g.deadFrames > 0) return; // no input while dead

    if (dir === 'left') {
      if (g.lane > 0) { g.targetLane = g.lane - 1; g.laneT = 0; g.grinding = false; g.sparkOn = false; }
    } else if (dir === 'right') {
      if (g.lane < 2) { g.targetLane = g.lane + 1; g.laneT = 0; g.grinding = false; g.sparkOn = false; }
    } else if (dir === 'up') {
      if (g.grinding) {
        // Jump off rail
        g.grinding = false; g.sparkOn = false; g.grindObsId = -1;
        g.jumpFrame = 1;
        addScore(g, 'Kickflip!', POINTS.kickflip);
      } else if (g.jumpFrame === 0 && !g.sliding) {
        g.jumpFrame = 1;
        // Small score for plain ollie (also used to clear obstacles)
      }
    } else if (dir === 'down') {
      if (g.jumpFrame === 0 && !g.sliding && !g.grinding) {
        g.sliding = true;
        g.slideFrames = SLIDE_FRAMES;
      }
    }
  }, [addScore]);

  // ── Touch events ──────────────────────────────────────────────────────────
  const onTS = useCallback((e: React.TouchEvent) => {
    const t = e.touches[0];
    touchRef.current = { x: t.clientX, y: t.clientY };
  }, []);

  const onTE = useCallback((e: React.TouchEvent) => {
    if (!touchRef.current) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - touchRef.current.x;
    const dy = t.clientY - touchRef.current.y;
    touchRef.current = null;
    const dist = Math.hypot(dx, dy);
    if (dist < 24) return;
    const dir: 'up' | 'down' | 'left' | 'right' = Math.abs(dy) > Math.abs(dx)
      ? (dy < 0 ? 'up' : 'down')
      : (dx > 0 ? 'right' : 'left');
    onGesture(dir);
  }, [onGesture]);

  // Keyboard (desktop testing)
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

  // ── Start ─────────────────────────────────────────────────────────────────
  const startRun = useCallback(() => {
    doneRef.current = false;
    const g = makeGS();
    g.running = true;
    gsRef.current = g;
    setScrPhase('running');
  }, []);

  // ── RAF loop ──────────────────────────────────────────────────────────────
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
      const g = gsRef.current;

      if (g.running) {
        g.frame++;

        // ── DEAD HANDLING ────────────────────────────────────────────────
        if (g.deadFrames > 0) {
          g.deadFrames++;
          // Clear nearby obstacles after a beat so recovery isn't instant death
          if (g.deadFrames === 20) {
            g.obs = g.obs.filter(ob => ob.z < OBS_HIT_Z_LO || ob.z > OBS_HIT_Z_HI + 80 || ob.hit);
          }
          if (g.deadFrames >= DEATH_RECOVER_FRAMES) {
            if (g.deathCount >= MAX_DEATHS) {
              // End run
              if (!doneRef.current) {
                doneRef.current = true;
                g.running = false;
                setScrPhase('finished');
                const score  = g.score;
                const tricks = g.tricks;
                setTimeout(() => onComplete(score, tricks), 1100);
              }
            } else {
              // Recover — resume skating
              g.deadFrames  = 0;
              g.jumpFrame   = 0;
              g.sliding     = false;
              g.grinding    = false;
              g.shakeFrames = 0;
            }
          }
          // Don't update speed/position while dead
        } else {
          // ── NORMAL UPDATE ──────────────────────────────────────────────
          g.speed   = Math.min(MAX_SPEED, g.speed + ACCEL);
          g.worldZ += g.speed;

          // Lane lerp
          if (g.laneT < 1) {
            g.laneT = Math.min(1, g.laneT + 0.15);
            if (g.laneT >= 1) g.lane = g.targetLane;
          }

          // Jump arc
          if (g.jumpFrame > 0) {
            g.jumpFrame++;
            if (g.jumpFrame > JUMP_FRAMES) g.jumpFrame = 0;
          }

          // Slide countdown
          if (g.sliding) {
            g.slideFrames--;
            if (g.slideFrames <= 0) g.sliding = false;
          }

          // Grind trickle score
          if (g.grinding) {
            g.grindTick++;
            if (g.grindTick % GRIND_PTS_INTERVAL === 0) {
              const pts = Math.round(POINTS.grind * comboMultiplier(g.combo));
              g.score += pts;
            }
          }

          // Shake decay
          if (g.shakeFrames > 0) g.shakeFrames--;

          // Spawn + scroll obstacles
          spawnObs(g);
          for (const ob of g.obs) ob.z -= g.speed;
          // Remove obstacles well behind skater
          g.obs = g.obs.filter(ob => ob.z > SKATER_Z - 120);

          // Collisions
          checkCollisions(g);
        }

        // Float msg decay (always)
        g.msgs = g.msgs
          .map(m => ({ ...m, y: m.y - 0.85, life: m.life - 1 }))
          .filter(m => m.life > 0);
      }

      // ── DRAW ────────────────────────────────────────────────────────────
      ctx.save();
      if (g.shakeFrames > 0) ctx.translate((Math.random() - 0.5) * 6, (Math.random() - 0.5) * 4);

      drawRoad(ctx, W, H, city, g.worldZ);
      drawLandmark(ctx, W, H, city, g.worldZ);

      // Draw obstacles back-to-front
      const sorted = [...g.obs].sort((a, b) => b.z - a.z);
      for (const ob of sorted) drawObs(ctx, ob, W, H);

      drawSkater(ctx, W, H, g);

      if (g.sparkOn && g.grinding) drawSparks(ctx, W, H, g);

      // Red vignette while dead
      if (g.deadFrames > 0) {
        const alpha = Math.min(0.5, g.deadFrames * 0.008);
        ctx.fillStyle = `rgba(160,0,0,${alpha})`;
        ctx.fillRect(0, 0, W, H);
      }

      drawHUD(ctx, W, H, g, city);

      ctx.restore();
      rafRef.current = requestAnimationFrame(loop);
    };

    rafRef.current = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(rafRef.current); window.removeEventListener('resize', resize); };
  }, [city, checkCollisions, spawnObs]);

  useEffect(() => () => { cancelAnimationFrame(rafRef.current); }, []);

  // ── FINISHED SCREEN ───────────────────────────────────────────────────────
  if (scrPhase === 'finished') {
    const g = gsRef.current;
    const won = g.score >= city.rival.score;
    const gc  = won ? '#00ff88' : '#ff6b35';
    return (
      <div style={{ height: '100dvh', background: '#0a0a0f', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24, fontFamily: "'Bebas Neue',Impact,sans-serif" }}>
        <div style={{ color: 'rgba(255,255,255,0.35)', fontSize: 10, letterSpacing: 4, fontFamily: 'monospace' }}>{city.name.toUpperCase()}</div>
        <div style={{ fontSize: 22, color: gc, letterSpacing: 3 }}>
          {won ? `${city.rival.avatar} RIVAL BEATEN!` : `${city.rival.avatar} SO CLOSE`}
        </div>
        <div style={{ fontSize: 78, lineHeight: 1, color: '#fff', filter: `drop-shadow(0 0 28px ${gc}88)` }}>
          {formatScore(g.score)}
        </div>
        <div style={{ color: 'rgba(255,255,255,0.35)', fontSize: 12, fontFamily: 'monospace', textAlign: 'center', maxWidth: 280 }}>
          {won ? city.rival.defeatLine : city.rival.lossLine}
        </div>
        <div style={{ color: 'rgba(255,255,255,0.2)', fontSize: 10, fontFamily: 'monospace', marginTop: 6, letterSpacing: 2 }}>
          {g.tricks.length} TRICKS · {Math.floor(g.worldZ / 10)}m · {g.deathCount}/{MAX_DEATHS} BAILS
        </div>
        <div style={{ color: 'rgba(255,255,255,0.18)', fontSize: 9, fontFamily: 'monospace', marginTop: 4 }}>SAVING...</div>
      </div>
    );
  }

  // ── CANVAS + START OVERLAY ────────────────────────────────────────────────
  return (
    <div
      style={{ position: 'relative', width: '100%', height: '100dvh', overflow: 'hidden', background: '#0a0a1a', touchAction: 'none', userSelect: 'none' }}
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

      {scrPhase === 'idle' && (
        <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.88)', zIndex: 30, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, padding: 28, fontFamily: "'Bebas Neue',Impact,sans-serif" }}>
          <div style={{ color: 'rgba(255,255,255,0.35)', fontSize: 10, letterSpacing: 4, fontFamily: 'monospace' }}>{city.state} · ENDLESS RUN</div>
          <div style={{ fontSize: 56, color: '#fff', lineHeight: 1 }}>{city.name}</div>
          <div style={{ color: 'rgba(255,255,255,0.45)', fontSize: 11, fontFamily: 'monospace', textAlign: 'center', maxWidth: 280, lineHeight: 1.7 }}>{city.tagline}</div>

          {/* Rival card */}
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
            {([['← → Swipe', 'Change lane'], ['↑ Swipe Up', 'Ollie / Jump'], ['↓ Swipe Down', 'Slide under bar'], ['↑ on RAIL', 'Mount & grind'], ['↑ while grinding', 'Jump off rail']] as const).map(([ctrl, desc]) => (
              <React.Fragment key={ctrl}>
                <span style={{ color: '#ff6b35', fontSize: 10, fontFamily: 'monospace' }}>{ctrl}</span>
                <span style={{ color: 'rgba(255,255,255,0.45)', fontSize: 10, fontFamily: 'monospace' }}>{desc}</span>
              </React.Fragment>
            ))}
          </div>

          <button onClick={startRun} style={{ background: 'linear-gradient(135deg,#ff6b35,#f7c59f)', border: 'none', borderRadius: 10, color: '#fff', fontSize: 28, letterSpacing: 4, padding: '18px 52px', fontFamily: "'Bebas Neue',Impact,sans-serif", cursor: 'pointer', boxShadow: '0 4px 28px rgba(255,107,53,0.55)' }}>
            DROP IN →
          </button>
        </div>
      )}
    </div>
  );
};
