/**
 * THE GNAR – SkateRun v3.1
 * Bulletproof state machine. Every state has a guaranteed exit to 'rolling' or 'finished'.
 * No setTimeout for state transitions. All logic in the single RAF tick.
 */
import React, { useEffect, useRef, useCallback, useState } from 'react';
import type { Player, Level, TrickResult } from '../game/types';
import { ALL_TRICKS, getTricksForLevel } from '../game/tricks';
import { scoreTrick, comboToMultiplier, formatScore, getLetterGrade, getGradeColor, BONUS_GRIND_SPARK } from '../game/scoring';
import type { SwipeDirection } from '../game/types';

interface Props {
  level: Level;
  player: Player;
  levelIndex: number;
  onComplete: (score: number, trickHistory: TrickResult[]) => void;
  onBack: () => void;
}

// ─── TUNING ──────────────────────────────────────────────────────────────────
const RUN_DURATION    = 60;    // seconds
const MAX_BAILS       = 3;
const GROUND_RATIO    = 0.70;  // ground Y / canvas H
const SKATER_FRAC     = 0.28;  // skater screen-X fraction
const BASE_SCROLL     = 2.8;   // world px/frame
const OBS_SPACING     = 440;   // world px between obstacles
const OBS_FIRST       = 350;   // world X of first obstacle
const GRAVITY         = 0.54;
const JUMP_VY         = -12.0; // negative = upward
const FLIP_RPM        = 17;    // board rot deg/frame during flip
const BAIL_FRAMES     = 50;    // frames in bail pose before recovery
const TAP_WINDOW_MS   = 900;   // total ms tap window stays open
const MANUAL_DUR_BASE = 1200;  // ms manual lasts at base balance

// ─── STATE MACHINE ────────────────────────────────────────────────────────────
//
//  rolling ──swipe──► jumping ──peak──► flipping/ollying
//                                         │tap or timeout│
//                                         ▼              ▼
//                                      landing        bailing
//                                         │              │
//                                         └──────►  rolling
//  rolling ──swipe-down──► manual ──timeout──► rolling
//  rolling ──hold──► grinding ──obstacle-end──► rolling
//
// EVERY branch ends at rolling (or finished). No exits missing.

type Phase =
  | 'rolling'    // normal forward movement
  | 'jumping'    // going up, trick not yet started (ollie peak)
  | 'airborne'   // trick animation playing, tap window open
  | 'landing'    // brief 4-frame clean land squish
  | 'bailing'    // ragdoll countdown
  | 'grinding'   // locked onto obstacle top
  | 'manual'     // wheelie countdown
  | 'finished';  // run over

// ─── GAME STATE (all mutable, lives in a ref) ─────────────────────────────────
interface GS {
  phase: Phase;
  running: boolean;
  timeLeft: number;
  frameCount: number;

  // world
  worldOffset: number;

  // physics
  skaterY: number;   // px above ground (0 = standing)
  skaterVY: number;  // px/frame positive = falling

  // trick
  trickId: string | null;
  boardRot: number;   // degrees
  bodyTilt: number;

  // tap window
  tapOpen: boolean;
  tapStart: number;   // Date.now() snapshot
  tapProg: number;    // 0..1

  // landing / bail
  phaseFrames: number;  // frames remaining in current timed phase
  bailCount: number;

  // grind
  grindIdx: number;
  grindFrames: number;

  // manual
  manualBalance: number;  // -1..1
  manualFrames: number;
  manualDur: number;      // frames until auto-end

  // score
  score: number;
  combo: number;
  lastTrickId: string | null;
  consecSame: number;
  trickHistory: TrickResult[];

  // visuals
  walkFrame: number;
  shakeX: number; shakeY: number; shakeTTL: number;
  sparkTick: number;
}

function makeGS(): GS {
  return {
    phase: 'rolling', running: false, timeLeft: RUN_DURATION, frameCount: 0,
    worldOffset: 0,
    skaterY: 0, skaterVY: 0,
    trickId: null, boardRot: 0, bodyTilt: 0,
    tapOpen: false, tapStart: 0, tapProg: 0,
    phaseFrames: 0, bailCount: 0,
    grindIdx: -1, grindFrames: 0,
    manualBalance: 0, manualFrames: 0, manualDur: 0,
    score: 0, combo: 0,
    lastTrickId: null, consecSame: 0, trickHistory: [],
    walkFrame: 0, shakeX: 0, shakeY: 0, shakeTTL: 0, sparkTick: 0,
  };
}

// ─── OBSTACLES ────────────────────────────────────────────────────────────────
interface Obs {
  type: Level['obstacles'][0]['type'];
  worldX: number;
  w: number; h: number;
  label: string;
  grindable: boolean;
}

function makeObs(level: Level): Obs[] {
  return level.obstacles.map((cfg, i) => {
    const base = { type: cfg.type as Obs['type'], worldX: OBS_FIRST + i * OBS_SPACING, label: cfg.label, grindable: false };
    switch (cfg.type) {
      case 'ledge':  return { ...base, w: 120, h: 18, grindable: true };
      case 'rail':   return { ...base, w: 100, h:  8, grindable: true };
      case 'block':  return { ...base, w:  50, h: 30, grindable: true };
      case 'gap':    return { ...base, w:  55, h:  0, grindable: false };
      case 'stairs': return { ...base, w:  78, h: 40, grindable: false };
      case 'bank':   return { ...base, w:  80, h: 44, grindable: false };
      default:       return { ...base, w:  80, h: 20, grindable: false };
    }
  });
}

// ─── PARTICLES & FLOATS ───────────────────────────────────────────────────────
interface Particle { x:number; y:number; vx:number; vy:number; life:number; maxLife:number; color:string; r:number; spark:boolean; }
interface FloatText { x:number; y:number; vy:number; text:string; color:string; size:number; life:number; maxLife:number; }

// ─── DRAW: BACKGROUND ─────────────────────────────────────────────────────────
function drawBg(ctx: CanvasRenderingContext2D, W: number, H: number, level: Level, wo: number) {
  const [s1, s2, s3] = level.palette.sky;
  const sg = ctx.createLinearGradient(0,0,0,H);
  sg.addColorStop(0,s1); sg.addColorStop(0.5,s2); sg.addColorStop(1,s3);
  ctx.fillStyle = sg; ctx.fillRect(0,0,W,H);

  const GY = H * GROUND_RATIO;

  // Seattle rain
  if (level.id === 'seattle') {
    ctx.save(); ctx.strokeStyle = 'rgba(160,200,255,0.08)'; ctx.lineWidth = 1;
    const ro = (wo * 2.1) % 70;
    for (let i = 0; i < 34; i++) {
      const rx = ((i * 59 + ro) % W);
      ctx.beginPath(); ctx.moveTo(rx, 0); ctx.lineTo(rx - 6, GY); ctx.stroke();
    }
    ctx.restore();
  }

  // Buildings (parallax 0.22×)
  const bOff = (wo * 0.22) % W;
  const BH = [0.40,0.28,0.46,0.34,0.52,0.38,0.44,0.30,0.50,0.36,0.42,0.26];
  const BW = [0.08,0.065,0.10,0.07,0.09,0.06,0.11,0.075,0.085,0.07,0.095,0.06];
  for (let pass = 0; pass < 2; pass++) {
    let bx = pass === 0 ? -bOff : W - bOff;
    for (let i = 0; i < BH.length; i++) {
      const bw = BW[i]*W, bh = BH[i]*GY, by = GY - bh;
      ctx.fillStyle = level.id === 'sf' ? 'rgba(0,0,0,0.52)' : 'rgba(0,0,0,0.42)';
      ctx.fillRect(bx, by, bw-1, bh);
      const wc = level.id==='sf' ? 'rgba(255,210,100,0.28)' : level.id==='portland' ? 'rgba(200,70,50,0.20)' : 'rgba(190,215,255,0.16)';
      ctx.fillStyle = wc;
      for (let wy = by+8; wy < GY-10; wy += 14)
        for (let wx = bx+4; wx < bx+bw-8; wx += 10)
          if ((i + Math.floor(wy/14)) % 3 !== 0) ctx.fillRect(wx, wy, 5, 7);
      bx += bw;
    }
  }

  // Portland bridge
  if (level.id === 'portland') {
    const by2 = GY * 0.60;
    ctx.fillStyle = 'rgba(30,30,50,0.72)'; ctx.fillRect(0, by2, W, 9);
    for (let i = 0; i < 5; i++) ctx.fillRect((i/4)*W - 5, by2, 10, GY - by2);
  }
}

// ─── DRAW: GROUND ─────────────────────────────────────────────────────────────
function drawGround(ctx: CanvasRenderingContext2D, W: number, H: number, level: Level, wo: number) {
  const GY = H * GROUND_RATIO;
  ctx.fillStyle = level.palette.ground; ctx.fillRect(0, GY, W, H-GY);
  ctx.fillStyle = 'rgba(0,0,0,0.30)'; ctx.fillRect(0, GY, W, 3);
  if (level.id === 'seattle') {
    ctx.fillStyle = 'rgba(90,140,210,0.07)';
    const ro = wo % 110;
    for (let i = 0; i < 12; i++) ctx.fillRect((i*110 - ro + W) % W, GY+5, 55, 9);
  }
  ctx.strokeStyle = 'rgba(0,0,0,0.14)'; ctx.lineWidth = 1.5;
  const jSp = level.id === 'portland' ? 50 : 80, jO = wo % jSp;
  for (let i = 0; i <= Math.ceil(W/jSp)+1; i++) {
    const jx = i*jSp - jO;
    ctx.beginPath(); ctx.moveTo(jx,GY); ctx.lineTo(jx,H); ctx.stroke();
  }
}

// ─── DRAW: OBSTACLE ───────────────────────────────────────────────────────────
function drawObs(ctx: CanvasRenderingContext2D, ob: Obs, sx: number, GY: number, glowing: boolean) {
  const { w, h, type } = ob;
  const bx = sx, by = GY - h;
  ctx.save();
  if (glowing) { ctx.shadowColor = '#FFD700'; ctx.shadowBlur = 12; }

  switch (type) {
    case 'ledge':
    case 'block': {
      const [c0, c1] = type === 'block' ? ['#b0a090','#ccbbaa'] : ['#8090a0','#a0b4c8'];
      ctx.fillStyle = 'rgba(0,0,0,0.2)'; ctx.fillRect(bx+4, by+4, w, h);
      ctx.fillStyle = c0; ctx.fillRect(bx, by, w, h);
      ctx.fillStyle = c1; ctx.fillRect(bx, by, w, 5);
      ctx.fillStyle = 'rgba(255,255,255,0.25)'; ctx.fillRect(bx+2, by+1, w-4, 2);
      ctx.fillStyle = 'rgba(0,0,0,0.15)'; ctx.fillRect(bx, by+5, 4, h-5);
      break;
    }
    case 'rail': {
      ctx.fillStyle = '#555';
      ctx.fillRect(bx+8, by+h, 4, GY-by-h);
      ctx.fillRect(bx+w-12, by+h, 4, GY-by-h);
      const rg = ctx.createLinearGradient(0,by,0,by+h);
      rg.addColorStop(0,'#eee'); rg.addColorStop(0.4,'#bbb'); rg.addColorStop(1,'#888');
      ctx.fillStyle = rg;
      ctx.beginPath(); ctx.roundRect(bx, by, w, h, 3); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.fillRect(bx+4, by+1, w-8, 2);
      break;
    }
    case 'gap': {
      ctx.fillStyle = 'rgba(255,80,30,0.4)'; ctx.fillRect(bx, GY-2, w, 3);
      ctx.setLineDash([5,4]); ctx.strokeStyle = 'rgba(255,200,0,0.5)'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(bx, GY-1); ctx.lineTo(bx+w, GY-1); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(bx+3, GY+2, w-6, 16);
      break;
    }
    case 'stairs': {
      const steps=5, sw=w/steps;
      for (let s=0; s<steps; s++) {
        const sx2=bx+s*sw, sy2=GY-(h/steps)*(steps-s);
        ctx.fillStyle = s%2===0 ? '#888' : '#aaa'; ctx.fillRect(sx2, sy2, sw, GY-sy2);
        ctx.fillStyle = 'rgba(255,255,255,0.10)'; ctx.fillRect(sx2, sy2, sw, 2);
      }
      break;
    }
    case 'bank': {
      ctx.fillStyle = '#667';
      ctx.beginPath(); ctx.moveTo(bx,GY); ctx.lineTo(bx+w,GY-h); ctx.lineTo(bx+w,GY); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#889'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(bx,GY); ctx.lineTo(bx+w,GY-h); ctx.stroke();
      break;
    }
  }
  ctx.shadowBlur = 0; ctx.globalAlpha = 0.48;
  ctx.fillStyle = '#fff'; ctx.font = '8px monospace'; ctx.textAlign = 'center';
  ctx.fillText(ob.label.toUpperCase(), bx+w/2, by-4);
  ctx.restore();
}

// ─── DRAW: SKATER ─────────────────────────────────────────────────────────────
function drawSkater(ctx: CanvasRenderingContext2D, sx: number, sy: number, g: GS) {
  ctx.save();
  ctx.translate(sx, sy);

  const isAir    = g.phase === 'airborne' || g.phase === 'jumping';
  const isGrind  = g.phase === 'grinding';
  const isManual = g.phase === 'manual';
  const isBail   = g.phase === 'bailing';
  const isLand   = g.phase === 'landing';

  // ── BOARD ─────────────────────────────────────────────────────────────────
  ctx.save();
  if (isAir)    ctx.rotate((g.boardRot * Math.PI) / 180);
  if (isManual) ctx.rotate(0.20);
  if (isBail)   { ctx.translate(16,6); ctx.rotate((g.boardRot * Math.PI) / 180); }
  if (isLand)   ctx.scale(1.08, 0.86); // squish on landing

  const DW=36, DH=7;
  const dg = ctx.createLinearGradient(0,-DH/2,0,DH/2);
  dg.addColorStop(0,'#d44'); dg.addColorStop(0.5,'#c33'); dg.addColorStop(1,'#922');
  ctx.fillStyle = dg;
  ctx.beginPath(); ctx.roundRect(-DW/2,-DH/2,DW,DH,3); ctx.fill();
  ctx.fillStyle='rgba(0,0,0,0.38)'; ctx.fillRect(-DW/2+2,-DH/2+1,DW-4,2);
  ctx.fillStyle='rgba(255,255,255,0.12)'; ctx.fillRect(-7,-DH/2+3,14,2);
  ctx.fillStyle='#aaa';
  ctx.fillRect(-DW/2+3,DH/2-2,9,4); ctx.fillRect(DW/2-12,DH/2-2,9,4);
  const wr=4;
  [[-DW/2+5,DH/2+2],[DW/2-5,DH/2+2],[-DW/2+5,-DH/2-2],[DW/2-5,-DH/2-2]].forEach(([wx,wy])=>{
    ctx.fillStyle='#ddd'; ctx.beginPath(); ctx.arc(wx,wy,wr,0,Math.PI*2); ctx.fill();
    ctx.fillStyle='#999'; ctx.beginPath(); ctx.arc(wx,wy,wr*.45,0,Math.PI*2); ctx.fill();
  });
  ctx.restore();

  // ── BAIL RAGDOLL ──────────────────────────────────────────────────────────
  if (isBail) {
    ctx.save(); ctx.rotate(g.boardRot * 0.005);
    ctx.fillStyle='#ffcc99'; ctx.beginPath(); ctx.arc(14,-16,8,0,Math.PI*2); ctx.fill();
    ctx.strokeStyle='#4466aa'; ctx.lineWidth=5; ctx.lineCap='round';
    ctx.beginPath(); ctx.moveTo(6,-12); ctx.lineTo(-6,-4); ctx.lineTo(-14,0); ctx.stroke();
    ctx.strokeStyle='#334';
    ctx.beginPath(); ctx.moveTo(-6,-4); ctx.lineTo(-8,8); ctx.lineTo(4,14); ctx.stroke();
    ctx.restore(); ctx.restore();
    return;
  }

  // ── BODY ──────────────────────────────────────────────────────────────────
  ctx.save();
  if (isAir) ctx.rotate((g.bodyTilt * Math.PI) / 180);

  const legSw  = (isAir||isGrind||isManual) ? 0 : Math.sin(g.walkFrame*0.18)*4;
  const bodyBob= isAir ? 0 : Math.abs(Math.sin(g.walkFrame*0.18))*1.5;
  const DH2 = 7;
  const torsoY = -DH2/2 - 30 - bodyBob;

  // back leg
  ctx.strokeStyle='#334'; ctx.lineWidth=5; ctx.lineCap='round';
  ctx.beginPath(); ctx.moveTo(-4,-DH2/2); ctx.lineTo(-6+legSw,-DH2/2-14); ctx.lineTo(-10+legSw*.5,-DH2/2-6); ctx.stroke();
  ctx.fillStyle='#222'; ctx.beginPath(); ctx.ellipse(-10+legSw*.5,-DH2/2-4,6,3,0,0,Math.PI*2); ctx.fill();
  // front leg
  ctx.strokeStyle='#556';
  ctx.beginPath(); ctx.moveTo(6,-DH2/2); ctx.lineTo(8-legSw,-DH2/2-16); ctx.lineTo(12-legSw*.5,-DH2/2-6); ctx.stroke();
  ctx.fillStyle='#445'; ctx.beginPath(); ctx.ellipse(12-legSw*.5,-DH2/2-4,6,3,0,0,Math.PI*2); ctx.fill();

  // torso
  ctx.fillStyle='#4466aa';
  ctx.beginPath(); ctx.roundRect(-7,torsoY+10,14,14,3); ctx.fill();
  ctx.fillStyle='rgba(255,255,255,0.16)'; ctx.fillRect(-3,torsoY+13,6,4);

  // arms
  const armSw = isGrind ? 13 : isManual ? -10 : Math.sin(g.walkFrame*0.18)*6;
  ctx.lineWidth=4;
  ctx.strokeStyle='#3355aa';
  ctx.beginPath(); ctx.moveTo(-6,torsoY+14); ctx.lineTo(-14,torsoY+22+armSw); ctx.stroke();
  ctx.strokeStyle='#5577cc';
  ctx.beginPath(); ctx.moveTo(6,torsoY+14); ctx.lineTo(13,torsoY+20-armSw); ctx.stroke();

  // neck
  ctx.fillStyle='#ffcc99'; ctx.fillRect(-3,torsoY+5,6,7);

  // head
  ctx.fillStyle='#ffcc99'; ctx.beginPath(); ctx.arc(1,torsoY+2,9,0,Math.PI*2); ctx.fill();

  // ── BEANIE ────────────────────────────────────────────────────────────────
  // Band
  ctx.fillStyle='#cc2222';
  ctx.beginPath(); ctx.ellipse(1,torsoY-6,9.5,4,0,0,Math.PI*2); ctx.fill();
  // Body of beanie
  ctx.fillStyle='#dd3333';
  ctx.beginPath(); ctx.ellipse(1,torsoY-8,9,7,0,Math.PI,0); ctx.fill();
  // Ribbing stripes
  ctx.strokeStyle='rgba(0,0,0,0.18)'; ctx.lineWidth=1;
  for (let ri = 0; ri < 3; ri++) {
    ctx.beginPath();
    ctx.ellipse(1, torsoY-6-(ri*1.8), 9.5-ri*0.4, 1.5, 0, 0, Math.PI*2);
    ctx.stroke();
  }
  // Pom
  ctx.fillStyle='#ff5555';
  ctx.beginPath(); ctx.arc(1,torsoY-15,3.5,0,Math.PI*2); ctx.fill();
  ctx.fillStyle='rgba(255,255,255,0.4)';
  ctx.beginPath(); ctx.arc(-0.5,torsoY-16,1.5,0,Math.PI*2); ctx.fill();

  // shades
  ctx.fillStyle='#111';
  ctx.fillRect(-6,torsoY+2,5,3); ctx.fillRect(1,torsoY+2,5,3);
  ctx.strokeStyle='#333'; ctx.lineWidth=1;
  ctx.beginPath(); ctx.moveTo(-1,torsoY+3); ctx.lineTo(1,torsoY+3); ctx.stroke();

  ctx.restore();
  ctx.restore();
}

// ─── DRAW: PARTICLES ──────────────────────────────────────────────────────────
function drawParticles(ctx: CanvasRenderingContext2D, ps: Particle[]) {
  for (const p of ps) {
    const a = p.life/p.maxLife;
    ctx.save(); ctx.globalAlpha = a;
    if (p.spark) { ctx.shadowColor=p.color; ctx.shadowBlur=8; }
    ctx.fillStyle = p.color;
    ctx.beginPath(); ctx.arc(p.x, p.y, Math.max(0.1, p.r*a), 0, Math.PI*2); ctx.fill();
    ctx.restore();
  }
}

// ─── DRAW: HUD ────────────────────────────────────────────────────────────────
function drawHUD(ctx: CanvasRenderingContext2D, W: number, H: number, g: GS, floats: FloatText[]) {
  const GY = H * GROUND_RATIO;
  ctx.save();
  ctx.shadowColor='rgba(0,0,0,0.85)'; ctx.shadowBlur=6;

  // Score
  ctx.textAlign='right'; ctx.font='bold 30px "Bebas Neue",Impact,sans-serif';
  ctx.fillStyle='#fff'; ctx.fillText(formatScore(g.score), W-14, 46);

  // Timer
  ctx.font='bold 14px monospace';
  ctx.fillStyle = g.timeLeft<=10 ? '#ff4444' : 'rgba(255,255,255,0.75)';
  ctx.fillText(`${g.timeLeft}s`, W-14, 64);

  // Bail dots
  ctx.textAlign='left'; ctx.font='9px monospace';
  ctx.fillStyle='rgba(255,255,255,0.4)'; ctx.fillText('BAILS', 14, 28);
  for (let i=0; i<MAX_BAILS; i++) {
    ctx.fillStyle = i < g.bailCount ? '#ff4444' : 'rgba(255,255,255,0.18)';
    ctx.beginPath(); ctx.arc(14+5+i*16, 38, 5, 0, Math.PI*2); ctx.fill();
  }

  // Combo multiplier (derived from combo count, capped at 5x)
  const dispMult = comboToMultiplier(g.combo);
  if (g.combo >= 2) {
    ctx.textAlign='center'; ctx.shadowColor='rgba(255,200,0,0.7)'; ctx.shadowBlur=14;
    ctx.font=`bold ${dispMult>=5?28:22}px "Bebas Neue",Impact,sans-serif`;
    ctx.fillStyle='#FFD700'; ctx.fillText(`x${dispMult}`, W/2, 50);
    ctx.shadowBlur=6;
  }

  // Combo dots
  if (g.combo > 0) {
    const SHOW=Math.min(g.combo,14);
    ctx.textAlign='left'; ctx.font='9px monospace'; ctx.shadowBlur=0;
    ctx.fillStyle='rgba(255,255,255,0.45)'; ctx.fillText('COMBO', 14, H-80);
    for (let i=0; i<SHOW; i++) {
      ctx.fillStyle = i<5 ? '#ff6b35' : i<10 ? '#FFD700' : '#00ff88';
      ctx.beginPath(); ctx.arc(14+5+i*13, H-66, 5, 0, Math.PI*2); ctx.fill();
    }
    if (g.combo>14) { ctx.fillStyle='#fff'; ctx.font='9px monospace'; ctx.fillText(`+${g.combo-14}`, 14+14*13+8, H-62); }
  }

  // Tap window
  if (g.tapOpen) {
    const TW=140, TH=12, tx=W/2-TW/2, ty=GY-72;
    ctx.shadowBlur=0;
    // bg
    ctx.fillStyle='rgba(0,0,0,0.7)';
    ctx.beginPath(); ctx.roundRect(tx-3,ty-16,TW+6,TH+22,6); ctx.fill();
    // zones
    ctx.fillStyle='#00c85a'; ctx.beginPath(); ctx.roundRect(tx,ty,TW*0.35,TH,[4,0,0,4]); ctx.fill();
    ctx.fillStyle='#e8b800'; ctx.fillRect(tx+TW*0.35,ty,TW*0.30,TH);
    ctx.fillStyle='#e83030'; ctx.beginPath(); ctx.roundRect(tx+TW*0.65,ty,TW*0.35,TH,[0,4,4,0]); ctx.fill();
    // cursor
    const cPos=tx+TW*g.tapProg;
    ctx.fillStyle='#fff'; ctx.shadowColor='#fff'; ctx.shadowBlur=10;
    ctx.fillRect(cPos-2,ty-2,4,TH+4);
    ctx.shadowBlur=6;
    // label
    ctx.textAlign='center'; ctx.font='bold 10px monospace';
    ctx.fillStyle='#fff'; ctx.shadowColor='#000';
    ctx.fillText('TAP TO LAND', W/2, ty-4);
    // live quality hint
    const ql = g.tapProg<0.35 ? 'CLEAN' : g.tapProg<0.65 ? 'SKETCHY' : '⚠ BAIL ZONE';
    const qc = g.tapProg<0.35 ? '#00ff88' : g.tapProg<0.65 ? '#FFD700' : '#ff5544';
    ctx.fillStyle=qc; ctx.shadowBlur=0; ctx.font='bold 9px monospace';
    ctx.fillText(ql, W/2, ty+TH+10);
  }

  // Grind label
  if (g.phase==='grinding') {
    ctx.textAlign='center'; ctx.font='bold 11px monospace';
    ctx.fillStyle='#FFD700'; ctx.shadowColor='#FFD700'; ctx.shadowBlur=10;
    ctx.fillText('GRINDING  +POINTS', W/2, GY-82);
    ctx.shadowBlur=6;
  }

  // Manual balance
  if (g.phase==='manual') {
    const BW=100, BH=8, bx=W/2-BW/2, by=H-52;
    ctx.shadowBlur=0;
    ctx.fillStyle='rgba(0,0,0,0.5)'; ctx.beginPath(); ctx.roundRect(bx,by,BW,BH,4); ctx.fill();
    const bal=(g.manualBalance+1)/2;
    ctx.fillStyle=Math.abs(g.manualBalance)>0.65 ? '#ff4444' : '#00ff88';
    ctx.fillRect(bx+2,by+2,(BW-4)*bal,BH-4);
    ctx.fillStyle='#fff'; ctx.fillRect(bx+BW/2-1,by,2,BH);
    ctx.textAlign='center'; ctx.font='9px monospace'; ctx.fillStyle='rgba(255,255,255,0.65)';
    ctx.fillText('MANUAL — BALANCE', W/2, by-5);
  }

  // Float texts
  for (const ft of floats) {
    ctx.save(); ctx.globalAlpha=ft.life/ft.maxLife; ctx.textAlign='center';
    ctx.font=`bold ${ft.size}px "Bebas Neue",Impact,sans-serif`;
    ctx.fillStyle=ft.color; ctx.shadowColor='rgba(0,0,0,0.95)'; ctx.shadowBlur=10;
    ctx.fillText(ft.text, ft.x, ft.y); ctx.restore();
  }

  ctx.restore();
}

// ─── COMPONENT ────────────────────────────────────────────────────────────────
export const SkateRun: React.FC<Props> = ({ level, player, levelIndex, onComplete, onBack }) => {
  const canvasRef   = useRef<HTMLCanvasElement>(null);
  const gsRef       = useRef<GS>(makeGS());
  const obsRef      = useRef<Obs[]>(makeObs(level));
  const psRef       = useRef<Particle[]>([]);
  const ftsRef      = useRef<FloatText[]>([]);
  const rafRef      = useRef<number>(0);
  const secTimer    = useRef<ReturnType<typeof setInterval>|null>(null);
  const touchRef    = useRef<{x:number;y:number;t:number;moved:boolean}|null>(null);
  const holdRef     = useRef<ReturnType<typeof setTimeout>|null>(null);
  const doneRef     = useRef(false);
  const [scrPhase, setScrPhase] = useState<'idle'|'running'|'finished'>('idle');

  const tricks = getTricksForLevel(levelIndex).filter(t => player.unlockedTricks.includes(t.id));

  function trickFor(dir: SwipeDirection, hold: boolean) {
    const g = hold ? `hold-${dir}` as const : `swipe-${dir}` as const;
    const cs = tricks.filter(t => t.gesture === g);
    if (!cs.length) return null;
    return cs.reduce((b,t) => t.unlockLevel>b.unlockLevel ? t : b, cs[0]);
  }

  // ── particle emitters ──────────────────────────────────────────────────────
  const emit = useCallback((cx:number, cy:number, spark:boolean, color:string, n:number) => {
    for (let i=0; i<n; i++) psRef.current.push({
      x: cx+(Math.random()-.5)*18, y: cy,
      vx: (Math.random()-.5)*7, vy: -1.5-Math.random()*4.5,
      life: 26+Math.random()*22, maxLife: 48,
      color, r: 2.5+Math.random()*2.5, spark,
    });
  },[]);

  const float = useCallback((x:number,y:number,text:string,color:string,size:number) => {
    ftsRef.current.push({ x,y,vy:-1.05,text,color,size,life:70,maxLife:70 });
  },[]);

  // ── RESOLVE TRICK ─────────────────────────────────────────────────────────
  // Single, authoritative place that applies a landing and transitions to next phase.
  // Called from RAF (timeout/gravity) and from tap handler.
  // Guards ensure it can only fire once per trick attempt.
  const resolveTrick = useCallback((prog: number) => {
    const g = gsRef.current;
    // Guard: only valid when we have an open tap window in airborne state
    if (!g.tapOpen) return;
    if (g.phase !== 'airborne' && g.phase !== 'jumping') return;

    const trick = g.trickId ? ALL_TRICKS.find(t => t.id===g.trickId) : null;

    // Close the window FIRST — prevents any re-entry
    g.tapOpen = false;
    g.trickId = null;

    const canvas = canvasRef.current;
    const W = canvas?.offsetWidth ?? 375, H = canvas?.offsetHeight ?? 812;
    const GY = H * GROUND_RATIO;
    const cx = W * SKATER_FRAC, cy = GY - g.skaterY;

    const quality: TrickResult['landingQuality'] =
      prog <= 0.35 ? 'perfect'
      : prog <= 0.65 ? 'clean'
      : prog <= 0.85 ? 'sloppy'
      : 'bail';

    if (quality === 'bail' || !trick) {
      // ── BAIL ─────────────────────────────────────────────────────────────
      g.phase = 'bailing';
      g.phaseFrames = BAIL_FRAMES;
      g.boardRot = 90 + Math.random()*160;
      g.bailCount++;
      g.combo = 0;   // combo resets on bail
      emit(cx, cy, false, '#ff4444', 10);
      float(cx, cy-44, 'BAIL!', '#ff4444', 30);
      float(cx, cy-72, `${g.bailCount}/${MAX_BAILS} bails`, '#ff8866', 13);
      return;
    }

    // ── CLEAN / SKETCHY LAND ─────────────────────────────────────────────
    const result = scoreTrick(trick, quality, g.combo);

    g.score += result.total;
    g.combo  = quality === 'sloppy' ? Math.max(0, g.combo - 1) : g.combo + 1;
    // Multiplier is purely derived from combo — no hidden modifiers
    g.lastTrickId = trick.id;
    g.trickHistory.push(result);

    // Brief landing squish then back to rolling
    g.phase = 'landing';
    g.phaseFrames = 5;
    g.boardRot = 0; g.bodyTilt = 0;

    // ── FEEDBACK: show exactly what the player earned ─────────────────────
    const isClean   = quality === 'perfect' || quality === 'clean';
    const landLabel = isClean ? 'CLEAN LANDING' : 'SKETCHY LANDING';
    const landColor = isClean ? '#00ff88' : '#ffcc44';
    const multNow   = comboToMultiplier(g.combo);

    if (isClean) { g.shakeTTL = 6; emit(cx, cy, true, '#FFD700', 16); }
    else emit(cx, cy, false, '#ff8833', 8);

    // Line 1: trick name + base pts
    float(cx, cy-44, `${trick.name.toUpperCase()}`, '#ffffff', 26);
    // Line 2: landing quality
    float(cx, cy-72, landLabel, landColor, 13);
    // Line 3: score earned (already includes multiplier)
    float(cx, cy-90, `+${formatScore(result.total)}`, '#ff6b35', 18);
    // Line 4: combo (only if combo built up)
    if (g.combo >= 2) {
      float(cx, cy-110, `COMBO x${multNow}`, '#FFD700', 13);
    }
  }, [emit, float]);

  // ── INPUT ─────────────────────────────────────────────────────────────────
  const onGesture = useCallback((dir: SwipeDirection, hold: boolean) => {
    const g = gsRef.current;
    if (!g.running) return;
    // Accept input only when rolling, landing (briefly), or grinding (to jump off)
    if (g.phase !== 'rolling' && g.phase !== 'landing') return;
    if (g.tapOpen) return;

    const trick = trickFor(dir, hold);
    if (!trick) return;

    const canvas = canvasRef.current;
    const W = canvas?.offsetWidth ?? 375, H = canvas?.offsetHeight ?? 812;
    const GY = H * GROUND_RATIO;
    const cx = W * SKATER_FRAC;

    // ── OLLIE / FLIP ──────────────────────────────────────────────────────
    if ((dir==='up' || dir==='left' || dir==='right') && !hold) {
      g.skaterVY = JUMP_VY - player.stats.pop*0.25;
      g.phase = 'airborne';
      g.trickId = trick.id;
      g.boardRot = 0; g.bodyTilt = 0;
      g.tapOpen = true;
      g.tapStart = Date.now();
      g.tapProg = 0;
      return;
    }

    // ── MANUAL ────────────────────────────────────────────────────────────
    if (dir==='down' && !hold) {
      g.phase = 'manual';
      g.trickId = trick.id;
      g.manualBalance = 0; g.manualFrames = 0;
      // Duration based on balance stat, stored as frame count
      const durMs = MANUAL_DUR_BASE + player.stats.balance*180;
      g.manualDur = Math.round(durMs / 16.67); // approx frames @ 60fps
      float(cx, GY-56, 'MANUAL', '#fff', 22);
      return;
    }

    // ── GRIND ─────────────────────────────────────────────────────────────
    if (hold) {
      const skSX = W * SKATER_FRAC;
      const nearIdx = obsRef.current.findIndex(o => {
        const sx = o.worldX - g.worldOffset;
        return o.grindable && sx > skSX-50 && sx < skSX+110;
      });
      if (nearIdx < 0) return;
      const ob = obsRef.current[nearIdx];
      g.phase = 'grinding';
      g.trickId = trick.id;
      g.grindIdx = nearIdx;
      g.grindFrames = 0;
      g.sparkTick = 0;
      g.skaterY = ob.h + 4;
      g.skaterVY = 0;
      float(cx, GY-ob.h-52, trick.name.toUpperCase(), '#FFD700', 20);
    }
  }, [tricks, player, float]);

  const onTap = useCallback(() => {
    const g = gsRef.current;
    if (g.tapOpen && g.trickId) resolveTrick(g.tapProg);
  }, [resolveTrick]);

  // ── TOUCH ──────────────────────────────────────────────────────────────────
  const onTS = useCallback((e: React.TouchEvent) => {
    const t = e.touches[0];
    touchRef.current = { x:t.clientX, y:t.clientY, t:Date.now(), moved:false };
    holdRef.current = setTimeout(() => {
      if (touchRef.current && !touchRef.current.moved) onGesture('up', true);
    }, 260);
  }, [onGesture]);

  const onTM = useCallback((e: React.TouchEvent) => {
    if (!touchRef.current) return;
    const t = e.touches[0];
    if (Math.hypot(t.clientX-touchRef.current.x, t.clientY-touchRef.current.y) > 10)
      touchRef.current.moved = true;
  }, []);

  const onTE = useCallback((e: React.TouchEvent) => {
    if (holdRef.current) clearTimeout(holdRef.current);
    if (!touchRef.current) return;
    const t = e.changedTouches[0];
    const dx = t.clientX-touchRef.current.x, dy = t.clientY-touchRef.current.y;
    const dist = Math.hypot(dx,dy);
    touchRef.current = null;

    if (dist < 20) {
      onTap();
    } else if (dist >= 30) {
      const dir: SwipeDirection = Math.abs(dy)>Math.abs(dx)
        ? (dy<0?'up':'down') : (dx>0?'right':'left');
      onGesture(dir, false);
    }
  }, [onTap, onGesture]);

  // ── START ──────────────────────────────────────────────────────────────────
  const startRun = useCallback(() => {
    gsRef.current = makeGS();
    gsRef.current.running = true;
    obsRef.current = makeObs(level);
    psRef.current = []; ftsRef.current = [];
    doneRef.current = false;
    setScrPhase('running');

    secTimer.current = setInterval(() => {
      const g = gsRef.current;
      if (!g.running) return;
      g.timeLeft = Math.max(0, g.timeLeft-1);
      if (g.timeLeft===0) {
        g.running = false; g.phase = 'finished';
        clearInterval(secTimer.current!);
        if (!doneRef.current) {
          doneRef.current = true;
          setScrPhase('finished');
          setTimeout(() => onComplete(g.score, g.trickHistory), 1100);
        }
      }
    }, 1000);
  }, [level, onComplete]);

  // ── RAF LOOP ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext('2d')!;

    const resize = () => {
      const dpr = window.devicePixelRatio||1;
      canvas.width  = canvas.offsetWidth*dpr;
      canvas.height = canvas.offsetHeight*dpr;
      ctx.scale(dpr,dpr);
    };
    resize();
    window.addEventListener('resize', resize);

    const loop = () => {
      const W=canvas.offsetWidth, H=canvas.offsetHeight, GY=H*GROUND_RATIO;
      const g=gsRef.current, obs=obsRef.current;

      // ── PHYSICS & STATE MACHINE ───────────────────────────────────────
      if (g.running) {
        g.frameCount++;
        g.worldOffset += BASE_SCROLL + player.stats.speed*0.07;
        g.walkFrame++;

        // ── gravity ───────────────────────────────────────────────────
        if (g.phase !== 'grinding' && g.phase !== 'manual') {
          if (g.skaterY > 0 || g.skaterVY < 0) {
            g.skaterVY += GRAVITY;
            g.skaterY  = Math.max(0, g.skaterY - g.skaterVY);
          }
          // Landed on ground while airborne
          if (g.skaterY === 0 && (g.phase==='airborne'||g.phase==='jumping')) {
            if (g.tapOpen) {
              // Missed the tap — auto bail (progress = 1.0 = bail zone)
              resolveTrick(1.0);
            } else {
              // No open window (e.g. ollie that skipped trick window), just roll
              g.phase = 'rolling';
            }
          }
        }

        // ── tap window progress ───────────────────────────────────────
        if (g.tapOpen) {
          g.tapProg = Math.min((Date.now()-g.tapStart)/TAP_WINDOW_MS, 1);
          if (g.tapProg >= 1) resolveTrick(1.0); // timed out = bail
        }

        // ── board rotation in air ─────────────────────────────────────
        if (g.phase==='airborne') {
          const tr = ALL_TRICKS.find(t=>t.id===g.trickId);
          if (tr?.category==='flip') {
            const dir = (tr.id==='heelflip'||tr.id==='inward-heel') ? -1 : 1;
            g.boardRot += FLIP_RPM*dir;
          } else if (tr?.category==='ollie') {
            g.bodyTilt = Math.min(g.bodyTilt+1.2, 8);
          }
        }

        // ── landing squish → rolling ──────────────────────────────────
        if (g.phase==='landing') {
          g.phaseFrames--;
          if (g.phaseFrames <= 0) {
            g.phase = 'rolling';
            g.skaterY = 0; g.skaterVY = 0;
          }
        }

        // ── bail countdown → recover or finish ────────────────────────
        if (g.phase==='bailing') {
          g.phaseFrames--;
          g.boardRot += 2.8;
          if (g.phaseFrames <= 0) {
            if (g.bailCount >= MAX_BAILS) {
              // End the run
              if (!doneRef.current) {
                doneRef.current = true;
                g.running = false;
                g.phase = 'finished';
                clearInterval(secTimer.current!);
                setScrPhase('finished');
                setTimeout(() => onComplete(g.score, g.trickHistory), 1100);
              }
            } else {
              // Recover and keep skating
              g.phase = 'rolling';
              g.skaterY = 0; g.skaterVY = 0;
              g.boardRot = 0; g.bodyTilt = 0;
            }
          }
        }

        // ── grinding ─────────────────────────────────────────────────
        if (g.phase==='grinding' && g.grindIdx>=0) {
          const ob = obs[g.grindIdx];
          if (ob) {
            const osx = ob.worldX - g.worldOffset;
            g.skaterY = ob.h + 4;
            g.skaterVY = 0;
            g.grindFrames++;
            // sparks
            g.sparkTick++;
            if (g.sparkTick%3===0) {
              const cx=W*SKATER_FRAC, cy=GY-g.skaterY;
              for (let i=0;i<4;i++) psRef.current.push({
                x:cx+(Math.random()-.5)*14, y:cy-2,
                vx:(Math.random()-.5)*6, vy:-.5-Math.random()*3,
                life:18,maxLife:18, color:Math.random()>.5?'#FFD700':'#ff9900', r:2+Math.random()*2, spark:true,
              });
            }
            // trickle score: 10pts × combo mult every 6 frames while grinding
            if (g.grindFrames%6===0) {
              g.score += Math.round(10 * comboToMultiplier(g.combo + 1));
            }
            // obstacle fully passed skater → exit grind with clean score + spark bonus
            if (osx + ob.w < W*SKATER_FRAC - 10) {
              const tr = g.trickId ? ALL_TRICKS.find(t=>t.id===g.trickId) : null;
              if (tr) {
                const result = scoreTrick(tr, 'clean', g.combo);
                g.score += result.total + BONUS_GRIND_SPARK;
                g.combo++;
                g.trickHistory.push(result);
                const cx=W*SKATER_FRAC, cy=GY-g.skaterY;
                float(cx, cy-44, 'GRIND!', '#FFD700', 24);
                float(cx, cy-70, `+${formatScore(result.total + BONUS_GRIND_SPARK)}`, '#ff6b35', 17);
                float(cx, cy-90, `COMBO x${comboToMultiplier(g.combo)}`, '#FFD700', 13);
                g.shakeTTL=5;
              }
              g.phase='rolling'; g.skaterY=0; g.skaterVY=0;
              g.grindIdx=-1; g.boardRot=0; g.trickId=null;
            }
          }
        }

        // ── manual balance drift → auto-end ──────────────────────────
        if (g.phase==='manual') {
          g.manualFrames++;
          g.manualBalance += (Math.random()-.50)*0.035;
          g.manualBalance = Math.max(-1,Math.min(1,g.manualBalance));
          if (g.manualFrames >= g.manualDur) {
            const bal = Math.abs(g.manualBalance);
            const manQuality: TrickResult['landingQuality'] = bal<0.5?'clean':bal<0.75?'sloppy':'bail';
            const tr = g.trickId ? ALL_TRICKS.find(t=>t.id===g.trickId) : null;
            if (tr && manQuality !== 'bail') {
              const result = scoreTrick(tr, manQuality, g.combo);
              g.score += result.total;
              g.combo++;
              g.trickHistory.push(result);
              const cx=W*SKATER_FRAC, cy=GY-g.skaterY;
              float(cx, cy-44, 'MANUAL DONE', '#00ff88', 20);
              float(cx, cy-68, `+${formatScore(result.total)}`, '#ff6b35', 16);
            } else if (manQuality === 'bail') {
              const cx=W*SKATER_FRAC, cy=GY-g.skaterY;
              float(cx, cy-44, 'BAILED MANUAL', '#ff4444', 18);
              g.combo = 0;
            }
            g.phase='rolling'; g.skaterY=0; g.trickId=null;
          }
        }

        // ── shake ────────────────────────────────────────────────────
        if (g.shakeTTL>0) {
          g.shakeX=(Math.random()-.5)*5; g.shakeY=(Math.random()-.5)*4; g.shakeTTL--;
        } else { g.shakeX=0; g.shakeY=0; }
      }

      // ── particles & floats ─────────────────────────────────────────
      psRef.current = psRef.current
        .filter(p=>p.life>0)
        .map(p=>({...p,x:p.x+p.vx,y:p.y+p.vy,vy:p.vy+0.14,life:p.life-1}));
      ftsRef.current = ftsRef.current
        .filter(f=>f.life>0)
        .map(f=>({...f,y:f.y+f.vy,life:f.life-1}));

      // ── DRAW ───────────────────────────────────────────────────────
      ctx.save();
      ctx.translate(g.shakeX, g.shakeY);

      drawBg(ctx, W, H, level, g.worldOffset);

      obs.forEach(ob => {
        const sx = ob.worldX - g.worldOffset;
        if (sx > -ob.w-30 && sx < W+30) {
          ctx.save();
          ctx.globalAlpha = (ob.worldX+ob.w < g.worldOffset-30) ? 0.22 : 1;
          drawObs(ctx, ob, sx, GY, g.phase==='grinding' && obs.indexOf(ob)===g.grindIdx);
          ctx.restore();
        }
      });

      drawGround(ctx, W, H, level, g.worldOffset);
      drawSkater(ctx, W*SKATER_FRAC, GY-g.skaterY, g);
      drawParticles(ctx, psRef.current);
      drawHUD(ctx, W, H, g, ftsRef.current);

      ctx.restore();
      rafRef.current = requestAnimationFrame(loop);
    };

    rafRef.current = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(rafRef.current); window.removeEventListener('resize',resize); };
  }, [level, player, resolveTrick, float]);

  useEffect(() => () => { clearInterval(secTimer.current!); }, []);

  // ── FINISHED SCREEN ───────────────────────────────────────────────────────
  if (scrPhase === 'finished') {
    const g = gsRef.current;
    const grade = getLetterGrade(g.score);
    const gc    = getGradeColor(grade);
    return (
      <div style={{height:'100dvh',background:'#0a0a0f',display:'flex',flexDirection:'column',
        alignItems:'center',justifyContent:'center',gap:12,padding:24,
        fontFamily:"'Bebas Neue',Impact,sans-serif"}}>
        <div style={{color:'rgba(255,255,255,0.35)',fontSize:10,letterSpacing:4,fontFamily:'monospace'}}>
          {level.city.toUpperCase()} · {level.spotName.toUpperCase()}
        </div>
        <div style={{fontSize:100,lineHeight:1,color:gc,filter:`drop-shadow(0 0 36px ${gc}88)`}}>{grade}</div>
        <div style={{color:'#fff',fontSize:46}}>{formatScore(g.score)}</div>
        <div style={{color:'rgba(255,255,255,0.4)',fontSize:12,fontFamily:'monospace',letterSpacing:2}}>
          {g.trickHistory.length} TRICKS · {g.bailCount} BAILS · MAX x{Math.max(...g.trickHistory.map(t=>t.multiplier),1).toFixed(1)}
        </div>
        <div style={{color:'rgba(255,255,255,0.2)',fontSize:10,fontFamily:'monospace',letterSpacing:2,marginTop:8}}>
          SAVING...
        </div>
      </div>
    );
  }

  // ── MAIN CANVAS VIEW ─────────────────────────────────────────────────────
  return (
    <div style={{position:'relative',width:'100%',height:'100dvh',overflow:'hidden',
      background:'#111',touchAction:'none',userSelect:'none'}}
      onTouchStart={scrPhase==='running'?onTS:undefined}
      onTouchMove={scrPhase==='running'?onTM:undefined}
      onTouchEnd={scrPhase==='running'?onTE:undefined}
    >
      <canvas ref={canvasRef} style={{position:'absolute',inset:0,width:'100%',height:'100%'}} />

      <button onClick={onBack} style={{
        position:'absolute',top:16,left:16,zIndex:20,
        background:'rgba(0,0,0,0.55)',border:'1px solid rgba(255,255,255,0.2)',
        borderRadius:8,color:'#fff',fontSize:18,width:40,height:40,
        cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',
      }}>←</button>

      {scrPhase==='running' && (
        <div style={{position:'absolute',top:16,left:64,zIndex:10,
          fontFamily:"'Bebas Neue',Impact,sans-serif",pointerEvents:'none'}}>
          <div style={{color:'#fff',fontSize:20,lineHeight:1,textShadow:'0 1px 6px rgba(0,0,0,0.9)'}}>
            {level.city}
          </div>
          <div style={{color:'rgba(255,255,255,0.45)',fontSize:8,fontFamily:'monospace',letterSpacing:2}}>
            {level.spotName.toUpperCase()}
          </div>
        </div>
      )}

      {scrPhase==='idle' && (
        <div style={{position:'absolute',inset:0,background:'rgba(0,0,0,0.82)',zIndex:30,
          display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',
          gap:14,padding:24,fontFamily:"'Bebas Neue',Impact,sans-serif"}}>

          <div style={{color:'rgba(255,255,255,0.35)',fontSize:10,letterSpacing:4,fontFamily:'monospace'}}>
            {level.state} · {level.spotName.toUpperCase()}
          </div>
          <div style={{fontSize:54,color:'#fff',lineHeight:1}}>{level.city}</div>
          <div style={{color:'rgba(255,255,255,0.45)',fontSize:11,fontFamily:'monospace',
            textAlign:'center',maxWidth:270,lineHeight:1.6}}>{level.description}</div>

          <div style={{background:'rgba(255,255,255,0.05)',border:'1px solid rgba(255,255,255,0.10)',
            borderRadius:12,padding:'14px 18px',width:'100%',maxWidth:300,
            display:'grid',gridTemplateColumns:'1fr 1fr',gap:'7px 10px'}}>
            {[['↑ Swipe Up','Ollie'],['← Swipe Left','Kickflip'],
              ['→ Swipe Right','Heelflip'],['↓ Swipe Down','Manual'],
              ['Hold near rail','Grind'],['Tap (GREEN zone)','Clean land']
            ].map(([g2,n])=>(
              <div key={g2} style={{display:'flex',gap:5}}>
                <span style={{color:'#ff6b35',fontSize:9,fontFamily:'monospace',minWidth:82}}>{g2}</span>
                <span style={{color:'rgba(255,255,255,0.38)',fontSize:9,fontFamily:'monospace'}}>{n}</span>
              </div>
            ))}
          </div>

          <div style={{background:'rgba(255,55,55,0.08)',border:'1px solid rgba(255,55,55,0.22)',
            borderRadius:8,padding:'10px 16px',width:'100%',maxWidth:300}}>
            <div style={{color:'#ff8866',fontSize:12,letterSpacing:2,textAlign:'center',marginBottom:4}}>
              BAIL RULES
            </div>
            <div style={{color:'rgba(255,255,255,0.5)',fontSize:9,fontFamily:'monospace',
              textAlign:'center',lineHeight:1.8}}>
              Miss tap = BAIL · 3 bails = RUN OVER<br/>
              Auto get up after bails 1 &amp; 2<br/>
              Bail breaks your combo
            </div>
          </div>

          <button onClick={startRun} style={{
            background:'linear-gradient(135deg,#ff6b35,#f7c59f)',
            border:'none',borderRadius:10,color:'#fff',
            fontSize:26,letterSpacing:4,padding:'18px 52px',
            fontFamily:"'Bebas Neue',Impact,sans-serif",
            cursor:'pointer',marginTop:4,
            boxShadow:'0 4px 28px rgba(255,107,53,0.55)',
          }}>DROP IN →</button>
        </div>
      )}
    </div>
  );
};
