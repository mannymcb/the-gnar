import React from 'react';
import type { Level, Player, TrickResult } from '../game/types';
import { formatScore, getLetterGrade, getGradeColor } from '../game/scoring';

interface Props {
  level: Level;
  player: Player;
  score: number;
  trickHistory: TrickResult[];
  onComplete: (earnedCash: number, completedChallengeIds: string[]) => void;
  onRetry: () => void;
  onMap: () => void;
}

export const RunResults: React.FC<Props> = ({
  level, player, score, trickHistory, onComplete, onRetry, onMap,
}) => {
  const grade = getLetterGrade(score, level.multiplier);
  const gradeColor = getGradeColor(grade);
  const bails = trickHistory.filter(t => t.landingQuality === 'bail').length;
  const perfects = trickHistory.filter(t => t.landingQuality === 'perfect').length;
  const maxMult = Math.max(...trickHistory.map(t => t.multiplier), 1);
  const topTrick = trickHistory.reduce<TrickResult | null>((best, t) =>
    !best || t.total > best.total ? t : best, null);

  // Check which challenges were newly completed
  const newlyCompleted: string[] = [];
  let earnedCash = 0;

  for (const ch of level.challenges) {
    if (player.completedChallenges.includes(ch.id)) continue;

    let completed = false;
    if (ch.type === 'score' && score >= (ch.target as number)) completed = true;
    if (ch.type === 'trick') {
      completed = trickHistory.some(t => t.trick.id === ch.target && t.landingQuality !== 'bail');
    }
    if (ch.type === 'combo') {
      const maxCombo = trickHistory.reduce((max, _, i, arr) => {
        let streak = 0;
        for (let j = i; j < arr.length && arr[j].landingQuality !== 'bail'; j++) streak++;
        return Math.max(max, streak);
      }, 0);
      completed = maxCombo >= (ch.target as number);
    }
    if (ch.type === 'grind') {
      completed = trickHistory.some(t => t.trick.category === 'grind' && t.landingQuality !== 'bail');
    }
    if (ch.type === 'manual') {
      const manuals = trickHistory.filter(t => t.trick.category === 'manual' && t.landingQuality !== 'bail');
      completed = manuals.length >= (ch.target as number);
    }

    if (completed) {
      newlyCompleted.push(ch.id);
      earnedCash += ch.reward.cash;
    }
  }

  return (
    <div style={{
      minHeight: '100dvh', background: '#0a0a0f',
      fontFamily: "'Bebas Neue', 'Impact', sans-serif",
      padding: '24px 20px 40px',
      display: 'flex', flexDirection: 'column',
    }}>
      {/* Grade */}
      <div style={{ textAlign: 'center', marginBottom: 20 }}>
        <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: 10, letterSpacing: 4, fontFamily: 'monospace', marginBottom: 8 }}>
          {level.city.toUpperCase()} · {level.spotName.toUpperCase()}
        </div>
        <div style={{
          fontSize: 100, lineHeight: 1, color: gradeColor,
          filter: `drop-shadow(0 0 30px ${gradeColor}66)`,
        }}>{grade}</div>
        <div style={{ color: '#fff', fontSize: 44 }}>{formatScore(score)}</div>
        <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: 11, fontFamily: 'monospace', letterSpacing: 2, marginTop: 4 }}>
          POINTS
        </div>
      </div>

      {/* Stats grid */}
      <div style={{
        display: 'grid', gridTemplateColumns: '1fr 1fr 1fr',
        gap: 8, marginBottom: 20,
      }}>
        {[
          { label: 'TRICKS', val: trickHistory.filter(t => t.landingQuality !== 'bail').length },
          { label: 'BAILS', val: bails },
          { label: 'PERFECTS', val: perfects },
          { label: 'MAX X', val: `${maxMult.toFixed(1)}x` },
          { label: 'TOP TRICK', val: topTrick ? formatScore(topTrick.total) : '-' },
          { label: 'BEST TRICK', val: topTrick?.trick.name ?? '-' },
        ].map(stat => (
          <div key={stat.label} style={{
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 8, padding: '10px 8px', textAlign: 'center',
          }}>
            <div style={{ color: '#ff6b35', fontSize: 18, lineHeight: 1 }}>{stat.val}</div>
            <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: 8, fontFamily: 'monospace', letterSpacing: 1, marginTop: 3 }}>{stat.label}</div>
          </div>
        ))}
      </div>

      {/* Challenges */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12, letterSpacing: 4, fontFamily: 'monospace', marginBottom: 10 }}>
          CHALLENGES
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {level.challenges.map(ch => {
            const alreadyDone = player.completedChallenges.includes(ch.id);
            const justDone = newlyCompleted.includes(ch.id);
            const done = alreadyDone || justDone;
            return (
              <div key={ch.id} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                background: justDone
                  ? 'rgba(0,255,136,0.06)'
                  : done
                    ? 'rgba(255,255,255,0.03)'
                    : 'rgba(255,255,255,0.02)',
                border: `1px solid ${justDone ? 'rgba(0,255,136,0.25)' : done ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.05)'}`,
                borderRadius: 8, padding: '10px 12px',
              }}>
                <div style={{ flex: 1 }}>
                  <div style={{
                    color: done ? 'rgba(255,255,255,0.7)' : 'rgba(255,255,255,0.4)',
                    fontSize: 13, letterSpacing: 1,
                  }}>
                    {ch.description}
                  </div>
                  {justDone && (
                    <div style={{ color: '#00ff88', fontSize: 10, fontFamily: 'monospace', letterSpacing: 2, marginTop: 3 }}>
                      +${ch.reward.cash} CASH · +{ch.reward.xp} XP
                    </div>
                  )}
                </div>
                <div style={{ marginLeft: 12, fontSize: 18 }}>
                  {done ? '✅' : '◻️'}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Cash earned */}
      {earnedCash > 0 && (
        <div style={{
          background: 'rgba(0,255,136,0.06)', border: '1px solid rgba(0,255,136,0.2)',
          borderRadius: 10, padding: '14px 16px', marginBottom: 16,
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <span style={{ color: '#00ff88', fontSize: 16, letterSpacing: 2 }}>CHALLENGES BONUS</span>
          <span style={{ color: '#00ff88', fontSize: 22 }}>+${earnedCash}</span>
        </div>
      )}

      {/* Trick history */}
      {trickHistory.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12, letterSpacing: 4, fontFamily: 'monospace', marginBottom: 8 }}>
            TRICK LOG
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 160, overflowY: 'auto' }}>
            {[...trickHistory].reverse().slice(0, 12).map((t, i) => (
              <div key={i} style={{
                display: 'flex', justifyContent: 'space-between',
                padding: '4px 0', borderBottom: '1px solid rgba(255,255,255,0.05)',
              }}>
                <span style={{
                  color: t.landingQuality === 'bail' ? '#ff4444' :
                    t.landingQuality === 'perfect' ? '#FFD700' : 'rgba(255,255,255,0.6)',
                  fontSize: 13,
                }}>
                  {t.trick.name}
                </span>
                <span style={{ color: 'rgba(255,255,255,0.35)', fontSize: 11, fontFamily: 'monospace' }}>
                  {t.landingQuality === 'bail' ? 'BAIL' : `+${formatScore(t.total)} x${t.multiplier.toFixed(1)}`}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Actions */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 'auto' }}>
        <button onClick={onRetry} style={{
          background: 'linear-gradient(135deg, #ff6b35, #f7c59f)',
          border: 'none', borderRadius: 8, color: '#fff',
          fontSize: 20, letterSpacing: 4, padding: '16px',
          fontFamily: "'Bebas Neue', 'Impact', sans-serif",
          cursor: 'pointer',
          boxShadow: '0 4px 20px rgba(255,107,53,0.4)',
        }}>
          🔄 RUN IT AGAIN
        </button>
        <button onClick={() => { onComplete(earnedCash, newlyCompleted); onMap(); }} style={{
          background: 'rgba(255,255,255,0.06)',
          border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: 8, color: '#fff',
          fontSize: 18, letterSpacing: 3, padding: '14px',
          fontFamily: "'Bebas Neue', 'Impact', sans-serif",
          cursor: 'pointer',
        }}>
          ← BACK TO MAP
        </button>
      </div>
    </div>
  );
};
