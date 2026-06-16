import React, { useEffect, useRef } from 'react';
import type { Player } from '../game/types';
import { formatScore } from '../game/scoring';
import { CITIES } from '../game/cities';
import { clearSave } from '../game/save';

interface Props {
  player: Player;
  onPlay: () => void;
  onReset: () => void;
}

export const MainMenu: React.FC<Props> = ({ player, onPlay, onReset }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    const resize = () => { canvas.width = canvas.offsetWidth; canvas.height = canvas.offsetHeight; };
    resize(); window.addEventListener('resize', resize);
    const particles: Array<{ x: number; y: number; vx: number; vy: number; size: number; color: string; alpha: number }> = [];
    for (let i = 0; i < 55; i++) particles.push({ x: Math.random() * window.innerWidth, y: Math.random() * window.innerHeight, vx: (Math.random() - 0.5) * 0.4, vy: -0.3 - Math.random() * 0.5, size: 1 + Math.random() * 3, color: ['#ff6b35','#f7c59f','#ffffff','#5bc0eb'][Math.floor(Math.random()*4)], alpha: 0.1 + Math.random() * 0.4 });
    let t = 0;
    const draw = () => {
      t += 0.004;
      const W = canvas.width, H = canvas.height;
      const g = ctx.createLinearGradient(0, 0, W, H);
      g.addColorStop(0, `hsl(${(t * 18) % 360},70%,6%)`);
      g.addColorStop(1, `hsl(${(t * 18 + 140) % 360},60%,4%)`);
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      particles.forEach(p => {
        p.x += p.vx; p.y += p.vy;
        if (p.y < -5) { p.y = H + 5; p.x = Math.random() * W; }
        ctx.globalAlpha = p.alpha; ctx.fillStyle = p.color;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.fill();
      });
      ctx.globalAlpha = 1;
      rafRef.current = requestAnimationFrame(draw);
    };
    draw();
    return () => { cancelAnimationFrame(rafRef.current); window.removeEventListener('resize', resize); };
  }, []);

  const unlockedCount = player.unlockedCities.length;
  const beatenCount = player.rivalsBeaten.length;

  return (
    <div style={{ position: 'relative', width: '100%', height: '100dvh', overflow: 'hidden', fontFamily: "'Bebas Neue',Impact,sans-serif" }}>
      <canvas ref={canvasRef} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} />
      <div style={{ position: 'relative', zIndex: 10, display: 'flex', flexDirection: 'column', alignItems: 'center', height: '100%', padding: '0 24px' }}>
        <div style={{ marginTop: '10vh', textAlign: 'center' }}>
          <div style={{ fontSize: 11, letterSpacing: 6, color: '#ff6b35', fontFamily: 'monospace', marginBottom: 8 }}>SKATE ACROSS AMERICA</div>
          <div style={{ fontSize: 'clamp(72px,22vw,110px)', fontWeight: 900, lineHeight: 0.85, background: 'linear-gradient(135deg,#ff6b35 0%,#f7c59f 40%,#ffffff 70%,#ff6b35 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', filter: 'drop-shadow(0 0 40px rgba(255,107,53,0.5))' }}>THE<br />GNAR</div>
          <div style={{ fontSize: 10, letterSpacing: 4, color: 'rgba(255,255,255,0.3)', fontFamily: 'monospace', marginTop: 10 }}>ENDLESS RUNNER</div>
        </div>

        <div style={{ marginTop: 28, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,107,53,0.2)', borderRadius: 12, padding: '14px 20px', width: '100%', maxWidth: 340, display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, textAlign: 'center' }}>
          {[['BEST', formatScore(Math.max(...Object.values(player.bestScores), 0))], ['CITIES', `${unlockedCount}/${CITIES.length}`], ['RIVALS', `${beatenCount}/${CITIES.length}`]].map(([label, val]) => (
            <div key={label}>
              <div style={{ color: '#ff6b35', fontSize: 20, lineHeight: 1 }}>{val}</div>
              <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: 8, fontFamily: 'monospace', letterSpacing: 1, marginTop: 3 }}>{label}</div>
            </div>
          ))}
        </div>

        <div style={{ marginTop: 'auto', marginBottom: 36, width: '100%', maxWidth: 340, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <button onClick={onPlay} style={{ background: 'linear-gradient(135deg,#ff6b35,#f7c59f)', border: 'none', borderRadius: 8, color: '#fff', fontSize: 24, letterSpacing: 3, padding: '18px', fontFamily: "'Bebas Neue',Impact,sans-serif", cursor: 'pointer', boxShadow: '0 4px 24px rgba(255,107,53,0.44)' }}>
            🛹 SKATE
          </button>
          <button onClick={() => { if (window.confirm('Reset all progress?')) { clearSave(); onReset(); } }} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.15)', fontSize: 10, fontFamily: 'monospace', cursor: 'pointer', letterSpacing: 2, padding: 8 }}>RESET SAVE</button>
        </div>
      </div>
    </div>
  );
};
