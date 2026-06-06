import React from 'react';
import type { Level, Player } from '../game/types';
import { formatScore, getLetterGrade, getGradeColor } from '../game/scoring';

interface Props {
  level: Level;
  player: Player;
  bestScore?: number;
  onPlay: () => void;
  onBack: () => void;
}

const WEATHER_ICONS: Record<string, string> = {
  seattle: '🌧️',
  portland: '🌉',
  sf: '🌅',
};

const DIFFICULTY_LABELS = ['', 'BEGINNER', 'INTERMEDIATE', 'ADVANCED', 'EXPERT', 'ELITE'];

export const SpotDetail: React.FC<Props> = ({ level, player, bestScore, onPlay, onBack }) => {
  const completedCount = level.challenges.filter(c => player.completedChallenges.includes(c.id)).length;
  const grade = bestScore ? getLetterGrade(bestScore, level.multiplier) : null;
  const gradeColor = grade ? getGradeColor(grade) : '#fff';
  const levelIdx = ['seattle', 'portland', 'sf'].indexOf(level.id);
  const difficulty = levelIdx + 1;

  return (
    <div style={{
      minHeight: '100dvh', background: '#0a0a0f',
      fontFamily: "'Bebas Neue', 'Impact', sans-serif",
      padding: '0 0 40px',
    }}>
      {/* Hero */}
      <div style={{
        position: 'relative',
        background: `linear-gradient(180deg, ${level.palette.sky[0]} 0%, ${level.palette.sky[1]} 60%, ${level.palette.sky[2]} 100%)`,
        height: 180, overflow: 'hidden',
      }}>
        {/* Building silhouettes */}
        {[...Array(6)].map((_, i) => (
          <div key={i} style={{
            position: 'absolute', bottom: 0,
            left: `${i * 18}%`,
            width: `${12 + (i % 3) * 5}%`,
            height: `${40 + (i % 4) * 15}%`,
            background: 'rgba(0,0,0,0.5)',
            borderRadius: '2px 2px 0 0',
          }} />
        ))}
        {/* Top nav */}
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, padding: '16px', display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={onBack} style={{
            background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(255,255,255,0.2)',
            borderRadius: 8, color: '#fff', fontSize: 18, width: 40, height: 40,
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>←</button>
          <div>
            <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: 10, letterSpacing: 3, fontFamily: 'monospace' }}>
              {level.state} · {WEATHER_ICONS[level.id] ?? '📍'}
            </div>
            <div style={{ color: '#fff', fontSize: 32, lineHeight: 1, textShadow: '0 2px 8px rgba(0,0,0,0.6)' }}>
              {level.city}
            </div>
          </div>
          {grade && (
            <div style={{ marginLeft: 'auto', textAlign: 'center' }}>
              <div style={{ fontSize: 44, color: gradeColor, lineHeight: 1, filter: `drop-shadow(0 0 12px ${gradeColor}66)` }}>
                {grade}
              </div>
              <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 9, fontFamily: 'monospace', letterSpacing: 1 }}>BEST</div>
            </div>
          )}
        </div>

        {/* Spot name at bottom */}
        <div style={{
          position: 'absolute', bottom: 12, left: 16,
          color: 'rgba(255,255,255,0.7)', fontSize: 12, fontFamily: 'monospace', letterSpacing: 3,
        }}>
          {level.spotName.toUpperCase()}
        </div>
      </div>

      <div style={{ padding: '20px' }}>
        {/* Quick stats */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 20 }}>
          <div style={statCard}>
            <div style={{ color: '#ff6b35', fontSize: 20 }}>{difficulty}x</div>
            <div style={statLabel}>MULTIPLIER</div>
          </div>
          <div style={statCard}>
            <div style={{ color: '#fff', fontSize: 16 }}>{DIFFICULTY_LABELS[difficulty]}</div>
            <div style={statLabel}>LEVEL</div>
          </div>
          <div style={statCard}>
            <div style={{ color: '#fff', fontSize: 16 }}>{bestScore ? formatScore(bestScore) : '—'}</div>
            <div style={statLabel}>BEST</div>
          </div>
        </div>

        {/* Description */}
        <div style={{
          background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)',
          borderRadius: 10, padding: '14px', marginBottom: 20,
          color: 'rgba(255,255,255,0.5)', fontSize: 12, fontFamily: 'monospace',
          lineHeight: 1.6, letterSpacing: 0.5,
        }}>
          {level.description}
        </div>

        {/* Obstacles */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: 10, letterSpacing: 4, fontFamily: 'monospace', marginBottom: 10 }}>
            OBSTACLES
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {level.obstacles.map(obs => (
              <div key={obs.label} style={{
                background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: 6, padding: '4px 10px',
                color: 'rgba(255,255,255,0.6)', fontSize: 10, fontFamily: 'monospace', letterSpacing: 1,
              }}>
                {obs.label}
              </div>
            ))}
          </div>
        </div>

        {/* Challenges */}
        <div style={{ marginBottom: 24 }}>
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10,
          }}>
            <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: 10, letterSpacing: 4, fontFamily: 'monospace' }}>
              CHALLENGES
            </div>
            <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: 10, fontFamily: 'monospace' }}>
              {completedCount}/{level.challenges.length}
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {level.challenges.map(ch => {
              const done = player.completedChallenges.includes(ch.id);
              return (
                <div key={ch.id} style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '10px 12px',
                  background: done ? 'rgba(0,255,136,0.04)' : 'rgba(255,255,255,0.02)',
                  border: `1px solid ${done ? 'rgba(0,255,136,0.15)' : 'rgba(255,255,255,0.06)'}`,
                  borderRadius: 8,
                }}>
                  <div style={{ flex: 1 }}>
                    <div style={{
                      color: done ? 'rgba(255,255,255,0.5)' : 'rgba(255,255,255,0.7)',
                      fontSize: 13, letterSpacing: 1,
                      textDecoration: done ? 'line-through' : 'none',
                    }}>
                      {ch.description}
                    </div>
                    <div style={{ color: 'rgba(255,255,255,0.25)', fontSize: 9, fontFamily: 'monospace', marginTop: 2 }}>
                      +${ch.reward.cash} · +{ch.reward.xp} XP
                    </div>
                  </div>
                  <div style={{ marginLeft: 12 }}>
                    {done ? (
                      <span style={{ color: '#00ff88', fontSize: 16 }}>✓</span>
                    ) : (
                      <span style={{ color: 'rgba(255,255,255,0.2)', fontSize: 14 }}>○</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Play button */}
        <button onClick={onPlay} style={{
          width: '100%', background: 'linear-gradient(135deg, #ff6b35, #f7c59f)',
          border: 'none', borderRadius: 10, color: '#fff',
          fontSize: 24, letterSpacing: 4, padding: '20px',
          fontFamily: "'Bebas Neue', 'Impact', sans-serif",
          cursor: 'pointer', boxShadow: '0 6px 30px rgba(255,107,53,0.4)',
        }}>
          🛹 DROP IN
        </button>
      </div>
    </div>
  );
};

const statCard: React.CSSProperties = {
  background: 'rgba(255,255,255,0.04)',
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: 8, padding: '10px 8px', textAlign: 'center',
};

const statLabel: React.CSSProperties = {
  color: 'rgba(255,255,255,0.3)', fontSize: 8,
  fontFamily: 'monospace', letterSpacing: 1, marginTop: 3,
};
