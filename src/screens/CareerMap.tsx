import React from 'react';
import { LEVELS } from '../game/levels';
import { formatScore } from '../game/scoring';
import type { Player, Level } from '../game/types';

interface Props {
  player: Player;
  onSelectLevel: (levelId: string) => void;
  onBack: () => void;
}

export const CareerMap: React.FC<Props> = ({ player, onSelectLevel, onBack }) => {
  const isUnlocked  = (l: Level) => player.unlockedLevels.includes(l.id);
  const rivalBeaten = (l: Level) => player.rivalsBeaten.includes(l.id);
  const hasItem     = (l: Level) => player.collectibles.includes(l.collectible.id);
  const bestScore   = (l: Level) => player.cityCredits[l.id] ?? 0;

  const doneCount = (l: Level) =>
    l.challenges.filter(c => player.completedChallenges.includes(c.id)).length;

  return (
    <div style={{
      minHeight: '100dvh', background: '#0a0a0f',
      fontFamily: "'Bebas Neue', Impact, sans-serif", overflowY: 'auto',
    }}>
      {/* Header */}
      <div style={{ padding: '20px 20px 0', display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20 }}>
        <button onClick={onBack} style={{
          background: 'none', border: '1px solid rgba(255,255,255,0.15)',
          borderRadius: 8, color: '#fff', fontSize: 20,
          width: 44, height: 44, cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>←</button>
        <div>
          <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 10, letterSpacing: 4, fontFamily: 'monospace' }}>
            CAREER MODE
          </div>
          <div style={{ color: '#fff', fontSize: 28, lineHeight: 1 }}>ACROSS AMERICA</div>
        </div>
        {/* collectible count */}
        <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
          <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: 9, fontFamily: 'monospace', letterSpacing: 2 }}>COLLECTED</div>
          <div style={{ color: '#FFD700', fontSize: 20 }}>
            {player.collectibles.length}/{LEVELS.length}
          </div>
        </div>
      </div>

      {/* Route label */}
      <div style={{
        padding: '0 20px', display: 'flex', justifyContent: 'space-between',
        color: 'rgba(255,255,255,0.2)', fontSize: 9, letterSpacing: 3, fontFamily: 'monospace',
        marginBottom: 6,
      }}>
        <span>WEST COAST</span><span>EAST COAST →</span>
      </div>

      {/* Route line */}
      <div style={{
        margin: '0 20px 4px',
        height: 2, background: 'linear-gradient(90deg, #ff6b35, rgba(255,107,53,0.1))', borderRadius: 1,
      }} />

      {/* City cards */}
      <div style={{ padding: '0 20px 40px', display: 'flex', flexDirection: 'column', gap: 4 }}>
        {LEVELS.map((level, idx) => {
          const unlocked = isUnlocked(level);
          const beaten   = rivalBeaten(level);
          const item     = hasItem(level);
          const best     = bestScore(level);
          const done     = doneCount(level);
          const pct      = Math.round((done / level.challenges.length) * 100);

          return (
            <React.Fragment key={level.id}>
              {/* Connector dot */}
              <div style={{ display: 'flex', alignItems: 'center', paddingLeft: 8 }}>
                <div style={{
                  width: 12, height: 12, borderRadius: '50%', flexShrink: 0,
                  background: unlocked ? (beaten ? '#FFD700' : '#ff6b35') : 'rgba(255,255,255,0.1)',
                  border: `2px solid ${unlocked ? (beaten ? '#FFD700' : '#ff6b35') : 'rgba(255,255,255,0.2)'}`,
                  boxShadow: unlocked ? `0 0 12px ${beaten ? '#FFD70044' : '#ff6b3544'}` : 'none',
                }} />
                <div style={{
                  flex: 1, height: 1, marginLeft: 4,
                  background: unlocked ? 'rgba(255,107,53,0.35)' : 'rgba(255,255,255,0.05)',
                }} />
              </div>

              {/* Card */}
              <button
                disabled={!unlocked}
                onClick={() => unlocked && onSelectLevel(level.id)}
                style={{
                  display: 'block', width: '100%', textAlign: 'left',
                  background: !unlocked ? 'rgba(255,255,255,0.02)'
                    : beaten ? 'rgba(255,215,0,0.04)'
                    : 'rgba(255,107,53,0.06)',
                  border: `1px solid ${!unlocked ? 'rgba(255,255,255,0.05)' : beaten ? 'rgba(255,215,0,0.18)' : 'rgba(255,107,53,0.18)'}`,
                  borderRadius: 12, padding: '14px',
                  marginLeft: 16, marginBottom: 4,
                  cursor: unlocked ? 'pointer' : 'not-allowed',
                  fontFamily: "'Bebas Neue', Impact, sans-serif",
                }}
              >
                {/* Top row */}
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ fontSize: 26 }}>{level.rival.avatar}</div>
                    <div>
                      <div style={{ color: unlocked ? '#fff' : 'rgba(255,255,255,0.3)', fontSize: 24, lineHeight: 1 }}>
                        {level.city}
                      </div>
                      <div style={{ color: 'rgba(255,255,255,0.35)', fontSize: 9, fontFamily: 'monospace', letterSpacing: 2 }}>
                        {level.spotName.toUpperCase()} · {level.state}
                      </div>
                    </div>
                  </div>

                  {/* Right side status */}
                  <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: 10 }}>
                    {!unlocked ? (
                      <div style={{ color: 'rgba(255,255,255,0.2)', fontSize: 20 }}>🔒</div>
                    ) : beaten ? (
                      <div>
                        <div style={{ color: '#FFD700', fontSize: 16, lineHeight: 1 }}>★</div>
                        <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: 9, fontFamily: 'monospace' }}>BEATEN</div>
                      </div>
                    ) : (
                      <div style={{ color: '#ff6b35', fontSize: 16 }}>▶</div>
                    )}
                  </div>
                </div>

                {/* Rival score row */}
                {unlocked && (
                  <div style={{ display: 'flex', gap: 10, marginTop: 10, flexWrap: 'wrap' }}>
                    <div style={{
                      background: 'rgba(255,107,53,0.1)', borderRadius: 5, padding: '3px 8px',
                      display: 'flex', gap: 6, alignItems: 'center',
                    }}>
                      <span style={{ fontSize: 13 }}>{level.rival.avatar}</span>
                      <span style={{ color: 'rgba(255,255,255,0.45)', fontSize: 9, fontFamily: 'monospace' }}>
                        {level.rival.name.toUpperCase()} · {formatScore(level.rival.score)}
                      </span>
                    </div>
                    {best > 0 && (
                      <div style={{
                        background: beaten ? 'rgba(255,215,0,0.1)' : 'rgba(255,255,255,0.05)',
                        borderRadius: 5, padding: '3px 8px',
                      }}>
                        <span style={{ color: beaten ? '#FFD700' : 'rgba(255,255,255,0.4)', fontSize: 9, fontFamily: 'monospace' }}>
                          YOUR BEST: {formatScore(best)}
                        </span>
                      </div>
                    )}
                    {/* Collectible badge */}
                    {item && (
                      <div style={{
                        background: 'rgba(255,215,0,0.1)', borderRadius: 5, padding: '3px 8px',
                        display: 'flex', gap: 4, alignItems: 'center',
                      }}>
                        <span style={{ fontSize: 12 }}>{level.collectible.emoji}</span>
                        <span style={{ color: '#FFD700', fontSize: 9, fontFamily: 'monospace' }}>GOT IT</span>
                      </div>
                    )}
                  </div>
                )}

                {/* Challenge progress bar */}
                {unlocked && (
                  <div style={{ marginTop: 10 }}>
                    <div style={{ height: 3, background: 'rgba(255,255,255,0.07)', borderRadius: 2 }}>
                      <div style={{
                        height: '100%', borderRadius: 2, width: `${pct}%`,
                        background: beaten
                          ? 'linear-gradient(90deg, #FFD700, #ffaa00)'
                          : 'linear-gradient(90deg, #ff6b35, #f7c59f)',
                        transition: 'width 0.4s ease',
                      }} />
                    </div>
                    <div style={{
                      color: 'rgba(255,255,255,0.25)', fontSize: 8, fontFamily: 'monospace',
                      marginTop: 4, letterSpacing: 1,
                    }}>
                      {done}/{level.challenges.length} CHALLENGES
                    </div>
                  </div>
                )}
              </button>

              {/* Unlock hint */}
              {!unlocked && idx > 0 && (
                <div style={{
                  marginLeft: 28, marginBottom: 2,
                  color: 'rgba(255,255,255,0.2)', fontSize: 9, fontFamily: 'monospace', letterSpacing: 2,
                }}>
                  BEAT {LEVELS[idx - 1].city.toUpperCase()} TO UNLOCK
                </div>
              )}
            </React.Fragment>
          );
        })}

        {/* More cities teaser */}
        <div style={{
          marginTop: 16, marginLeft: 16,
          padding: '14px', borderRadius: 10,
          background: 'rgba(255,255,255,0.02)', border: '1px dashed rgba(255,255,255,0.06)',
          textAlign: 'center', color: 'rgba(255,255,255,0.15)',
          fontSize: 11, fontFamily: 'monospace', letterSpacing: 2,
        }}>
          MORE CITIES COMING · LA · CHICAGO · NYC · TAMPA
        </div>
      </div>
    </div>
  );
};
