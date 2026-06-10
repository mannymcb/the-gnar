/**
 * THE GNAR – SkateRun v4
 *
 * Core redesign: terrain-based physics.
 * Every obstacle has a rideable surface. The skater stands on it.
 * Lines feel like actual skating.
 *
 * Terrain model:
 *   - World is a sequence of TERRAIN SEGMENTS
 *   - Each segment has a groundY (height) and a type
 *   - Skater interpolates onto segment groundY when rolling over it
 *   - Ollie onto elevated surfaces → grind → ollie off
 *   - Gaps require a jump to clear
 *   - Stairs require a jump to clear
 *   - Manual pads trigger manual mode
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

// ─── TUNING ───────────────────────────────────────────────────────────────────
const RUN_SECS      = 60;
const MAX_BAILS     = 3;
const SCROLL        = 3.2;          // world px/frame
const GRAVITY       = 0.7;
const JUMP_VY       = -14;          // px/frame upward
const SKATER_X      = 110;          // fixed screen X (pixels from left)
const GROUND_Y_BASE = 0.72;        // fraction of H for street level
const BAIL_DUR      = 48;           // frames in bail before recover
const LAND_DUR      = 6;            // frames of squish on landing
const GRIND_PTS     = 12;           // pts per grind frame tick
const TAP_MS        = 850;          // tap window duration ms

// Skater pixel height above board

// ─── TERRAIN SEGMENTS ─────────────────────────────────────────────────────────
// Each segment occupies [worldX .. worldX+len] in world space.
// surfaceY = px above street level (0 = street, positive = elevated)
type SegKind =
  | 'street'      // flat ground — always rideable
  | 'ledge'       // elevated rideable surface, grindable
  | 'rail'        // thin elevated rail, grindable
  | 'manual-pad'  // slightly elevated flat, triggers manual
  | 'gap'         // void — must jump to cross
  | 'stairs-up'   // ramps up (visual only, jump to clear)
  | 'bank'        // ramp approach, rideable

interface Seg {
  kind: SegKind;
  worldX: number;
  len: number;          // length in world px
  surfaceY: number;     // px above street (0 = street level)
  grindable: boolean;
  label: string;
  color: string;
  accentColor: string;
}

// ─── LEVEL TERRAIN BUILDER ────────────────────────────────────────────────────
// Builds a concrete terrain sequence for each level.
// Much tighter spacing than before — 5-8 segments in ~2400px of world.
function buildTerrain(levelId: string): Seg[] {
  const street   = (x: number, len: number): Seg =>
    ({ kind:'street',     worldX:x, len, surfaceY:0,  grindable:false, label:'',             color:'',      accentColor:'' });
  const ledge    = (x: number, len: number, h=20): Seg =>
    ({ kind:'ledge',      worldX:x, len, surfaceY:h,  grindable:true,  label:'LEDGE',        color:'#8090a0', accentColor:'#a0b4c8' });
  const rail     = (x: number, len: number): Seg =>
    ({ kind:'rail',       worldX:x, len, surfaceY:22, grindable:true,  label:'RAIL',         color:'#bbb',  accentColor:'#eee' });
  const manpad   = (x: number, len: number): Seg =>
    ({ kind:'manual-pad', worldX:x, len, surfaceY:8,  grindable:false, label:'MANUAL PAD',   color:'#997755', accentColor:'#bb9966' });
  const gap      = (x: number, len: number): Seg =>
    ({ kind:'gap',        worldX:x, len, surfaceY:0,  grindable:false, label:'GAP',          color:'',      accentColor:'' });
  const stairs   = (x: number, len: number): Seg =>
    ({ kind:'stairs-up',  worldX:x, len, surfaceY:0,  grindable:false, label:'STAIRS',       color:'#888',  accentColor:'#aaa' });
  const bank     = (x: number, len: number): Seg =>
    ({ kind:'bank',       worldX:x, len, surfaceY:0,  grindable:false, label:'BANK',         color:'#667',  accentColor:'#889' });

  if (levelId === 'seattle') {
    // Westlake Plaza — parking blocks, ledges, sidewalk gap
    return [
      street(0,   200),
      ledge( 200, 130),          // parking block / low ledge → grind
      street(330, 120),
      gap(   450, 60),           // sidewalk gap → ollie over
      street(510, 100),
      ledge( 610, 160, 22),      // long marble ledge → grind line
      street(770, 90),
      manpad(860, 140),          // manual pad → manual
      street(1000,160),
      stairs(1160,80),           // stair set → ollie
      street(1240,400),
      ledge( 1640,100),
      street(1740,460),
    ];
  }

  if (levelId === 'portland') {
    // Burnside — banks, rails, gaps
    return [
      street(0,   150),
      bank(  150, 100),
      street(250, 80),
      rail(  330, 110),          // DIY rail
      street(440, 90),
      gap(   530, 75),           // bank gap
      street(605, 110),
      ledge( 715, 140, 24),      // crusty ledge
      street(855, 70),
      rail(  925, 130),
      street(1055,120),
      gap(   1175,65),
      street(1240,360),
      bank(  1600,90),
      street(1690,510),
    ];
  }

  // SF — Embarcadero — marble ledges, manual pads, stairs
  return [
    street(0,   160),
    ledge( 160, 180, 20),        // marble ledge #1
    street(340, 80),
    manpad(420, 120),
    street(540, 100),
    ledge( 640, 200, 22),        // long marble ledge
    street(840, 80),
    stairs(920, 90),
    street(1010,80),
    gap(   1090,70),
    street(1160,100),
    ledge( 1260,160, 20),        // hubba
    street(1420,80),
    manpad(1500,140),
    street(1640,560),
  ];
}

// Get the segment at a given world X coordinate
function segAtX(segs: Seg[], wx: number): Seg | null {
  for (const s of segs) {
    if (wx >= s.worldX && wx < s.worldX + s.len) return s;
  }
  return null;
}

// ─── GAME STATE ───────────────────────────────────────────────────────────────
type Phase = 'rolling' | 'airborne' | 'grinding' | 'manual' | 'landing' | 'bailing' | 'finished';

interface GS {
  phase: Phase;
  running: boolean;
  timeLeft: number;
  frame: number;
  worldOffset: number;

  // physics
  skaterY: number;     // px above current terrain surface (0 = on surface)
  skaterVY: number;    // positive = falling
  surfaceY: number;    // current terrain surface height above street

  // trick
  trickId: string | null;
  boardRot: number;
  bodyLean: number;
  tapOpen: boolean;
  tapStart: number;
  tapProg: number;

  // phases
  phaseFrames: number;
  bailCount: number;

  // grind
  grindSeg: Seg | null;
  grindFrames: number;
  sparkTick: number;

  // manual
  manualBal: number;   // -1..1 drift
  manualFrames: number;
  manualDur: number;   // frames

  // scoring
  score: number;
  combo: number;
  trickHistory: TrickResult[];
  lastTrickId: string | null;

  // visual
  walkFrame: number;
  pushFrame: number;   // push cycle
  shakeX: number; shakeY: number; shakeTTL: number;
  sparkX: number; sparkY: number;
}

function makeGS(): GS {
  return {
    phase:'rolling', running:false, timeLeft:RUN_SECS, frame:0, worldOffset:0,
    skaterY:0, skaterVY:0, surfaceY:0,
    trickId:null, boardRot:0, bodyLean:0,
    tapOpen:false, tapStart:0, tapProg:0,
    phaseFrames:0, bailCount:0,
    grindSeg:null, grindFrames:0, sparkTick:0,
    manualBal:0, manualFrames:0, manualDur:0,
    score:0, combo:0, trickHistory:[], lastTrickId:null,
    walkFrame:0, pushFrame:0,
    shakeX:0, shakeY:0, shakeTTL:0, sparkX:0, sparkY:0,
  };
}

// ─── PARTICLES ────────────────────────────────────────────────────────────────
interface P { x:number; y:number; vx:number; vy:number; life:number; ml:number; color:string; r:number; spark:boolean; }
interface FT { x:number; y:number; vy:number; text:string; color:string; size:number; life:number; ml:number; }

// ─── DRAW: BACKGROUND ─────────────────────────────────────────────────────────
function drawBg(ctx: CanvasRenderingContext2D, W: number, H: number, level: Level, wo: number) {
  const [s1,s2,s3] = level.palette.sky;
  const g = ctx.createLinearGradient(0,0,0,H);
  g.addColorStop(0,s1); g.addColorStop(0.55,s2); g.addColorStop(1,s3);
  ctx.fillStyle=g; ctx.fillRect(0,0,W,H);

  const GY = H * GROUND_Y_BASE;

  // ── City landmark silhouettes (parallax 0.15×) ────────────────────────────
  const lOff = (wo * 0.15) % (W * 1.5);

  if (level.id === 'seattle') {
    drawSeattleSkyline(ctx, W, GY, lOff);
  } else if (level.id === 'portland') {
    drawPortlandSkyline(ctx, W, GY, lOff);
  } else {
    drawSFSkyline(ctx, W, GY, lOff);
  }

  // Rain for Seattle
  if (level.id === 'seattle') {
    ctx.save(); ctx.strokeStyle='rgba(160,210,255,0.09)'; ctx.lineWidth=1;
    const ro=(wo*2.2)%68;
    for (let i=0;i<32;i++){
      const rx=((i*61+ro)%W);
      ctx.beginPath(); ctx.moveTo(rx,0); ctx.lineTo(rx-7,GY); ctx.stroke();
    }
    ctx.restore();
  }
}

function drawSeattleSkyline(ctx: CanvasRenderingContext2D, W: number, GY: number, off: number) {
  // Background buildings
  const bldColor = 'rgba(20,35,55,0.85)';
  ctx.fillStyle = bldColor;
  const blds = [
    [0.05, 0.44, 0.08], [0.15, 0.30, 0.06], [0.25, 0.50, 0.09],
    [0.36, 0.36, 0.07], [0.45, 0.55, 0.10], [0.57, 0.32, 0.065],
    [0.65, 0.47, 0.085], [0.75, 0.28, 0.06], [0.83, 0.52, 0.10], [0.93, 0.38, 0.07],
  ];
  for (const [fx, fh, fw] of blds) {
    const bx = ((fx*W*1.5 - off + W*3) % (W*1.5)) - W*0.1;
    const bh = fh * GY;
    ctx.fillRect(bx, GY-bh, fw*W, bh);
    // windows
    ctx.fillStyle = 'rgba(200,225,255,0.12)';
    for (let wy=GY-bh+8; wy<GY-10; wy+=14)
      for (let wx=bx+5; wx<bx+fw*W-8; wx+=11)
        if ((Math.floor(wy/14)+Math.floor(wx/11))%3!==0) ctx.fillRect(wx,wy,5,7);
    ctx.fillStyle = bldColor;
  }

  // Space Needle — iconic, unmistakable
  const nx = ((0.72*W*1.5 - off + W*3) % (W*1.5)) - W*0.05;
  ctx.save();
  ctx.fillStyle = 'rgba(15,30,50,0.95)';
  // base legs
  ctx.beginPath();
  ctx.moveTo(nx-22, GY); ctx.lineTo(nx-5, GY*0.52); ctx.lineTo(nx+5, GY*0.52);
  ctx.lineTo(nx+22, GY); ctx.closePath(); ctx.fill();
  // shaft
  ctx.fillRect(nx-4, GY*0.20, 8, GY*0.32);
  // observation deck saucer
  ctx.beginPath(); ctx.ellipse(nx, GY*0.20, 18, 7, 0, 0, Math.PI*2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(nx, GY*0.17, 10, 4, 0, 0, Math.PI*2); ctx.fill();
  // spire
  ctx.fillRect(nx-2, GY*0.04, 4, GY*0.13);
  // red dot at top
  ctx.fillStyle = 'rgba(255,80,60,0.8)';
  ctx.beginPath(); ctx.arc(nx, GY*0.04, 3, 0, Math.PI*2); ctx.fill();
  ctx.restore();

  // Mt Rainier snow cap far back
  const mOff = ((0.3*W*1.5 - off*0.05 + W*3) % (W*1.5)) - W*0.05;
  ctx.save();
  ctx.fillStyle = 'rgba(40,60,90,0.5)';
  ctx.beginPath();
  ctx.moveTo(mOff - 80, GY); ctx.lineTo(mOff, GY * 0.22); ctx.lineTo(mOff + 80, GY); ctx.closePath(); ctx.fill();
  ctx.fillStyle = 'rgba(220,235,255,0.55)';
  ctx.beginPath();
  ctx.moveTo(mOff - 28, GY * 0.30); ctx.lineTo(mOff, GY * 0.22); ctx.lineTo(mOff + 28, GY * 0.30); ctx.closePath(); ctx.fill();
  ctx.restore();
}

function drawPortlandSkyline(ctx: CanvasRenderingContext2D, W: number, GY: number, off: number) {
  // Dark buildings
  ctx.fillStyle = 'rgba(15,15,30,0.88)';
  const blds = [
    [0.04,0.42,0.075],[0.14,0.28,0.06],[0.22,0.48,0.09],[0.33,0.34,0.07],
    [0.42,0.54,0.10],[0.53,0.30,0.065],[0.62,0.45,0.085],[0.72,0.26,0.06],[0.80,0.50,0.095],[0.91,0.36,0.07],
  ];
  for (const [fx,fh,fw] of blds) {
    const bx=((fx*W*1.5-off+W*3)%(W*1.5))-W*0.1;
    const bh=fh*GY;
    ctx.fillRect(bx, GY-bh, fw*W, bh);
    ctx.fillStyle='rgba(220,90,60,0.18)';
    for (let wy=GY-bh+8; wy<GY-10; wy+=14)
      for (let wx=bx+5; wx<bx+fw*W-8; wx+=11)
        if ((Math.floor(wy/14)+Math.floor(wx/11))%3!==0) ctx.fillRect(wx,wy,5,7);
    ctx.fillStyle='rgba(15,15,30,0.88)';
  }

  // St Johns Bridge — Gothic towers
  const bx2 = ((0.55*W*1.5 - off*0.9 + W*3) % (W*1.5)) - W*0.1;
  ctx.save();
  ctx.fillStyle='rgba(10,12,25,0.92)';
  // main span
  ctx.fillRect(bx2-80, GY*0.58, 160, 8);
  // left tower
  ctx.fillRect(bx2-70, GY*0.25, 12, GY*0.33);
  // right tower
  ctx.fillRect(bx2+58, GY*0.25, 12, GY*0.33);
  // Gothic spires
  const spire = (x: number) => {
    ctx.beginPath(); ctx.moveTo(x-5,GY*0.25); ctx.lineTo(x+6,GY*0.25);
    ctx.lineTo(x+3,GY*0.10); ctx.lineTo(x+1,GY*0.05);
    ctx.lineTo(x-1,GY*0.10); ctx.lineTo(x-3,GY*0.10); ctx.closePath(); ctx.fill();
  };
  spire(bx2-64); spire(bx2+64);
  // cables
  ctx.strokeStyle='rgba(40,50,80,0.7)'; ctx.lineWidth=1.5;
  for (let i=-60; i<=60; i+=15) {
    ctx.beginPath(); ctx.moveTo(bx2-64, GY*0.20); ctx.lineTo(bx2+i, GY*0.58); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(bx2+64, GY*0.20); ctx.lineTo(bx2+i, GY*0.58); ctx.stroke();
  }
  ctx.restore();

  // Underbridge (Burnside feel) — concrete ceiling
  ctx.fillStyle='rgba(20,20,35,0.65)';
  ctx.fillRect(0, GY*0.72, W, 10);
  // Graffiti color blocks under bridge
  const grafColors=['rgba(220,60,60,0.4)','rgba(60,140,220,0.35)','rgba(240,180,0,0.3)','rgba(60,200,100,0.3)'];
  let gx = W*0.05 - (off*0.4 % (W*0.8));
  for (const gc of grafColors) {
    ctx.fillStyle=gc;
    const gw=30+Math.random()*50;
    ctx.fillRect(gx, GY*0.72, gw, 10); gx+=gw+8;
  }
}

function drawSFSkyline(ctx: CanvasRenderingContext2D, W: number, GY: number, off: number) {
  // Warm golden-hour buildings
  ctx.fillStyle='rgba(25,15,10,0.80)';
  const blds=[
    [0.05,0.40,0.07],[0.14,0.32,0.065],[0.23,0.52,0.09],[0.34,0.38,0.075],
    [0.44,0.58,0.10],[0.55,0.34,0.07],[0.64,0.48,0.088],[0.74,0.30,0.065],[0.83,0.54,0.096],[0.93,0.40,0.072],
  ];
  for (const [fx,fh,fw] of blds) {
    const bx=((fx*W*1.5-off+W*3)%(W*1.5))-W*0.1;
    const bh=fh*GY;
    ctx.fillRect(bx,GY-bh,fw*W,bh);
    ctx.fillStyle='rgba(255,200,80,0.22)';
    for (let wy=GY-bh+8;wy<GY-10;wy+=14)
      for (let wx=bx+5;wx<bx+fw*W-8;wx+=11)
        if ((Math.floor(wy/14)+Math.floor(wx/11))%3!==0) ctx.fillRect(wx,wy,5,7);
    ctx.fillStyle='rgba(25,15,10,0.80)';
  }

  // Golden Gate Bridge
  const gx = ((0.62*W*1.5 - off*0.88 + W*3) % (W*1.5)) - W*0.1;
  ctx.save();
  ctx.fillStyle='rgba(180,60,30,0.75)';
  // road deck
  ctx.fillRect(gx-90, GY*0.65, 180, 7);
  // towers
  ctx.fillRect(gx-72, GY*0.25, 10, GY*0.40);
  ctx.fillRect(gx+62, GY*0.25, 10, GY*0.40);
  // tower crossbeams
  ctx.fillRect(gx-74, GY*0.36, 14, 5);
  ctx.fillRect(gx+60, GY*0.36, 14, 5);
  ctx.fillRect(gx-74, GY*0.46, 14, 5);
  ctx.fillRect(gx+60, GY*0.46, 14, 5);
  // cables
  ctx.strokeStyle='rgba(180,60,30,0.55)'; ctx.lineWidth=1.5;
  ctx.beginPath(); ctx.moveTo(gx-72,GY*0.26); ctx.quadraticCurveTo(gx,GY*0.56,gx+62,GY*0.26); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(gx-72,GY*0.30); ctx.quadraticCurveTo(gx,GY*0.60,gx+62,GY*0.30); ctx.stroke();
  for (let i=-80;i<=80;i+=12) {
    const py=GY*0.56 - 0.004*i*i*0.3;
    ctx.beginPath(); ctx.moveTo(gx+i,py); ctx.lineTo(gx+i,GY*0.65); ctx.stroke();
  }
  ctx.restore();

  // Bay water shimmer
  const bayGrd = ctx.createLinearGradient(W*0.5, 0, W, 0);
  bayGrd.addColorStop(0,'transparent');
  bayGrd.addColorStop(1,'rgba(255,160,60,0.08)');
  ctx.fillStyle=bayGrd; ctx.fillRect(0, GY*0.6, W, GY*0.4);
}

// ─── DRAW: TERRAIN ────────────────────────────────────────────────────────────
function drawTerrain(ctx: CanvasRenderingContext2D, W: number, H: number, level: Level, segs: Seg[], wo: number) {
  const GY = H * GROUND_Y_BASE;

  // Street base
  ctx.fillStyle = level.palette.ground;
  ctx.fillRect(0, GY, W, H-GY);
  ctx.fillStyle = 'rgba(0,0,0,0.28)';
  ctx.fillRect(0, GY, W, 3);

  // Pavement joints scrolling
  ctx.strokeStyle='rgba(0,0,0,0.13)'; ctx.lineWidth=1.5;
  const jSp = 76, jO = wo % jSp;
  for (let i=0; i<=Math.ceil(W/jSp)+1; i++) {
    const jx=i*jSp-jO;
    ctx.beginPath(); ctx.moveTo(jx,GY); ctx.lineTo(jx,H); ctx.stroke();
  }

  // Seattle wet reflection
  if (level.id==='seattle') {
    ctx.fillStyle='rgba(90,140,210,0.07)';
    const ro=wo%110;
    for (let i=0;i<12;i++) ctx.fillRect((i*110-ro+W)%W, GY+5, 55, 9);
  }

  // Draw each segment
  for (const seg of segs) {
    const sx = seg.worldX - wo;
    const ex = sx + seg.len;
    if (ex < -20 || sx > W+20) continue;

    const surfPx = seg.surfaceY; // px above street
    const segTop = GY - surfPx;

    switch (seg.kind) {
      case 'ledge':
      case 'manual-pad': {
        const isManPad = seg.kind==='manual-pad';
        const c  = isManPad ? seg.color : seg.color;
        const ca = isManPad ? seg.accentColor : seg.accentColor;
        // shadow
        ctx.fillStyle='rgba(0,0,0,0.22)';
        ctx.fillRect(sx+4, segTop+4, seg.len, surfPx+4);
        // body
        ctx.fillStyle=c;
        ctx.fillRect(sx, segTop, seg.len, surfPx);
        // top surface
        ctx.fillStyle=ca;
        ctx.fillRect(sx, segTop, seg.len, isManPad ? 4 : 5);
        // wax highlight
        ctx.fillStyle='rgba(255,255,255,0.28)';
        ctx.fillRect(sx+3, segTop+1, seg.len-6, 2);
        // front face
        ctx.fillStyle='rgba(0,0,0,0.18)';
        ctx.fillRect(sx, segTop+5, 5, surfPx-5);
        break;
      }
      case 'rail': {
        const railY = GY - surfPx;
        // posts
        ctx.fillStyle='#555';
        ctx.fillRect(sx+10, railY+6, 5, GY-railY-6);
        ctx.fillRect(ex-15, railY+6, 5, GY-railY-6);
        if (seg.len > 60) ctx.fillRect(sx+seg.len/2-2, railY+6, 5, GY-railY-6);
        // tube
        const rg=ctx.createLinearGradient(0,railY,0,railY+6);
        rg.addColorStop(0,'#eee'); rg.addColorStop(0.4,'#bbb'); rg.addColorStop(1,'#888');
        ctx.fillStyle=rg;
        ctx.beginPath(); ctx.roundRect(sx, railY, seg.len, 6, 3); ctx.fill();
        // shine
        ctx.fillStyle='rgba(255,255,255,0.65)'; ctx.fillRect(sx+5, railY+1, seg.len-10, 2);
        break;
      }
      case 'gap': {
        // Void — dark pit
        ctx.fillStyle='rgba(0,0,0,0.55)';
        ctx.fillRect(sx, GY, seg.len, H-GY);
        // edge markings
        ctx.fillStyle='rgba(255,100,40,0.45)';
        ctx.fillRect(sx, GY-2, seg.len, 3);
        ctx.setLineDash([5,4]);
        ctx.strokeStyle='rgba(255,200,0,0.45)'; ctx.lineWidth=1.5;
        ctx.beginPath(); ctx.moveTo(sx,GY); ctx.lineTo(ex,GY); ctx.stroke();
        ctx.setLineDash([]);
        break;
      }
      case 'stairs-up': {
        const steps=5, sw=seg.len/steps, sh=40/steps;
        for (let s=0;s<steps;s++) {
          const stx=sx+s*sw, sty=GY-sh*(steps-s);
          ctx.fillStyle=s%2===0?'#777':'#999';
          ctx.fillRect(stx, sty, sw+1, GY-sty);
          ctx.fillStyle='rgba(255,255,255,0.10)'; ctx.fillRect(stx, sty, sw, 2);
        }
        break;
      }
      case 'bank': {
        ctx.fillStyle=seg.color||'#667';
        ctx.beginPath(); ctx.moveTo(sx,GY); ctx.lineTo(ex,GY-40); ctx.lineTo(ex,GY); ctx.closePath(); ctx.fill();
        ctx.strokeStyle=seg.accentColor||'#889'; ctx.lineWidth=2;
        ctx.beginPath(); ctx.moveTo(sx,GY); ctx.lineTo(ex,GY-40); ctx.stroke();
        break;
      }
    }

    // Label
    if (seg.label) {
      ctx.save(); ctx.globalAlpha=0.5; ctx.fillStyle='#fff';
      ctx.font='8px monospace'; ctx.textAlign='center';
      ctx.fillText(seg.label, sx+seg.len/2, segTop-5);
      ctx.restore();
    }
  }
}

// ─── DRAW: SKATER ─────────────────────────────────────────────────────────────
// Clear, readable silhouette. Beanie, board, body, pushing leg.
function drawSkater(ctx: CanvasRenderingContext2D, sx: number, sy: number, g: GS) {
  ctx.save();
  ctx.translate(sx, sy);

  const isAir    = g.phase==='airborne';
  const isGrind  = g.phase==='grinding';
  const isManual = g.phase==='manual';
  const isBail   = g.phase==='bailing';
  const isLand   = g.phase==='landing';
  const isRoll   = g.phase==='rolling';

  const t = g.walkFrame;
  const pushCycle = Math.sin(g.pushFrame * 0.12);

  // ── BOARD ────────────────────────────────────────────────────────────────
  ctx.save();
  if (isAir)    ctx.rotate((g.boardRot * Math.PI)/180);
  if (isManual) { ctx.rotate(0.18); }
  if (isBail)   { ctx.translate(22,10); ctx.rotate((g.boardRot*Math.PI)/180); }
  if (isLand)   { ctx.scale(1.10, 0.82); }

  // deck
  const DW=40, DH=8;
  const dg=ctx.createLinearGradient(0,-DH/2,0,DH/2);
  dg.addColorStop(0,'#e05535'); dg.addColorStop(0.5,'#c03020'); dg.addColorStop(1,'#801810');
  ctx.fillStyle=dg;
  ctx.beginPath(); ctx.roundRect(-DW/2,-DH/2,DW,DH,4); ctx.fill();
  // grip tape (dark top)
  ctx.fillStyle='rgba(0,0,0,0.5)'; ctx.fillRect(-DW/2+2,-DH/2+1,DW-4,3);
  // deck graphic line
  ctx.fillStyle='rgba(255,255,255,0.20)'; ctx.fillRect(-9,-DH/2+5,18,2);
  // trucks (silver bars)
  ctx.fillStyle='#c0c0c0';
  ctx.fillRect(-DW/2+4, DH/2-3, 12, 5);
  ctx.fillRect( DW/2-16, DH/2-3, 12, 5);
  // wheels (4 circles, view from side shows 2)
  const wR=5;
  ctx.fillStyle='#e8e8e8';
  ctx.beginPath(); ctx.arc(-DW/2+10, DH/2+3, wR, 0, Math.PI*2); ctx.fill();
  ctx.beginPath(); ctx.arc( DW/2-10, DH/2+3, wR, 0, Math.PI*2); ctx.fill();
  // wheel cores
  ctx.fillStyle='#888';
  ctx.beginPath(); ctx.arc(-DW/2+10, DH/2+3, wR*0.42, 0, Math.PI*2); ctx.fill();
  ctx.beginPath(); ctx.arc( DW/2-10, DH/2+3, wR*0.42, 0, Math.PI*2); ctx.fill();
  ctx.restore();

  // ── BAIL RAGDOLL ─────────────────────────────────────────────────────────
  if (isBail) {
    ctx.save(); ctx.rotate(g.boardRot * 0.004);
    // body crumpled
    ctx.fillStyle='#e8c090'; ctx.beginPath(); ctx.arc(18,-14,9,0,Math.PI*2); ctx.fill();
    ctx.strokeStyle='#3355aa'; ctx.lineWidth=6; ctx.lineCap='round';
    ctx.beginPath(); ctx.moveTo(8,-8); ctx.lineTo(-6,0); ctx.lineTo(-16,6); ctx.stroke();
    ctx.strokeStyle='#223';
    ctx.beginPath(); ctx.moveTo(-6,0); ctx.lineTo(-8,14); ctx.lineTo(6,18); ctx.stroke();
    ctx.restore(); ctx.restore(); return;
  }

  // ── LEGS ─────────────────────────────────────────────────────────────────
  ctx.save();
  const DH2=8;

  if (isAir) {
    // Legs tucked up for ollie
    ctx.strokeStyle='#334'; ctx.lineWidth=6; ctx.lineCap='round';
    ctx.beginPath(); ctx.moveTo(-6,-DH2/2); ctx.lineTo(-8,-DH2/2-20); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(7,-DH2/2); ctx.lineTo(10,-DH2/2-18); ctx.stroke();
    // shoes
    ctx.fillStyle='#222'; ctx.beginPath(); ctx.roundRect(-14,-DH2/2-23,14,7,3); ctx.fill();
    ctx.fillStyle='#445'; ctx.beginPath(); ctx.roundRect(6,-DH2/2-21,14,7,3); ctx.fill();
  } else if (isGrind) {
    // Low crouch
    ctx.strokeStyle='#334'; ctx.lineWidth=6; ctx.lineCap='round';
    ctx.beginPath(); ctx.moveTo(-6,-DH2/2); ctx.lineTo(-10,-DH2/2-12); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(7,-DH2/2); ctx.lineTo(12,-DH2/2-10); ctx.stroke();
    ctx.fillStyle='#222'; ctx.beginPath(); ctx.roundRect(-16,-DH2/2-14,12,6,2); ctx.fill();
    ctx.fillStyle='#445'; ctx.beginPath(); ctx.roundRect(8,-DH2/2-13,12,6,2); ctx.fill();
  } else if (isManual) {
    // Back foot down, nose up
    ctx.strokeStyle='#334'; ctx.lineWidth=6; ctx.lineCap='round';
    ctx.beginPath(); ctx.moveTo(-8,-DH2/2); ctx.lineTo(-10,-DH2/2-20); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(8,-DH2/2); ctx.lineTo(8,-DH2/2-10); ctx.stroke();
    ctx.fillStyle='#222'; ctx.beginPath(); ctx.roundRect(-16,-DH2/2-22,14,7,2); ctx.fill();
    ctx.fillStyle='#445'; ctx.beginPath(); ctx.roundRect(4,-DH2/2-12,12,6,2); ctx.fill();
  } else if (isRoll) {
    // Push stride animation
    const push = pushCycle;
    const stride = Math.sin(t*0.14)*5;
    ctx.strokeStyle='#334'; ctx.lineWidth=6; ctx.lineCap='round';
    // back (push) leg
    ctx.beginPath(); ctx.moveTo(-6,-DH2/2); ctx.lineTo(-8+stride,-DH2/2-18); ctx.lineTo(-12+stride*0.5,-DH2/2-8); ctx.stroke();
    // front leg
    ctx.beginPath(); ctx.moveTo(7,-DH2/2); ctx.lineTo(9-stride,-DH2/2-20); ctx.lineTo(13-stride*0.5,-DH2/2-9); ctx.stroke();
    // push foot (sometimes on ground)
    const footY = push>0 ? -DH2/2-9 : -DH2/2-4+push*8;
    ctx.fillStyle='#222'; ctx.beginPath(); ctx.roundRect(-18+stride*0.5, footY-5, 14, 7, 2); ctx.fill();
    ctx.fillStyle='#445'; ctx.beginPath(); ctx.roundRect(9-stride*0.5,-DH2/2-11,13,6,2); ctx.fill();
  } else {
    // Landing squish
    ctx.strokeStyle='#334'; ctx.lineWidth=6; ctx.lineCap='round';
    ctx.beginPath(); ctx.moveTo(-6,-DH2/2); ctx.lineTo(-9,-DH2/2-10); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(7,-DH2/2); ctx.lineTo(10,-DH2/2-10); ctx.stroke();
    ctx.fillStyle='#222'; ctx.beginPath(); ctx.roundRect(-14,-DH2/2-12,12,6,2); ctx.fill();
    ctx.fillStyle='#445'; ctx.beginPath(); ctx.roundRect(7,-DH2/2-12,12,6,2); ctx.fill();
  }

  const legTop = -DH2/2 - 22;
  const torsoH = 18, torsoW = 15;
  const torsoY = isAir ? legTop-torsoH+4 : isGrind ? legTop-torsoH+8 : legTop-torsoH;

  // ── TORSO ────────────────────────────────────────────────────────────────
  ctx.fillStyle='#3355aa';
  ctx.beginPath(); ctx.roundRect(-torsoW/2, torsoY, torsoW, torsoH, 3); ctx.fill();
  // shirt stripe/logo
  ctx.fillStyle='rgba(255,255,255,0.18)'; ctx.fillRect(-4, torsoY+4, 8, 4);

  // ── ARMS ─────────────────────────────────────────────────────────────────
  ctx.lineWidth=5; ctx.lineCap='round';
  const armT = isGrind ? 16 : isManual ? -12 : Math.sin(t*0.14)*8;
  ctx.strokeStyle='#2244aa';
  ctx.beginPath(); ctx.moveTo(-torsoW/2, torsoY+5); ctx.lineTo(-torsoW/2-9, torsoY+14+armT); ctx.stroke();
  ctx.strokeStyle='#4466cc';
  ctx.beginPath(); ctx.moveTo(torsoW/2, torsoY+5); ctx.lineTo(torsoW/2+9, torsoY+12-armT); ctx.stroke();

  // ── NECK ─────────────────────────────────────────────────────────────────
  ctx.fillStyle='#e8c090'; ctx.fillRect(-3, torsoY-5, 6, 7);

  // ── HEAD ─────────────────────────────────────────────────────────────────
  ctx.fillStyle='#e8c090';
  ctx.beginPath(); ctx.arc(1, torsoY-5, 10, 0, Math.PI*2); ctx.fill();

  // ── BEANIE ───────────────────────────────────────────────────────────────
  // Ribbed band at brow
  ctx.fillStyle='#cc1111';
  ctx.beginPath(); ctx.roundRect(-10, torsoY-14, 20, 6, 2); ctx.fill();
  // Main dome
  ctx.fillStyle='#dd2222';
  ctx.beginPath(); ctx.ellipse(1, torsoY-14, 10, 9, 0, Math.PI, 0); ctx.fill();
  // Rib lines on dome
  ctx.strokeStyle='rgba(0,0,0,0.20)'; ctx.lineWidth=1;
  for (let ri=0;ri<3;ri++) {
    ctx.beginPath();
    ctx.ellipse(1, torsoY-13-(ri*2.2), 10-ri*0.5, 1.5, 0, 0, Math.PI*2);
    ctx.stroke();
  }
  // Pom pom
  ctx.fillStyle='#ff4444';
  ctx.beginPath(); ctx.arc(1, torsoY-23, 4, 0, Math.PI*2); ctx.fill();
  ctx.fillStyle='rgba(255,255,255,0.45)';
  ctx.beginPath(); ctx.arc(-0.5, torsoY-24.5, 1.8, 0, Math.PI*2); ctx.fill();

  // ── FACE ─────────────────────────────────────────────────────────────────
  // Sunglasses
  ctx.fillStyle='rgba(10,10,10,0.85)';
  ctx.beginPath(); ctx.roundRect(-8, torsoY-8, 6, 4, 1); ctx.fill();
  ctx.beginPath(); ctx.roundRect(2, torsoY-8, 6, 4, 1); ctx.fill();
  ctx.strokeStyle='#333'; ctx.lineWidth=1;
  ctx.beginPath(); ctx.moveTo(-2, torsoY-6); ctx.lineTo(2, torsoY-6); ctx.stroke();

  ctx.restore();
  ctx.restore();
}

// ─── DRAW: HUD ────────────────────────────────────────────────────────────────
function drawHUD(ctx: CanvasRenderingContext2D, W: number, H: number, g: GS, fts: FT[]) {
  const GY = H * GROUND_Y_BASE;
  ctx.save();
  ctx.shadowColor='rgba(0,0,0,0.9)'; ctx.shadowBlur=8;

  // Score
  ctx.textAlign='right'; ctx.font='bold 32px "Bebas Neue",Impact,sans-serif';
  ctx.fillStyle='#fff'; ctx.fillText(formatScore(g.score), W-14, 48);

  // Timer
  ctx.font='bold 14px monospace';
  ctx.fillStyle = g.timeLeft<=10 ? '#ff4444' : 'rgba(255,255,255,0.75)';
  ctx.fillText(`${g.timeLeft}s`, W-14, 66);

  // Bail dots
  ctx.textAlign='left'; ctx.font='9px monospace'; ctx.shadowBlur=4;
  ctx.fillStyle='rgba(255,255,255,0.4)'; ctx.fillText('BAILS', 14, 28);
  for (let i=0;i<MAX_BAILS;i++) {
    ctx.fillStyle = i<g.bailCount ? '#ff4444' : 'rgba(255,255,255,0.15)';
    ctx.beginPath(); ctx.arc(16+i*18, 38, 6, 0, Math.PI*2); ctx.fill();
  }

  // Combo
  const cMult = comboToMultiplier(g.combo);
  if (g.combo>=2) {
    ctx.textAlign='center'; ctx.shadowColor='rgba(255,200,0,0.8)'; ctx.shadowBlur=16;
    ctx.font=`bold ${cMult>=5?30:24}px "Bebas Neue",Impact,sans-serif`;
    ctx.fillStyle='#FFD700'; ctx.fillText(`x${cMult} COMBO`, W/2, 52);
    ctx.shadowBlur=8;
  }

  // Tap meter
  if (g.tapOpen) {
    const TW=150, TH=14, tx=W/2-TW/2, ty=GY-78;
    ctx.shadowBlur=0;
    ctx.fillStyle='rgba(0,0,0,0.75)';
    ctx.beginPath(); ctx.roundRect(tx-4,ty-20,TW+8,TH+28,7); ctx.fill();
    // zones
    ctx.fillStyle='#00c85a'; ctx.beginPath(); ctx.roundRect(tx,ty,TW*0.35,TH,[5,0,0,5]); ctx.fill();
    ctx.fillStyle='#e8b800'; ctx.fillRect(tx+TW*0.35,ty,TW*0.30,TH);
    ctx.fillStyle='#e03030'; ctx.beginPath(); ctx.roundRect(tx+TW*0.65,ty,TW*0.35,TH,[0,5,5,0]); ctx.fill();
    // cursor
    const cp=tx+TW*g.tapProg;
    ctx.fillStyle='#fff'; ctx.shadowColor='#fff'; ctx.shadowBlur=12;
    ctx.fillRect(cp-2.5,ty-3,5,TH+6);
    ctx.shadowBlur=8;
    // labels
    ctx.textAlign='center'; ctx.font='bold 10px monospace';
    ctx.fillStyle='#fff'; ctx.shadowColor='#000'; ctx.shadowBlur=4;
    ctx.fillText('TAP TO LAND', W/2, ty-6);
    const ql=g.tapProg<0.35?'CLEAN ✓':g.tapProg<0.65?'SKETCHY':'⚠ BAIL';
    const qc=g.tapProg<0.35?'#00ff88':g.tapProg<0.65?'#FFD700':'#ff4444';
    ctx.fillStyle=qc; ctx.shadowBlur=0; ctx.font='bold 10px monospace';
    ctx.fillText(ql, W/2, ty+TH+12);
  }

  // Grind indicator
  if (g.phase==='grinding') {
    ctx.textAlign='center'; ctx.shadowColor='#FFD700'; ctx.shadowBlur=14;
    ctx.font='bold 14px "Bebas Neue",Impact,sans-serif';
    ctx.fillStyle='#FFD700'; ctx.fillText('GRINDING  +POINTS', W/2, GY-88);
    ctx.shadowBlur=6;
  }

  // Manual balance bar
  if (g.phase==='manual') {
    const BW=110, BH=10, bx=W/2-BW/2, by=H-58;
    ctx.shadowBlur=0;
    ctx.fillStyle='rgba(0,0,0,0.6)'; ctx.beginPath(); ctx.roundRect(bx,by,BW,BH,5); ctx.fill();
    const bal=(g.manualBal+1)/2;
    const balColor=Math.abs(g.manualBal)>0.65?'#ff4444':'#00ff88';
    ctx.fillStyle=balColor; ctx.fillRect(bx+2,by+2,(BW-4)*bal,BH-4);
    // center line
    ctx.fillStyle='rgba(255,255,255,0.8)'; ctx.fillRect(bx+BW/2-1.5,by,3,BH);
    ctx.textAlign='center'; ctx.font='bold 10px monospace';
    ctx.fillStyle='rgba(255,255,255,0.7)'; ctx.fillText('BALANCE', W/2, by-6);
  }

  // Phase hint bottom-right (contextual)
  const hint = g.phase==='rolling' ? '↑ OLLIE  ← KICK  → HEEL  ↓ MANUAL' : '';
  if (hint) {
    ctx.textAlign='center'; ctx.font='9px monospace'; ctx.shadowBlur=4; ctx.shadowColor='rgba(0,0,0,0.9)';
    ctx.fillStyle='rgba(255,255,255,0.3)'; ctx.fillText(hint, W/2, H-14);
  }

  // Float texts
  ctx.shadowBlur=10; ctx.shadowColor='rgba(0,0,0,0.95)';
  for (const ft of fts) {
    ctx.save(); ctx.globalAlpha=ft.life/ft.ml;
    ctx.textAlign='center';
    ctx.font=`bold ${ft.size}px "Bebas Neue",Impact,sans-serif`;
    ctx.fillStyle=ft.color; ctx.fillText(ft.text, ft.x, ft.y);
    ctx.restore();
  }
  ctx.restore();
}

// ─── PARTICLES ────────────────────────────────────────────────────────────────
function drawParticles(ctx: CanvasRenderingContext2D, ps: P[]) {
  for (const p of ps) {
    const a=p.life/p.ml;
    ctx.save(); ctx.globalAlpha=a;
    if (p.spark) { ctx.shadowColor=p.color; ctx.shadowBlur=8; }
    ctx.fillStyle=p.color;
    ctx.beginPath(); ctx.arc(p.x, p.y, Math.max(0.1,p.r*a), 0, Math.PI*2); ctx.fill();
    ctx.restore();
  }
}

// ─── COMPONENT ────────────────────────────────────────────────────────────────
export const SkateRun: React.FC<Props> = ({ level, player, levelIndex, onComplete, onBack }) => {
  const canvasRef  = useRef<HTMLCanvasElement>(null);
  const gsRef      = useRef<GS>(makeGS());
  const segsRef    = useRef<Seg[]>(buildTerrain(level.id));
  const psRef      = useRef<P[]>([]);
  const ftsRef     = useRef<FT[]>([]);
  const rafRef     = useRef<number>(0);
  const secRef     = useRef<ReturnType<typeof setInterval>|null>(null);
  const touchRef   = useRef<{x:number;y:number;t:number;moved:boolean}|null>(null);
  const holdRef    = useRef<ReturnType<typeof setTimeout>|null>(null);
  const doneRef    = useRef(false);
  const [scrPhase, setScrPhase] = useState<'idle'|'running'|'finished'>('idle');

  const tricks = getTricksForLevel(levelIndex).filter(t => player.unlockedTricks.includes(t.id));

  function trickFor(dir: SwipeDirection, hold: boolean) {
    const g2 = hold ? `hold-${dir}` as const : `swipe-${dir}` as const;
    const cs = tricks.filter(t => t.gesture===g2);
    if (!cs.length) return null;
    return cs.reduce((b,t)=>t.unlockLevel>b.unlockLevel?t:b, cs[0]);
  }

  const emit = useCallback((cx:number, cy:number, spark:boolean, color:string, n:number) => {
    for (let i=0;i<n;i++) psRef.current.push({
      x:cx+(Math.random()-.5)*20, y:cy,
      vx:(Math.random()-.5)*8, vy:-1.5-Math.random()*5,
      life:24+Math.random()*22, ml:46, color, r:2.5+Math.random()*2.5, spark,
    });
  },[]);

  const float = useCallback((x:number,y:number,text:string,color:string,size:number)=>{
    ftsRef.current.push({x,y,vy:-0.9,text,color,size,life:72,ml:72});
  },[]);

  // ── RESOLVE TRICK (guarded, single-fire) ──────────────────────────────────
  const resolveTrick = useCallback((prog: number) => {
    const g = gsRef.current;
    if (!g.tapOpen) return;
    if (g.phase!=='airborne') return;
    const trick = g.trickId ? ALL_TRICKS.find(t=>t.id===g.trickId) : null;
    g.tapOpen=false; g.trickId=null;

    const canvas=canvasRef.current;
    const H=canvas?.offsetHeight??812;
    const GY=H*GROUND_Y_BASE;
    const cx=SKATER_X, cy=GY-g.surfaceY-g.skaterY;

    const quality: TrickResult['landingQuality'] =
      prog<=0.35?'perfect' : prog<=0.65?'clean' : prog<=0.82?'sloppy' : 'bail';

    if (quality==='bail'||!trick) {
      g.phase='bailing'; g.phaseFrames=BAIL_DUR;
      g.boardRot=90+Math.random()*160;
      g.bailCount++; g.combo=0;
      emit(cx,cy,false,'#ff4444',10);
      float(cx,cy-46,'BAIL!','#ff4444',32);
      float(cx,cy-74,`${g.bailCount}/${MAX_BAILS} BAILS`,'#ff8866',13);
      return;
    }

    // Score it
    const result=scoreTrick(trick,quality,g.combo);
    g.score+=result.total; g.combo=quality==='sloppy'?Math.max(0,g.combo-1):g.combo+1;
    g.lastTrickId=trick.id; g.trickHistory.push(result);
    g.phase='landing'; g.phaseFrames=LAND_DUR;
    g.boardRot=0; g.bodyLean=0;

    const isClean=quality==='perfect'||quality==='clean';
    const lbl=isClean?'CLEAN LANDING':'SKETCHY LANDING';
    const lc=isClean?'#00ff88':'#ffcc44';
    const mult=comboToMultiplier(g.combo);
    if (isClean){g.shakeTTL=7; emit(cx,cy,true,'#FFD700',18);}
    else emit(cx,cy,false,'#ff8833',10);
    float(cx,cy-44,trick.name.toUpperCase(),'#fff',28);
    float(cx,cy-72,lbl,lc,13);
    float(cx,cy-90,`+${formatScore(result.total)}`,'#ff6b35',18);
    if (g.combo>=2) float(cx,cy-112,`COMBO x${mult}`,'#FFD700',13);
  },[emit,float]);

  // ── GESTURE HANDLER ───────────────────────────────────────────────────────
  const onGesture = useCallback((dir: SwipeDirection, hold: boolean) => {
    const g=gsRef.current;
    if (!g.running) return;
    if (g.phase!=='rolling'&&g.phase!=='landing') return;
    if (g.tapOpen) return;

    const trick=trickFor(dir,hold);
    if (!trick) return;

    const canvas=canvasRef.current;
    const H=canvas?.offsetHeight??812;
    const GY=H*GROUND_Y_BASE;
    const cx=SKATER_X;
    void cx;

    // Air tricks (up/left/right non-hold)
    if (!hold && (dir==='up'||dir==='left'||dir==='right')) {
      // Check if near a grindable surface to auto-grind instead of air trick
      // (if swipe up near a ledge/rail, ollie onto it and auto-grind)
      const skaterWX = g.worldOffset + SKATER_X + 20; // slightly ahead
      const ahead = segsRef.current.find(s => {
        const rel = s.worldX - g.worldOffset;
        return s.grindable && rel > SKATER_X-10 && rel < SKATER_X+90;
      });

      if (dir==='up' && ahead && g.surfaceY===0) {
        // Ollie onto ledge/rail — auto-mount
        g.skaterVY = JUMP_VY;
        g.phase='airborne';
        g.trickId='ollie';
        g.boardRot=0; g.bodyLean=0;
        // We'll detect landing on the surface in physics
        g.tapOpen=false; // no manual tap needed for mount
        void skaterWX;
        return;
      }

      g.skaterVY = JUMP_VY - player.stats.pop*0.22;
      g.phase='airborne';
      g.trickId=trick.id;
      g.boardRot=0; g.bodyLean=0;
      g.tapOpen=true; g.tapStart=Date.now(); g.tapProg=0;
      return;
    }

    // Manual
    if (!hold && dir==='down') {
      const seg = segsRef.current.find(s => {
        const rel=s.worldX-g.worldOffset;
        return s.kind==='manual-pad' && rel>SKATER_X-40 && rel<SKATER_X+80;
      });
      g.phase='manual';
      g.trickId=trick.id;
      g.manualBal=0; g.manualFrames=0;
      g.manualDur=Math.round((1100+player.stats.balance*180)/16.67);
      const cy=GY-(seg?.surfaceY??0);
      float(cx,cy-54,'MANUAL','#fff',24);
      void seg;
      return;
    }

    // Grind (hold gesture)
    if (hold) {
      const ahead2 = segsRef.current.find(s=>{
        const rel=s.worldX-g.worldOffset;
        return s.grindable && rel>SKATER_X-50 && rel<SKATER_X+120;
      });
      if (!ahead2) return;
      g.phase='grinding';
      g.trickId=trick.id;
      g.grindSeg=ahead2;
      g.grindFrames=0; g.sparkTick=0;
      g.surfaceY=ahead2.surfaceY;
      g.skaterY=0; g.skaterVY=0;
      const cy=GY-g.surfaceY;
      float(cx,cy-52,trick.name.toUpperCase(),'#FFD700',22);
    }
  },[tricks,player,float]);

  const onTap=useCallback(()=>{
    const g=gsRef.current;
    if (g.tapOpen&&g.trickId) resolveTrick(g.tapProg);
  },[resolveTrick]);

  // Touch handlers
  const onTS=useCallback((e:React.TouchEvent)=>{
    const t=e.touches[0];
    touchRef.current={x:t.clientX,y:t.clientY,t:Date.now(),moved:false};
    holdRef.current=setTimeout(()=>{
      if (touchRef.current&&!touchRef.current.moved) onGesture('up',true);
    },260);
  },[onGesture]);

  const onTM=useCallback((e:React.TouchEvent)=>{
    if (!touchRef.current) return;
    const t=e.touches[0];
    if (Math.hypot(t.clientX-touchRef.current.x,t.clientY-touchRef.current.y)>10)
      touchRef.current.moved=true;
  },[]);

  const onTE=useCallback((e:React.TouchEvent)=>{
    if (holdRef.current) clearTimeout(holdRef.current);
    if (!touchRef.current) return;
    const t=e.changedTouches[0];
    const dx=t.clientX-touchRef.current.x, dy=t.clientY-touchRef.current.y;
    const dist=Math.hypot(dx,dy);
    touchRef.current=null;
    if (dist<20) { onTap(); }
    else if (dist>=30) {
      const dir:SwipeDirection=Math.abs(dy)>Math.abs(dx)?(dy<0?'up':'down'):(dx>0?'right':'left');
      onGesture(dir,false);
    }
  },[onTap,onGesture]);

  // Also handle mouse for desktop testing
  const mouseRef = useRef<{x:number;y:number;t:number}|null>(null);
  const onMD=useCallback((e:React.MouseEvent)=>{
    mouseRef.current={x:e.clientX,y:e.clientY,t:Date.now()};
  },[]);
  const onMU=useCallback((e:React.MouseEvent)=>{
    if (!mouseRef.current) return;
    const dx=e.clientX-mouseRef.current.x, dy=e.clientY-mouseRef.current.y;
    const dist=Math.hypot(dx,dy);
    const dt=Date.now()-mouseRef.current.t;
    mouseRef.current=null;
    if (dist<15&&dt<250) { onTap(); return; }
    if (dist>=30) {
      const dir:SwipeDirection=Math.abs(dy)>Math.abs(dx)?(dy<0?'up':'down'):(dx>0?'right':'left');
      onGesture(dir,false);
    }
  },[onTap,onGesture]);

  // Keyboard for desktop testing
  useEffect(()=>{
    const kd=(e:KeyboardEvent)=>{
      const map:Record<string,()=>void>={
        'ArrowUp':()=>onGesture('up',false),
        'ArrowLeft':()=>onGesture('left',false),
        'ArrowRight':()=>onGesture('right',false),
        'ArrowDown':()=>onGesture('down',false),
        ' ':()=>onTap(),
        'g':()=>onGesture('up',true),
      };
      map[e.key]?.();
    };
    window.addEventListener('keydown',kd);
    return ()=>window.removeEventListener('keydown',kd);
  },[onGesture,onTap]);

  const startRun=useCallback(()=>{
    gsRef.current=makeGS(); gsRef.current.running=true;
    segsRef.current=buildTerrain(level.id);
    psRef.current=[]; ftsRef.current=[]; doneRef.current=false;
    setScrPhase('running');
    secRef.current=setInterval(()=>{
      const g=gsRef.current;
      if (!g.running) return;
      g.timeLeft=Math.max(0,g.timeLeft-1);
      if (g.timeLeft===0) {
        g.running=false; g.phase='finished';
        clearInterval(secRef.current!);
        if (!doneRef.current){doneRef.current=true; setScrPhase('finished'); setTimeout(()=>onComplete(g.score,g.trickHistory),1100);}
      }
    },1000);
  },[level,onComplete]);

  // ── RAF LOOP ───────────────────────────────────────────────────────────────
  useEffect(()=>{
    const canvas=canvasRef.current; if (!canvas) return;
    const ctx=canvas.getContext('2d')!;

    const resize=()=>{
      const dpr=window.devicePixelRatio||1;
      canvas.width=canvas.offsetWidth*dpr; canvas.height=canvas.offsetHeight*dpr;
      ctx.scale(dpr,dpr);
    };
    resize(); window.addEventListener('resize',resize);

    const loop=()=>{
      const W=canvas.offsetWidth, H=canvas.offsetHeight;
      const GY=H*GROUND_Y_BASE;
      const g=gsRef.current, segs=segsRef.current;

      // ── UPDATE ────────────────────────────────────────────────────────
      if (g.running) {
        g.frame++; g.walkFrame++; g.pushFrame++;
        g.worldOffset += SCROLL + player.stats.speed*0.06;

        // Current terrain surface at skater world position
        const skaterWX = g.worldOffset + SKATER_X;
        const seg = segAtX(segs, skaterWX);
        const targetSurfY = (seg && seg.kind!=='gap') ? seg.surfaceY : 0;

        // ── PHYSICS ───────────────────────────────────────────────────
        if (g.phase==='grinding') {
          // Snap to grind surface
          if (g.grindSeg) {
            const gr=g.grindSeg;
            const grSX = gr.worldX - g.worldOffset;
            if (grSX + gr.len < SKATER_X - 10) {
              // Grind ended — exit
              const tr=g.trickId?ALL_TRICKS.find(t=>t.id===g.trickId):null;
              if (tr) {
                const res=scoreTrick(tr,'clean',g.combo);
                g.score+=res.total+BONUS_GRIND_SPARK; g.combo++;
                g.trickHistory.push(res);
                const cy=GY-g.surfaceY;
                float(SKATER_X,cy-50,'GRIND!','#FFD700',24);
                float(SKATER_X,cy-74,`+${formatScore(res.total+BONUS_GRIND_SPARK)}`,'#ff6b35',18);
                float(SKATER_X,cy-96,`COMBO x${comboToMultiplier(g.combo)}`,'#FFD700',13);
                g.shakeTTL=6;
              }
              g.phase='rolling'; g.skaterY=0; g.skaterVY=0;
              g.surfaceY=targetSurfY; g.grindSeg=null; g.trickId=null;
              g.boardRot=0;
            } else {
              g.surfaceY=gr.surfaceY;
              g.skaterY=0; g.skaterVY=0;
              // sparks
              g.sparkTick++;
              if (g.sparkTick%3===0) {
                for (let i=0;i<4;i++) psRef.current.push({
                  x:SKATER_X+(Math.random()-.5)*16, y:GY-g.surfaceY-4,
                  vx:(Math.random()-.5)*6, vy:-.5-Math.random()*3,
                  life:16, ml:16, color:Math.random()>.5?'#FFD700':'#ff9900', r:2.5, spark:true,
                });
              }
              // trickle points
              if (g.grindFrames%6===0) g.score+=Math.round(GRIND_PTS*comboToMultiplier(g.combo+1));
              g.grindFrames++;
            }
          }
        } else if (g.phase==='manual') {
          // Keep on surface
          g.surfaceY=targetSurfY;
          g.manualBal+=(Math.random()-.50)*0.038;
          g.manualBal=Math.max(-1,Math.min(1,g.manualBal));
          g.manualFrames++;
          if (g.manualFrames>=g.manualDur) {
            const bal=Math.abs(g.manualBal);
            const mq:TrickResult['landingQuality']=bal<0.5?'clean':bal<0.75?'sloppy':'bail';
            const tr=g.trickId?ALL_TRICKS.find(t=>t.id===g.trickId):null;
            if (tr&&mq!=='bail'){
              const res=scoreTrick(tr,mq,g.combo); g.score+=res.total; g.combo++; g.trickHistory.push(res);
              float(SKATER_X,GY-g.surfaceY-50,'MANUAL DONE','#00ff88',22);
              float(SKATER_X,GY-g.surfaceY-74,`+${formatScore(res.total)}`,'#ff6b35',16);
            } else if (mq==='bail') {
              float(SKATER_X,GY-g.surfaceY-50,'BAILED MANUAL','#ff4444',18); g.combo=0;
            }
            g.phase='rolling'; g.trickId=null;
          }
        } else {
          // Gravity on non-grind/non-manual phases
          if (g.phase==='airborne') {
            g.skaterVY+=GRAVITY;
            g.skaterY-=g.skaterVY;
            // Board rotation
            const tr=ALL_TRICKS.find(t=>t.id===g.trickId);
            if (tr?.category==='flip') {
              const dir=(tr.id==='heelflip'||tr.id==='inward-heel')?-1:1;
              g.boardRot+=16*dir;
            } else if (tr?.category==='ollie'||!tr) {
              g.bodyLean=Math.min(g.bodyLean+1.5,10);
            }

            // Landing detection — did we land on a surface?
            const landSurf = segAtX(segs, skaterWX);
            const landY = landSurf&&landSurf.kind!=='gap' ? landSurf.surfaceY : 0;

            if (g.skaterY <= 0) {
              g.skaterY=0; g.skaterVY=0;
              g.surfaceY=landY;

              if (g.tapOpen) {
                // Missed tap — auto bail
                resolveTrick(1.0);
              } else if (!g.tapOpen && g.trickId===null) {
                // Plain ollie mount onto surface
                g.phase='landing'; g.phaseFrames=LAND_DUR;
                g.surfaceY=landY;
                if (landY>0) {
                  // Mounted onto ledge/rail
                  float(SKATER_X, GY-landY-50, 'ON THE LEDGE', '#FFD700', 16);
                  g.phase='grinding'; // auto-start grind on mount
                  const mountSeg=segs.find(s=>s.grindable&&Math.abs(s.worldX-skaterWX)<s.len+30);
                  if (mountSeg) { g.grindSeg=mountSeg; g.grindFrames=0; g.sparkTick=0; g.trickId='nosegrind'; }
                  else { g.phase='rolling'; }
                } else {
                  g.phase='rolling';
                }
              }
            } else if (g.skaterY > 0 && landY > g.surfaceY && g.skaterY+g.surfaceY <= landY+4) {
              // Landing on top of an elevated surface
              g.skaterY=0; g.skaterVY=0; g.surfaceY=landY;
              if (g.tapOpen) resolveTrick(g.tapProg);
              else g.phase='landing', g.phaseFrames=LAND_DUR;
            }

            // Fell into a gap — bail
            if (seg?.kind==='gap' && g.skaterY <= -20) {
              if (!g.tapOpen) { // wasn't already resolving
                g.tapOpen=false; g.trickId=null;
                g.phase='bailing'; g.phaseFrames=BAIL_DUR;
                g.boardRot=140; g.bailCount++; g.combo=0;
                emit(SKATER_X,GY-10,false,'#ff4444',12);
                float(SKATER_X,GY-60,'FELL IN!','#ff4444',28);
              }
            }
          } else {
            // Rolling / landing / bailing — snap to terrain surface
            if (g.phase==='rolling'||g.phase==='landing') {
              // Smoothly follow terrain height
              const diff = targetSurfY - g.surfaceY;
              if (Math.abs(diff) > 40) {
                // Big drop — fall
                if (diff < 0 && g.skaterY===0) {
                  g.skaterVY=0; // will fall naturally below
                }
                g.surfaceY = targetSurfY;
              } else {
                g.surfaceY += diff * 0.25; // smooth follow
              }
              g.skaterY=0; g.skaterVY=0;

              // Gap under feet while rolling — fall and bail
              if (seg?.kind==='gap') {
                g.phase='bailing'; g.phaseFrames=BAIL_DUR;
                g.boardRot=110; g.bailCount++; g.combo=0;
                emit(SKATER_X,GY-g.surfaceY,false,'#ff4444',10);
                float(SKATER_X,GY-g.surfaceY-50,'FELL IN!','#ff4444',26);
              }
            }
          }

          // Landing squish → rolling
          if (g.phase==='landing') {
            g.phaseFrames--;
            if (g.phaseFrames<=0) { g.phase='rolling'; g.boardRot=0; g.bodyLean=0; }
          }

          // Bail countdown → recover
          if (g.phase==='bailing') {
            g.phaseFrames--;
            g.boardRot+=3.5;
            g.surfaceY=targetSurfY; // recover on current surface
            if (g.phaseFrames<=0) {
              if (g.bailCount>=MAX_BAILS) {
                if (!doneRef.current) {
                  doneRef.current=true; g.running=false; g.phase='finished';
                  clearInterval(secRef.current!);
                  setScrPhase('finished');
                  setTimeout(()=>onComplete(g.score,g.trickHistory),1100);
                }
              } else {
                g.phase='rolling'; g.skaterY=0; g.skaterVY=0; g.boardRot=0; g.bodyLean=0;
              }
            }
          }
        }

        // Tap window progress
        if (g.tapOpen) {
          g.tapProg=Math.min((Date.now()-g.tapStart)/TAP_MS,1);
          if (g.tapProg>=1) resolveTrick(1.0);
        }

        // Shake
        if (g.shakeTTL>0){g.shakeX=(Math.random()-.5)*5;g.shakeY=(Math.random()-.5)*4;g.shakeTTL--;}
        else{g.shakeX=0;g.shakeY=0;}
      }

      // Particles + floats
      psRef.current=psRef.current.filter(p=>p.life>0).map(p=>({...p,x:p.x+p.vx,y:p.y+p.vy,vy:p.vy+0.15,life:p.life-1}));
      ftsRef.current=ftsRef.current.filter(f=>f.life>0).map(f=>({...f,y:f.y+f.vy,life:f.life-1}));

      // ── DRAW ──────────────────────────────────────────────────────────
      ctx.save();
      ctx.translate(gsRef.current.shakeX, gsRef.current.shakeY);
      drawBg(ctx,W,H,level,gsRef.current.worldOffset);
      drawTerrain(ctx,W,H,level,segs,gsRef.current.worldOffset);

      const g2=gsRef.current;
      const skaterScreenY = H*GROUND_Y_BASE - g2.surfaceY - g2.skaterY;
      drawSkater(ctx, SKATER_X, skaterScreenY, g2);
      drawParticles(ctx, psRef.current);
      drawHUD(ctx, W, H, g2, ftsRef.current);
      ctx.restore();

      rafRef.current=requestAnimationFrame(loop);
    };

    rafRef.current=requestAnimationFrame(loop);
    return ()=>{cancelAnimationFrame(rafRef.current); window.removeEventListener('resize',resize);};
  },[level,player,resolveTrick,float,emit,onComplete]);

  useEffect(()=>()=>{clearInterval(secRef.current!);},[]);

  // ── FINISHED ─────────────────────────────────────────────────────────────
  if (scrPhase==='finished') {
    const g=gsRef.current;
    const grade=getLetterGrade(g.score);
    const gc=getGradeColor(grade);
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
          {g.trickHistory.length} TRICKS · {g.bailCount} BAILS
        </div>
        <div style={{color:'rgba(255,255,255,0.2)',fontSize:10,fontFamily:'monospace',letterSpacing:2,marginTop:8}}>
          SAVING...
        </div>
      </div>
    );
  }

  // ── CANVAS VIEW ───────────────────────────────────────────────────────────
  return (
    <div style={{position:'relative',width:'100%',height:'100dvh',overflow:'hidden',
      background:'#111',touchAction:'none',userSelect:'none',cursor:'pointer'}}
      onTouchStart={scrPhase==='running'?onTS:undefined}
      onTouchMove={scrPhase==='running'?onTM:undefined}
      onTouchEnd={scrPhase==='running'?onTE:undefined}
      onMouseDown={scrPhase==='running'?onMD:undefined}
      onMouseUp={scrPhase==='running'?onMU:undefined}
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
            textAlign:'center',maxWidth:280,lineHeight:1.7}}>{level.description}</div>

          <div style={{background:'rgba(255,255,255,0.05)',border:'1px solid rgba(255,255,255,0.1)',
            borderRadius:12,padding:'16px 18px',width:'100%',maxWidth:310}}>
            <div style={{color:'rgba(255,255,255,0.35)',fontSize:9,fontFamily:'monospace',
              letterSpacing:3,marginBottom:12,textAlign:'center'}}>HOW TO SKATE</div>
            <div style={{display:'grid',gridTemplateColumns:'auto 1fr',gap:'7px 14px'}}>
              {[
                ['↑ Swipe Up','Ollie / Jump'],
                ['← Swipe Left','Kickflip'],
                ['→ Swipe Right','Heelflip'],
                ['↓ Swipe Down','Manual'],
                ['Hold + Swipe','Grind nearby rail/ledge'],
                ['Tap (in air)','Land — aim for GREEN'],
              ].map(([g2,n])=>(
                <React.Fragment key={g2}>
                  <span style={{color:'#ff6b35',fontSize:10,fontFamily:'monospace',whiteSpace:'nowrap'}}>{g2}</span>
                  <span style={{color:'rgba(255,255,255,0.45)',fontSize:10,fontFamily:'monospace'}}>{n}</span>
                </React.Fragment>
              ))}
            </div>
            <div style={{marginTop:12,paddingTop:10,borderTop:'1px solid rgba(255,255,255,0.08)',
              color:'rgba(255,255,255,0.35)',fontSize:9,fontFamily:'monospace',
              textAlign:'center',lineHeight:1.7}}>
              Miss the tap = BAIL · 3 bails = RUN OVER<br/>
              Auto-recover after bails 1 &amp; 2
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
