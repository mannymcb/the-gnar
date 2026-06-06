import React from 'react';
import { LEVELS } from '../game/levels';
import type { Player, Level } from '../game/types';

interface Props {
  player: Player;
  onSelectLevel: (levelId: string) => void;
  onBack: () => void;
}

const CITY_EMOJIS: Record<string, string> = {
  seattle: '🌧️',
  portland: '🌉',
  sf: '🌉',
};

const CITY_TAGLINES: Record<string, string> = {
  seattle: 'Where it starts',
  portland: 'DIY or die',
  sf: 'Holy ground',
};

export const CareerMap: React.FC<Props> = ({ player, onSelectLevel, onBack }) => {
  const isUnlocked = (level: Level) => player.unlockedLevels.includes(level.id);

  const completedCount = (level: Level) =>
    level.challenges.filter(c => player.completedChallenges.includes(c.id)).length;

  const allDone = (level: Level) =>
    completedCount(level) === level.challenges.length;

  return (
    <div style={{
      minHeight: '100dvh', background: '#0a0a0f',
      fontFamily: "'Bebas Neue', 'Impact', sans-serif",
      padding: '0 0 40px',
    }}>
      {/* Header */}
      <div style={{
        padding: '20px 20px 0',
        display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24,
      }}>
        <button onClick={onBack} style={{
          background: 'none', border: '1px solid rgba(255,255,255,0.15)',
          borderRadius: 8, color: '#fff', fontSize: 20,
          width: 44, height: 44, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>←</button>
        <div>
          <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 10, letterSpacing: 4, fontFamily: 'monospace' }}>
            CAREER MODE
          </div>
          <div style={{ color: '#fff', fontSize: 28, lineHeight: 1 }}>ACROSS AMERICA</div>
        </div>
      </div>

      {/* Map line */}
      <div style={{ padding: '0 20px' }}>
        {/* West → East label */}
        <div style={{
          display: 'flex', justifyContent: 'space-between',
          color: 'rgba(255,255,255,0.2)', fontSize: 9, letterSpacing: 3, fontFamily: 'monospace',
          marginBottom: 8,
        }}>
          <span>WEST COAST</span>
          <span>EAST COAST →</span>
        </div>

        {/* Route connector */}
        <div style={{
          height: 2, background: 'linear-gradient(90deg, #ff6b35, rgba(255,107,53,0.1))',
          marginBottom: -10, borderRadius: 1,
        }} />

        {/* City cards */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
          {LEVELS.map((level, idx) => {
            const unlocked = isUnlocked(level);
            const done = allDone(level);
            const completed = completedCount(level);
            const pct = Math.round((completed / level.challenges.length) * 100);

            return (
              <React.Fragment key={level.id}>
                {/* Connector dot */}
                <div style={{ display: 'flex', alignItems: 'center', paddingLeft: 8 }}>
                  <div style={{
                    width: 12, height: 12, borderRadius: '50%',
                    background: unlocked ? (done ? '#00ff88' : '#ff6b35') : 'rgba(255,255,255,0.1)',
                    border: `2px solid ${unlocked ? (done ? '#00ff88' : '#ff6b35') : 'rgba(255,255,255,0.2)'}`,
                    flexShrink: 0,
                    boxShadow: unlocked ? `0 0 12px ${done ? '#00ff8844' : '#ff6b3544'}` : 'none',
                  }} />
                  <div style={{
                    flex: 1, height: 1,
                    background: unlocked ? 'rgba(255,107,53,0.4)' : 'rgba(255,255,255,0.05)',
                    marginLeft: 4,
                  }} />
                </div>

                {/* City card */}
                <button
                  disabled={!unlocked}
                  onClick={() => unlocked && onSelectLevel(level.id)}
                  style={{
                    display: 'block', width: '100%', textAlign: 'left',
                    background: unlocked
                      ? done
                        ? 'linear-gradient(135deg, rgba(0,255,136,0.05), rgba(0,255,136,0.02))'
                        : 'linear-gradient(135deg, rgba(255,107,53,0.08), rgba(255,107,53,0.03))'
                      : 'rgba(255,255,255,0.02)',
                    border: `1px solid ${unlocked ? (done ? 'rgba(0,255,136,0.2)' : 'rgba(255,107,53,0.2)') : 'rgba(255,255,255,0.05)'}`,
                    borderRadius: 12, padding: '16px 16px',
                    marginLeft: 16, marginBottom: 4,
                    cursor: unlocked ? 'pointer' : 'not-allowed',
                    transition: 'transform 0.1s',
                    fontFamily: "'Bebas Neue', 'Impact', sans-serif",
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 20 }}>{CITY_EMOJIS[level.id] ?? '📍'}</span>
                        <div>
                          <div style={{
                            color: unlocked ? '#fff' : 'rgba(255,255,255,0.3)',
                            fontSize: 24, lineHeight: 1,
                          }}>
                            {level.city}
                          </div>
                          <div style={{
                            color: unlocked ? 'rgba(255,255,255,0.5)' : 'rgba(255,255,255,0.2)',
                            fontSize: 10, letterSpacing: 2, fontFamily: 'monospace',
                          }}>
                            {level.spotName.toUpperCase()} · {level.state}
                          </div>
                        </div>
                      </div>
                      {unlocked && (
                        <div style={{
                          color: 'rgba(255,255,255,0.4)', fontSize: 11, fontFamily: 'monospace',
                          marginTop: 8, letterSpacing: 1,
                        }}>
                          {CITY_TAGLINES[level.id]}
                        </div>
                      )}
                    </div>

                    <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: 12 }}>
                      {!unlocked ? (
                        <div style={{ color: 'rgba(255,255,255,0.2)', fontSize: 22 }}>🔒</div>
                      ) : done ? (
                        <div style={{ color: '#00ff88', fontSize: 22 }}>✓</div>
                      ) : (
                        <div style={{ color: '#ff6b35', fontSize: 18 }}>▶</div>
                      )}
                      {unlocked && (
                        <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 10, fontFamily: 'monospace', marginTop: 4 }}>
                          {completed}/{level.challenges.length}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Progress bar */}
                  {unlocked && (
                    <div style={{ marginTop: 12 }}>
                      <div style={{ height: 3, background: 'rgba(255,255,255,0.08)', borderRadius: 2 }}>
                        <div style={{
                          height: '100%', borderRadius: 2,
                          width: `${pct}%`,
                          background: done
                            ? 'linear-gradient(90deg, #00ff88, #00cc6a)'
                            : 'linear-gradient(90deg, #ff6b35, #f7c59f)',
                          transition: 'width 0.4s ease',
                        }} />
                      </div>
                    </div>
                  )}

                  {/* Challenges preview */}
                  {unlocked && (
                    <div style={{ marginTop: 10, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {level.challenges.map(ch => (
                        <div key={ch.id} style={{
                          height: 6, width: 6, borderRadius: '50%',
                          background: player.completedChallenges.includes(ch.id)
                            ? (done ? '#00ff88' : '#ff6b35')
                            : 'rgba(255,255,255,0.15)',
                        }} />
                      ))}
                      <span style={{
                        color: 'rgba(255,255,255,0.3)', fontSize: 9,
                        fontFamily: 'monospace', letterSpacing: 1, alignSelf: 'center',
                      }}>
                        {level.challenges.filter(c => !player.completedChallenges.includes(c.id)).length > 0
                          ? `${level.challenges.filter(c => !player.completedChallenges.includes(c.id)).length} LEFT`
                          : 'DONE'}
                      </span>
                    </div>
                  )}
                </button>

                {/* Unlock hint */}
                {!unlocked && idx > 0 && (
                  <div style={{
                    marginLeft: 28, marginBottom: 4,
                    color: 'rgba(255,255,255,0.2)', fontSize: 9, fontFamily: 'monospace', letterSpacing: 2,
                  }}>
                    COMPLETE {LEVELS[idx - 1].city.toUpperCase()} TO UNLOCK
                  </div>
                )}
              </React.Fragment>
            );
          })}
        </div>

        {/* Teaser */}
        <div style={{
          marginTop: 24, marginLeft: 16,
          padding: '16px',
          background: 'rgba(255,255,255,0.02)',
          border: '1px dashed rgba(255,255,255,0.05)',
          borderRadius: 12,
          textAlign: 'center',
          color: 'rgba(255,255,255,0.15)',
          fontSize: 12, fontFamily: 'monospace', letterSpacing: 2,
        }}>
          MORE CITIES COMING · LA · CHICAGO · NYC · TAMPA
        </div>
      </div>
    </div>
  );
};
