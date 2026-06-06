import React, { useEffect, useRef } from 'react';
import type { Player } from '../game/types';
import { formatScore } from '../game/scoring';
import { clearSave } from '../game/save';

interface Props {
  player: Player;
  onCareer: () => void;
  onSession: () => void;
  onShop: () => void;
  onReset: () => void;
}

export const MainMenu: React.FC<Props> = ({ player, onCareer, onSession, onShop, onReset }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const particlesRef = useRef<Array<{ x: number; y: number; vy: number; vx: number; size: number; alpha: number; color: string }>>([]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener('resize', resize);

    // Init particles
    const colors = ['#ff6b35', '#f7c59f', '#efefd0', '#004e89'];
    particlesRef.current = Array.from({ length: 60 }, () => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      vy: -0.3 - Math.random() * 0.7,
      vx: (Math.random() - 0.5) * 0.4,
      size: 1 + Math.random() * 3,
      alpha: 0.1 + Math.random() * 0.4,
      color: colors[Math.floor(Math.random() * colors.length)],
    }));

    let t = 0;
    const draw = () => {
      t += 0.005;
      ctx.fillStyle = '#0a0a0f';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Gradient sweeps
      const grad = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
      grad.addColorStop(0, `hsla(${(t * 20) % 360}, 80%, 8%, 1)`);
      grad.addColorStop(0.5, `hsla(${(t * 20 + 120) % 360}, 60%, 5%, 1)`);
      grad.addColorStop(1, `hsla(${(t * 20 + 240) % 360}, 70%, 8%, 1)`);
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Ground line
      const groundY = canvas.height * 0.72;
      ctx.beginPath();
      ctx.moveTo(0, groundY);
      ctx.lineTo(canvas.width, groundY);
      ctx.strokeStyle = 'rgba(255,107,53,0.3)';
      ctx.lineWidth = 1;
      ctx.stroke();

      // Particles
      particlesRef.current.forEach(p => {
        p.x += p.vx;
        p.y += p.vy;
        if (p.y < -10) { p.y = canvas.height + 10; p.x = Math.random() * canvas.width; }
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fillStyle = p.color + Math.floor(p.alpha * 255).toString(16).padStart(2, '0');
        ctx.fill();
      });

      animRef.current = requestAnimationFrame(draw);
    };
    draw();

    return () => {
      cancelAnimationFrame(animRef.current);
      window.removeEventListener('resize', resize);
    };
  }, []);

  const totalChallenges = 12; // 4 per level × 3 levels
  const pct = Math.round((player.completedChallenges.length / totalChallenges) * 100);

  return (
    <div style={{ position: 'relative', width: '100%', height: '100dvh', overflow: 'hidden', fontFamily: "'Bebas Neue', 'Impact', sans-serif" }}>
      <canvas ref={canvasRef} style={{ position: 'absolute', inset: 0 }} />

      <div style={{
        position: 'relative', zIndex: 10,
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        height: '100%', padding: '0 24px',
      }}>
        {/* Header */}
        <div style={{ marginTop: '10vh', textAlign: 'center' }}>
          <div style={{
            fontSize: 11, letterSpacing: 6, color: '#ff6b35',
            textTransform: 'uppercase', fontFamily: 'monospace', marginBottom: 8,
          }}>
            STREET SKATING ACROSS AMERICA
          </div>
          <div style={{
            fontSize: 'clamp(72px, 22vw, 110px)',
            fontWeight: 900, lineHeight: 0.85,
            background: 'linear-gradient(135deg, #ff6b35 0%, #f7c59f 40%, #ffffff 70%, #ff6b35 100%)',
            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
            filter: 'drop-shadow(0 0 40px rgba(255,107,53,0.5))',
          }}>
            THE<br />GNAR
          </div>
          <div style={{
            fontSize: 13, letterSpacing: 4, color: 'rgba(255,255,255,0.4)',
            fontFamily: 'monospace', marginTop: 12,
          }}>
            MVP v1.0
          </div>
        </div>

        {/* Player card */}
        <div style={{
          marginTop: 32,
          background: 'rgba(255,255,255,0.04)',
          border: '1px solid rgba(255,107,53,0.2)',
          borderRadius: 12,
          padding: '14px 24px',
          width: '100%', maxWidth: 340,
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <div>
            <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 10, letterSpacing: 3, fontFamily: 'monospace' }}>SKATER</div>
            <div style={{ color: '#fff', fontSize: 22, marginTop: 2 }}>{player.name}</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 10, letterSpacing: 3, fontFamily: 'monospace' }}>LIFETIME</div>
            <div style={{ color: '#ff6b35', fontSize: 22 }}>{formatScore(player.totalScore)}</div>
          </div>
        </div>

        {/* Progress bar */}
        <div style={{ width: '100%', maxWidth: 340, marginTop: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
            <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 10, letterSpacing: 2, fontFamily: 'monospace' }}>
              PROGRESS
            </span>
            <span style={{ color: '#ff6b35', fontSize: 10, fontFamily: 'monospace' }}>
              {player.completedChallenges.length}/{totalChallenges} CHALLENGES
            </span>
          </div>
          <div style={{ height: 4, background: 'rgba(255,255,255,0.1)', borderRadius: 2 }}>
            <div style={{
              height: '100%', borderRadius: 2,
              width: `${pct}%`,
              background: 'linear-gradient(90deg, #ff6b35, #f7c59f)',
              transition: 'width 0.5s ease',
            }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
            <span style={{ color: player.unlockedLevels.includes('seattle') ? '#ff6b35' : 'rgba(255,255,255,0.2)', fontSize: 9, fontFamily: 'monospace' }}>SEATTLE</span>
            <span style={{ color: player.unlockedLevels.includes('portland') ? '#ff6b35' : 'rgba(255,255,255,0.2)', fontSize: 9, fontFamily: 'monospace' }}>PORTLAND</span>
            <span style={{ color: player.unlockedLevels.includes('sf') ? '#ff6b35' : 'rgba(255,255,255,0.2)', fontSize: 9, fontFamily: 'monospace' }}>S.F.</span>
          </div>
        </div>

        {/* Buttons */}
        <div style={{ marginTop: 'auto', marginBottom: 40, width: '100%', maxWidth: 340, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <button onClick={onCareer} style={bigBtn('#ff6b35')}>
            🗺️ CAREER MODE
          </button>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <button onClick={onSession} style={smallBtn}>
              🛹 SESSION
            </button>
            <button onClick={onShop} style={smallBtn}>
              🛒 SHOP
            </button>
          </div>
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16, marginTop: 4,
          }}>
            <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: 12, fontFamily: 'monospace', letterSpacing: 2 }}>
              💵 ${player.cash}
            </div>
            <button
              onClick={() => { if (window.confirm('Reset all progress?')) { clearSave(); onReset(); } }}
              style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.15)', fontSize: 10, fontFamily: 'monospace', cursor: 'pointer', letterSpacing: 2 }}
            >
              RESET
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

const bigBtn = (color: string): React.CSSProperties => ({
  background: `linear-gradient(135deg, ${color} 0%, ${color}cc 100%)`,
  border: 'none',
  borderRadius: 8,
  color: '#fff',
  fontSize: 20,
  letterSpacing: 3,
  padding: '18px 24px',
  fontFamily: "'Bebas Neue', 'Impact', sans-serif",
  cursor: 'pointer',
  width: '100%',
  boxShadow: `0 4px 24px ${color}44`,
  transition: 'transform 0.1s, box-shadow 0.1s',
});

const smallBtn: React.CSSProperties = {
  background: 'rgba(255,255,255,0.06)',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: 8,
  color: '#fff',
  fontSize: 16,
  letterSpacing: 2,
  padding: '14px 12px',
  fontFamily: "'Bebas Neue', 'Impact', sans-serif",
  cursor: 'pointer',
};
