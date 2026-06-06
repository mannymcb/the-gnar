import React, { useState, useEffect, useRef, useCallback } from 'react';
import type { Player, Level, SessionState, TrickResult } from '../game/types';
import { ALL_TRICKS, getTricksForLevel } from '../game/tricks';
import { calculateTrickScore, getNextMultiplier, formatScore, getLetterGrade, getGradeColor } from '../game/scoring';
import { useSwipe } from '../hooks/useSwipe';
import type { SwipeDirection } from '../game/types';

interface Props {
  level: Level;
  player: Player;
  levelIndex: number;
  onComplete: (score: number, trickHistory: TrickResult[]) => void;
  onBack: () => void;
}

const RUN_DURATION = 60; // seconds

const INITIAL_SESSION: SessionState = {
  score: 0, combo: 0, multiplier: 1,
  trickHistory: [], isComboActive: false,
  runTimeLeft: RUN_DURATION, isRunning: false, bails: 0,
  currentObstacleIndex: 0, manualActive: false, grindActive: false, grindProgress: 0,
  playerX: 5, phase: 'idle', lastTrickId: null, consecutiveSameTrick: 0,
};

export const SkateRun: React.FC<Props> = ({ level, player, levelIndex, onComplete, onBack }) => {
  const [session, setSession] = useState<SessionState>({ ...INITIAL_SESSION });
  const [showTrickLabel, setShowTrickLabel] = useState<{ name: string; quality: string; pts: number } | null>(null);
  const [particles, setParticles] = useState<Array<{ id: number; x: number; y: number; color: string; vx: number; vy: number }>>([]);
  const [skaterAnim, setSkaterAnim] = useState<'idle' | 'trick' | 'bail' | 'grind' | 'manual'>('idle');
  const [showCombo, setShowCombo] = useState(false);
  const [landingWindow, setLandingWindow] = useState<{ visible: boolean; progress: number } | null>(null);
  const [pendingTrick, setPendingTrick] = useState<string | null>(null);
  const [cloudPositions] = useState(() =>
    Array.from({ length: 5 }, (_, i) => ({ x: i * 22 + Math.random() * 10, speed: 0.02 + Math.random() * 0.02 }))
  );
  const [cloudX, setCloudX] = useState(cloudPositions.map(c => c.x));

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const landingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const landingStartRef = useRef<number>(0);
  const landingDurationRef = useRef<number>(800);
  const particleIdRef = useRef(0);
  const skaterXRef = useRef(5);
  const moveAnimRef = useRef<number>(0);

  const availableTricks = getTricksForLevel(levelIndex).filter(t => player.unlockedTricks.includes(t.id));

  // ── GESTURE → TRICK LOOKUP ────────────────────────────────────────────────
  const gestureToTrick = useCallback((dir: SwipeDirection, isHold: boolean) => {
    const gesture = isHold
      ? `hold-${dir}` as const
      : `swipe-${dir}` as const;

    // Filter to tricks matching gesture and unlocked
    const candidates = availableTricks.filter(t => t.gesture === gesture);
    if (candidates.length === 0) return null;

    // At higher levels, prefer higher-level tricks
    return candidates.reduce((best, t) => t.unlockLevel > best.unlockLevel ? t : best, candidates[0]);
  }, [availableTricks]);

  // ── START RUN ─────────────────────────────────────────────────────────────
  const startRun = useCallback(() => {
    setSession({ ...INITIAL_SESSION, isRunning: true, phase: 'skating' });
    skaterXRef.current = 5;

    const animate = () => {
      skaterXRef.current = Math.min(skaterXRef.current + 0.08, 90);
      setSession(s => ({ ...s, playerX: skaterXRef.current }));
      if (skaterXRef.current < 90) {
        moveAnimRef.current = requestAnimationFrame(animate);
      }
    };
    moveAnimRef.current = requestAnimationFrame(animate);

    timerRef.current = setInterval(() => {
      setSession(s => {
        if (s.runTimeLeft <= 1) {
          clearInterval(timerRef.current!);
          return { ...s, runTimeLeft: 0, isRunning: false, phase: 'finished' };
        }
        return { ...s, runTimeLeft: s.runTimeLeft - 1 };
      });
    }, 1000);
  }, []);

  useEffect(() => {
    // Animate clouds
    const cloudAnim = setInterval(() => {
      setCloudX(prev => prev.map((x, i) => (x + cloudPositions[i].speed) % 110));
    }, 50);
    return () => clearInterval(cloudAnim);
  }, [cloudPositions]);

  useEffect(() => {
    return () => {
      clearInterval(timerRef.current!);
      cancelAnimationFrame(moveAnimRef.current);
      clearTimeout(landingTimerRef.current!);
    };
  }, []);

  useEffect(() => {
    if (session.phase === 'finished') {
      setTimeout(() => onComplete(session.score, session.trickHistory), 1200);
    }
  }, [session.phase, session.score, session.trickHistory, onComplete]);

  // ── EMIT PARTICLES ─────────────────────────────────────────────────────────
  const emitParticles = useCallback((x: number, y: number, color: string, count: number) => {
    const newP = Array.from({ length: count }, () => ({
      id: particleIdRef.current++,
      x, y, color,
      vx: (Math.random() - 0.5) * 6,
      vy: -2 - Math.random() * 4,
    }));
    setParticles(prev => [...prev.slice(-50), ...newP]);
    setTimeout(() => {
      setParticles(prev => prev.filter(p => !newP.find(n => n.id === p.id)));
    }, 800);
  }, []);

  // ── SHOW TRICK LABEL ──────────────────────────────────────────────────────
  const flashTrickLabel = useCallback((name: string, quality: string, pts: number) => {
    setShowTrickLabel({ name, quality, pts });
    setTimeout(() => setShowTrickLabel(null), 1200);
  }, []);

  // ── HANDLE GESTURE ─────────────────────────────────────────────────────────
  const handleGesture = useCallback((dir: SwipeDirection, isHold: boolean) => {
    setSession(s => {
      if (!s.isRunning || s.phase === 'finished') return s;
      if (s.phase === 'trick') return s; // already mid-trick

      const trick = gestureToTrick(dir, isHold);
      if (!trick) return s;

      setPendingTrick(trick.id);
      setSkaterAnim('trick');

      // Open landing window
      const duration = 700 + trick.difficulty * 100;
      landingDurationRef.current = duration;
      landingStartRef.current = Date.now();
      setLandingWindow({ visible: true, progress: 0 });

      // Animate landing window progress
      const startTime = Date.now();
      const tick = () => {
        const elapsed = Date.now() - startTime;
        const progress = Math.min(elapsed / duration, 1);
        setLandingWindow({ visible: true, progress });
        if (progress < 1) {
          requestAnimationFrame(tick);
        } else {
          // Auto-land on timeout
          handleAutoLand(trick.id, 0.3);
        }
      };
      requestAnimationFrame(tick);

      return { ...s, phase: 'trick' };
    });
  }, [gestureToTrick]);

  const handleAutoLand = useCallback((trickId: string, accuracy: number) => {
    setLandingWindow(null);
    setPendingTrick(null);
    const trick = ALL_TRICKS.find(t => t.id === trickId);
    if (!trick) return;

    setSession(s => {
      const quality = accuracy < 0.25 ? 'bail' : accuracy < 0.55 ? 'sloppy' : accuracy < 0.85 ? 'clean' : 'perfect';
      const lq = quality as TrickResult['landingQuality'];

      if (lq === 'bail') {
        setSkaterAnim('bail');
        flashTrickLabel(trick.name, 'BAIL!', 0);
        emitParticles(50, 60, '#ff4444', 8);
        setTimeout(() => setSkaterAnim('idle'), 600);
        return {
          ...s,
          phase: 'skating',
          bails: s.bails + 1,
          multiplier: 1,
          combo: 0,
          isComboActive: false,
          consecutiveSameTrick: 0,
        };
      }

      const result = calculateTrickScore(trick, lq, s, player, level.multiplier);
      const newMult = getNextMultiplier(s.multiplier, lq, player);
      const newCombo = s.combo + 1;
      const sameAsBefore = s.lastTrickId === trick.id;

      const qualityLabel = { perfect: 'PERFECT!', clean: 'CLEAN', sloppy: 'MEEEH' }[lq];
      flashTrickLabel(trick.name, qualityLabel, result.total);
      emitParticles(50, 55, lq === 'perfect' ? '#FFD700' : '#ff6b35', lq === 'perfect' ? 16 : 8);

      if (newCombo >= 3) {
        setShowCombo(true);
        setTimeout(() => setShowCombo(false), 800);
      }
      setSkaterAnim(lq === 'sloppy' ? 'idle' : 'idle');
      setTimeout(() => setSkaterAnim('idle'), 400);

      return {
        ...s,
        phase: 'skating',
        score: s.score + result.total,
        combo: newCombo,
        multiplier: newMult,
        isComboActive: true,
        trickHistory: [...s.trickHistory, result],
        lastTrickId: trick.id,
        consecutiveSameTrick: sameAsBefore ? s.consecutiveSameTrick + 1 : 0,
      };
    });
  }, [player, level.multiplier, flashTrickLabel, emitParticles]);

  const handleTap = useCallback((accuracy: number) => {
    if (pendingTrick && landingWindow?.visible) {
      handleAutoLand(pendingTrick, accuracy);
    }
  }, [pendingTrick, landingWindow, handleAutoLand]);

  const { handleTouchStart, handleTouchEnd, handleTouchMove } = useSwipe({
    onSwipe: handleGesture,
    onTap: handleTap,
  });

  // ── SKY COLORS ────────────────────────────────────────────────────────────
  const [sky1, sky2, sky3] = level.palette.sky;

  // ── RENDER ────────────────────────────────────────────────────────────────
  if (session.phase === 'finished') {
    const grade = getLetterGrade(session.score, level.multiplier);
    const gradeColor = getGradeColor(grade);
    return (
      <div style={{
        height: '100dvh', background: '#0a0a0f', display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', fontFamily: "'Bebas Neue', 'Impact', sans-serif",
        padding: 24, gap: 16,
      }}>
        <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 10, letterSpacing: 4, fontFamily: 'monospace' }}>
          {level.city.toUpperCase()} · {level.spotName.toUpperCase()}
        </div>
        <div style={{
          fontSize: 120, lineHeight: 1, color: gradeColor,
          filter: `drop-shadow(0 0 40px ${gradeColor}88)`,
        }}>{grade}</div>
        <div style={{ color: '#fff', fontSize: 48 }}>{formatScore(session.score)}</div>
        <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12, fontFamily: 'monospace', letterSpacing: 2 }}>
          {session.trickHistory.length} TRICKS · {session.bails} BAILS · MAX x{Math.max(...session.trickHistory.map(t => t.multiplier), 1).toFixed(1)}
        </div>
        <div style={{ color: 'rgba(255,255,255,0.25)', fontSize: 11, fontFamily: 'monospace', letterSpacing: 2, marginTop: 8 }}>
          SAVING RESULT...
        </div>
      </div>
    );
  }

  return (
    <div
      style={{ position: 'relative', width: '100%', height: '100dvh', overflow: 'hidden', userSelect: 'none', WebkitUserSelect: 'none' }}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onTouchMove={handleTouchMove}
    >
      {/* SKY */}
      <div style={{
        position: 'absolute', inset: 0,
        background: `linear-gradient(180deg, ${sky1} 0%, ${sky2} 55%, ${sky3} 100%)`,
      }} />

      {/* CLOUDS */}
      {cloudX.map((x, i) => (
        <div key={i} style={{
          position: 'absolute',
          left: `${x}%`,
          top: `${8 + i * 4}%`,
          width: `${60 + i * 20}px`,
          height: `${16 + i * 6}px`,
          background: 'rgba(255,255,255,0.08)',
          borderRadius: 20,
          filter: 'blur(6px)',
        }} />
      ))}

      {/* BUILDINGS SILHOUETTE */}
      <div style={{ position: 'absolute', bottom: '28%', left: 0, right: 0, height: '25%' }}>
        {[...Array(8)].map((_, i) => (
          <div key={i} style={{
            position: 'absolute',
            bottom: 0,
            left: `${i * 13.5}%`,
            width: `${9 + (i % 3) * 4}%`,
            height: `${30 + (i % 4) * 18}%`,
            background: 'rgba(0,0,0,0.4)',
            borderRadius: '2px 2px 0 0',
          }}>
            {/* Windows */}
            {[...Array(3)].map((_, j) => (
              <div key={j} style={{
                position: 'absolute',
                bottom: `${20 + j * 28}%`,
                left: '20%', right: '20%',
                height: '12%',
                background: `rgba(255,220,100,${Math.random() > 0.5 ? 0.4 : 0.1})`,
              }} />
            ))}
          </div>
        ))}
      </div>

      {/* GROUND */}
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0, height: '28%',
        background: level.palette.ground,
      }}>
        {/* Ground texture stripes */}
        {[...Array(20)].map((_, i) => (
          <div key={i} style={{
            position: 'absolute', top: 0, bottom: 0,
            left: `${i * 5}%`, width: '1px',
            background: 'rgba(0,0,0,0.1)',
          }} />
        ))}
        {/* Ground top edge */}
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: 'rgba(0,0,0,0.3)' }} />
      </div>

      {/* OBSTACLES */}
      {level.obstacles.map((obs, i) => {
        const passed = session.playerX > obs.x;
        return (
          <div key={i} style={{
            position: 'absolute',
            left: `${obs.x}%`,
            bottom: '28%',
            transform: 'translateX(-50%)',
            opacity: passed ? 0.3 : 1,
            transition: 'opacity 0.3s',
          }}>
            {obs.type === 'ledge' && (
              <div style={{ width: 80, height: 14, background: '#aaa', borderRadius: 2, boxShadow: '0 2px 6px rgba(0,0,0,0.4)' }} />
            )}
            {obs.type === 'rail' && (
              <div style={{ position: 'relative', width: 70, height: 28 }}>
              <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 4, borderRadius: 2, background: 'linear-gradient(180deg, #ddd, #999)' }} />
                <div style={{ position: 'absolute', top: 4, left: '20%', width: 3, height: '100%', background: '#888' }} />
                <div style={{ position: 'absolute', top: 4, right: '20%', width: 3, height: '100%', background: '#888' }} />
              </div>
            )}
            {obs.type === 'block' && (
              <div style={{ width: 40, height: 28, background: 'linear-gradient(180deg, #c8b8a2, #a89880)', borderRadius: 3, boxShadow: '0 3px 8px rgba(0,0,0,0.4)' }} />
            )}
            {obs.type === 'gap' && (
              <div style={{ width: 50, height: 4, border: '2px dashed rgba(255,107,53,0.4)', background: 'none' }} />
            )}
            {obs.type === 'stairs' && (
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 1 }}>
                {[16, 28, 40, 28, 16].map((h, j) => (
                  <div key={j} style={{ width: 12, height: h, background: '#888', borderRadius: '1px 1px 0 0' }} />
                ))}
              </div>
            )}
            {obs.type === 'bank' && (
              <div style={{
                width: 70, height: 36,
                background: 'linear-gradient(135deg, #666, #444)',
                clipPath: 'polygon(0 100%, 100% 0, 100% 100%)',
              }} />
            )}
            {/* Label */}
            <div style={{
              textAlign: 'center', fontSize: 8, fontFamily: 'monospace',
              color: passed ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.5)',
              marginTop: 3, letterSpacing: 1,
            }}>
              {obs.label.toUpperCase()}
            </div>
          </div>
        );
      })}

      {/* SKATER */}
      <div style={{
        position: 'absolute',
        left: `${session.playerX}%`,
        bottom: '28%',
        transform: `translateX(-50%) ${skaterAnim === 'trick' ? 'translateY(-18px) rotate(5deg)' : skaterAnim === 'bail' ? 'rotate(-45deg) translateX(10px)' : 'none'}`,
        transition: 'transform 0.15s ease-out',
        fontSize: 28,
        filter: skaterAnim === 'bail' ? 'hue-rotate(180deg)' : 'none',
      }}>
        🛹
      </div>

      {/* PARTICLES */}
      {particles.map(p => (
        <div key={p.id} style={{
          position: 'absolute',
          left: `${p.x}%`, top: `${p.y}%`,
          width: 5, height: 5, borderRadius: '50%',
          background: p.color,
          pointerEvents: 'none',
          animation: 'none',
        }} />
      ))}

      {/* HUD — TOP */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0,
        padding: '16px 16px 0',
        display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
        fontFamily: "'Bebas Neue', 'Impact', sans-serif",
      }}>
        {/* Back + city */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button onClick={onBack} style={{
            background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(255,255,255,0.15)',
            borderRadius: 6, color: '#fff', fontSize: 16, width: 36, height: 36,
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>←</button>
          <div>
            <div style={{ color: 'rgba(255,255,255,0.9)', fontSize: 18, lineHeight: 1, textShadow: '0 1px 4px rgba(0,0,0,0.6)' }}>
              {level.city}
            </div>
            <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 9, fontFamily: 'monospace', letterSpacing: 2 }}>
              {level.spotName.toUpperCase()}
            </div>
          </div>
        </div>

        {/* Score + Timer */}
        <div style={{ textAlign: 'right' }}>
          <div style={{
            color: '#fff', fontSize: 32, lineHeight: 1,
            textShadow: '0 1px 8px rgba(0,0,0,0.8)',
            filter: session.score > 0 ? 'drop-shadow(0 0 8px rgba(255,107,53,0.5))' : 'none',
          }}>
            {formatScore(session.score)}
          </div>
          <div style={{
            color: session.runTimeLeft <= 10 ? '#ff4444' : 'rgba(255,255,255,0.6)',
            fontSize: 14, fontFamily: 'monospace', letterSpacing: 2,
            animation: session.runTimeLeft <= 5 ? 'pulse 0.5s infinite' : 'none',
          }}>
            {session.runTimeLeft}s
          </div>
        </div>
      </div>

      {/* COMBO MULTIPLIER */}
      {session.isComboActive && session.multiplier > 1 && (
        <div style={{
          position: 'absolute', top: 80, left: '50%', transform: 'translateX(-50%)',
          fontFamily: "'Bebas Neue', 'Impact', sans-serif",
          fontSize: showCombo ? 32 : 20,
          color: '#FFD700',
          textShadow: '0 0 20px rgba(255,215,0,0.6)',
          transition: 'font-size 0.15s ease',
          letterSpacing: 2,
        }}>
          x{session.multiplier.toFixed(1)}
        </div>
      )}

      {/* TRICK LABEL */}
      {showTrickLabel && (
        <div style={{
          position: 'absolute', top: '35%', left: '50%',
          transform: 'translateX(-50%)',
          textAlign: 'center',
          pointerEvents: 'none',
          animation: 'fadeUp 1.2s forwards',
        }}>
          <div style={{
            fontFamily: "'Bebas Neue', 'Impact', sans-serif",
            fontSize: 26, color: '#fff',
            textShadow: '0 2px 8px rgba(0,0,0,0.8)',
            letterSpacing: 2,
          }}>
            {showTrickLabel.name}
          </div>
          <div style={{
            fontSize: 13, letterSpacing: 3,
            color: showTrickLabel.quality === 'PERFECT!' ? '#FFD700' :
              showTrickLabel.quality === 'BAIL!' ? '#ff4444' :
                showTrickLabel.quality === 'CLEAN' ? '#00ff88' : '#aaa',
            fontFamily: 'monospace',
          }}>
            {showTrickLabel.quality}
          </div>
          {showTrickLabel.pts > 0 && (
            <div style={{ color: '#ff6b35', fontSize: 16, fontFamily: "'Bebas Neue', 'Impact', sans-serif", letterSpacing: 1 }}>
              +{formatScore(showTrickLabel.pts)}
            </div>
          )}
        </div>
      )}

      {/* LANDING WINDOW TAP METER */}
      {landingWindow?.visible && (
        <div style={{
          position: 'absolute', bottom: '34%', left: '50%',
          transform: 'translateX(-50%)',
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
        }}>
          <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: 9, fontFamily: 'monospace', letterSpacing: 2 }}>
            TAP TO LAND
          </div>
          <div style={{ width: 120, height: 8, background: 'rgba(0,0,0,0.5)', borderRadius: 4, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.2)' }}>
            <div style={{
              height: '100%', borderRadius: 4,
              width: `${landingWindow.progress * 100}%`,
              background: landingWindow.progress < 0.3
                ? '#00ff88'
                : landingWindow.progress < 0.7
                  ? '#FFD700'
                  : '#ff4444',
              transition: 'background 0.1s',
            }} />
          </div>
        </div>
      )}

      {/* START SCREEN */}
      {session.phase === 'idle' && (
        <div style={{
          position: 'absolute', inset: 0,
          background: 'rgba(0,0,0,0.75)',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          gap: 16, padding: 24,
          fontFamily: "'Bebas Neue', 'Impact', sans-serif",
        }}>
          <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 10, letterSpacing: 4, fontFamily: 'monospace' }}>
            {level.state} · {level.spotName}
          </div>
          <div style={{ fontSize: 52, color: '#fff', lineHeight: 1 }}>{level.city}</div>
          <div style={{
            color: 'rgba(255,255,255,0.5)', fontSize: 12, fontFamily: 'monospace',
            letterSpacing: 1, textAlign: 'center', maxWidth: 260, lineHeight: 1.6,
          }}>
            {level.description}
          </div>

          {/* Controls hint */}
          <div style={{
            background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 12, padding: '16px 20px', width: '100%', maxWidth: 300,
            display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 16px',
          }}>
            {[
              ['↑ Swipe Up', 'Ollie'],
              ['↓ Swipe Down', 'Manual'],
              ['← Swipe Left', 'Kickflip'],
              ['→ Swipe Right', 'Heelflip'],
              ['Hold + Swipe', 'Grinds'],
              ['Tap', 'Land trick'],
            ].map(([gesture, name]) => (
              <div key={gesture} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <span style={{ color: '#ff6b35', fontSize: 10, fontFamily: 'monospace', minWidth: 70 }}>{gesture}</span>
                <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 10, fontFamily: 'monospace' }}>{name}</span>
              </div>
            ))}
          </div>

          <button onClick={startRun} style={{
            background: 'linear-gradient(135deg, #ff6b35, #f7c59f)',
            border: 'none', borderRadius: 8, color: '#fff',
            fontSize: 24, letterSpacing: 4, padding: '18px 48px',
            fontFamily: "'Bebas Neue', 'Impact', sans-serif",
            cursor: 'pointer', marginTop: 8,
            boxShadow: '0 4px 24px rgba(255,107,53,0.5)',
          }}>
            DROP IN →
          </button>
        </div>
      )}

      <style>{`
        @keyframes fadeUp {
          0% { opacity: 1; transform: translateX(-50%) translateY(0); }
          60% { opacity: 1; transform: translateX(-50%) translateY(-20px); }
          100% { opacity: 0; transform: translateX(-50%) translateY(-40px); }
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>
    </div>
  );
};
