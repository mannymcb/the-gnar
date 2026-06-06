import React, { useEffect, useState } from 'react';
import type { Level } from '../game/types';
import { formatScore } from '../game/scoring';

interface IntroProps {
  level: Level;
  alreadyBeaten: boolean;
  onSkate: () => void;
  onBack: () => void;
}

interface ResultProps {
  level: Level;
  playerScore: number;
  won: boolean;
  isNewWin: boolean;
  onContinue: () => void;
  onRetry: () => void;
}

// ─── RIVAL INTRO ──────────────────────────────────────────────────────────────
export const RivalIntro: React.FC<IntroProps> = ({ level, alreadyBeaten, onSkate, onBack }) => {
  const { rival, collectible, palette } = level;
  const [lineIdx, setLineIdx] = useState(0);
  const taunt = rival.taunts[lineIdx % rival.taunts.length];

  return (
    <div style={{
      minHeight: '100dvh', background: '#0a0a0f', display: 'flex', flexDirection: 'column',
      fontFamily: "'Bebas Neue', Impact, sans-serif",
    }}>
      {/* City colour band */}
      <div style={{
        background: `linear-gradient(135deg, ${palette.sky[0]}, ${palette.sky[1]})`,
        padding: '20px 20px 28px',
        position: 'relative', overflow: 'hidden',
      }}>
        <button onClick={onBack} style={{
          background: 'rgba(0,0,0,0.35)', border: '1px solid rgba(255,255,255,0.2)',
          borderRadius: 8, color: '#fff', fontSize: 18, width: 38, height: 38,
          cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
          marginBottom: 16,
        }}>←</button>

        {/* Location */}
        <div style={{ color: 'rgba(255,255,255,0.55)', fontSize: 10, letterSpacing: 4, fontFamily: 'monospace' }}>
          {level.state} · {level.spotName.toUpperCase()}
        </div>
        <div style={{ color: '#fff', fontSize: 42, lineHeight: 1, marginTop: 2 }}>
          {level.city}
        </div>

        {/* Decorative travel marker */}
        <div style={{
          position: 'absolute', right: 20, top: 20,
          fontSize: 52, opacity: 0.18,
        }}>🛣️</div>
      </div>

      {/* Rival card */}
      <div style={{ padding: '20px', flex: 1, display: 'flex', flexDirection: 'column', gap: 16 }}>

        <div style={{ color: 'rgba(255,255,255,0.35)', fontSize: 10, letterSpacing: 4, fontFamily: 'monospace' }}>
          LOCAL RIVAL
        </div>

        <div style={{
          background: alreadyBeaten ? 'rgba(0,255,136,0.05)' : 'rgba(255,107,53,0.06)',
          border: `1px solid ${alreadyBeaten ? 'rgba(0,255,136,0.2)' : 'rgba(255,107,53,0.25)'}`,
          borderRadius: 14, padding: '18px',
          display: 'flex', gap: 16, alignItems: 'flex-start',
        }}>
          {/* Avatar */}
          <div style={{
            fontSize: 48, lineHeight: 1, flexShrink: 0,
            background: 'rgba(255,255,255,0.06)', borderRadius: 12,
            width: 68, height: 68, display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            {rival.avatar}
          </div>

          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ color: '#fff', fontSize: 26, lineHeight: 1 }}>{rival.name}</div>
            <div style={{
              color: 'rgba(255,255,255,0.4)', fontSize: 10, fontFamily: 'monospace',
              letterSpacing: 2, marginTop: 3,
            }}>
              "{rival.nickname}"
            </div>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8, marginTop: 10,
            }}>
              <div style={{
                background: 'rgba(255,107,53,0.15)', border: '1px solid rgba(255,107,53,0.3)',
                borderRadius: 6, padding: '4px 10px',
              }}>
                <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 8, fontFamily: 'monospace', letterSpacing: 1 }}>SCORE TO BEAT</div>
                <div style={{ color: '#ff6b35', fontSize: 20, lineHeight: 1.1 }}>{formatScore(rival.score)}</div>
              </div>
              {alreadyBeaten && (
                <div style={{
                  background: 'rgba(0,255,136,0.12)', border: '1px solid rgba(0,255,136,0.3)',
                  borderRadius: 6, padding: '4px 10px',
                }}>
                  <div style={{ color: '#00ff88', fontSize: 14 }}>✓ BEATEN</div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Taunt bubble */}
        <div
          style={{
            background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 12, padding: '14px 16px', cursor: 'pointer',
            position: 'relative',
          }}
          onClick={() => setLineIdx(i => i + 1)}
        >
          <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: 9, fontFamily: 'monospace', letterSpacing: 2, marginBottom: 6 }}>
            {rival.name.toUpperCase()} SAYS:
          </div>
          <div style={{
            color: 'rgba(255,255,255,0.75)', fontSize: 13, fontFamily: 'monospace',
            lineHeight: 1.6, letterSpacing: 0.3,
          }}>
            "{taunt}"
          </div>
          {rival.taunts.length > 1 && (
            <div style={{
              position: 'absolute', bottom: 8, right: 12,
              color: 'rgba(255,255,255,0.2)', fontSize: 9, fontFamily: 'monospace',
            }}>
              tap for more
            </div>
          )}
        </div>

        {/* Collectible preview */}
        <div style={{
          background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)',
          borderRadius: 10, padding: '12px 14px',
          display: 'flex', alignItems: 'center', gap: 12,
        }}>
          <div style={{ fontSize: 28 }}>{collectible.emoji}</div>
          <div style={{ flex: 1 }}>
            <div style={{ color: 'rgba(255,255,255,0.25)', fontSize: 9, fontFamily: 'monospace', letterSpacing: 2 }}>
              COLLECTIBLE
            </div>
            <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: 14, lineHeight: 1.2, marginTop: 2 }}>
              {collectible.name}
            </div>
            <div style={{ color: 'rgba(255,255,255,0.25)', fontSize: 9, fontFamily: 'monospace', marginTop: 3 }}>
              {collectible.unlockCondition}
            </div>
          </div>
        </div>

        {/* CTA */}
        <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <button onClick={onSkate} style={{
            background: 'linear-gradient(135deg, #ff6b35, #f7c59f)',
            border: 'none', borderRadius: 10, color: '#fff',
            fontSize: 24, letterSpacing: 4, padding: '18px',
            fontFamily: "'Bebas Neue', Impact, sans-serif",
            cursor: 'pointer', boxShadow: '0 4px 24px rgba(255,107,53,0.45)',
          }}>
            {alreadyBeaten ? '🔄 RUN IT AGAIN' : '🛹 ACCEPT THE CHALLENGE'}
          </button>
        </div>
      </div>
    </div>
  );
};

// ─── RIVAL RESULT ─────────────────────────────────────────────────────────────
export const RivalResult: React.FC<ResultProps> = ({
  level, playerScore, won, isNewWin, onContinue, onRetry,
}) => {
  const { rival, collectible } = level;
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 80);
    return () => clearTimeout(t);
  }, []);

  const quote = won
    ? rival.defeats[Math.floor(Math.random() * rival.defeats.length)]
    : rival.lossLines[Math.floor(Math.random() * rival.lossLines.length)];

  return (
    <div style={{
      minHeight: '100dvh', background: '#0a0a0f',
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      fontFamily: "'Bebas Neue', Impact, sans-serif",
      padding: '0 20px 40px',
      opacity: visible ? 1 : 0, transition: 'opacity 0.3s ease',
    }}>
      {/* Result banner */}
      <div style={{
        width: 'calc(100% + 40px)', marginLeft: -20,
        background: won
          ? 'linear-gradient(135deg, #003322, #006644)'
          : 'linear-gradient(135deg, #220000, #441111)',
        padding: '32px 20px 24px',
        textAlign: 'center', marginBottom: 24,
      }}>
        <div style={{
          fontSize: won ? 64 : 52, lineHeight: 1,
          filter: `drop-shadow(0 0 24px ${won ? '#00ff8866' : '#ff444466'})`,
        }}>
          {won ? '🏆' : '💀'}
        </div>
        <div style={{
          color: won ? '#00ff88' : '#ff4444',
          fontSize: 36, letterSpacing: 4, marginTop: 8,
        }}>
          {won ? (isNewWin ? 'FIRST BLOOD!' : 'RIVAL BEATEN!') : 'NOT TODAY'}
        </div>
        <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11, fontFamily: 'monospace', letterSpacing: 2, marginTop: 4 }}>
          {formatScore(playerScore)} vs {formatScore(rival.score)} to beat
        </div>
      </div>

      {/* Score comparison */}
      <div style={{
        width: '100%', background: 'rgba(255,255,255,0.04)',
        border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12,
        padding: '14px', marginBottom: 16,
        display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: 8, alignItems: 'center',
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ color: 'rgba(255,255,255,0.35)', fontSize: 9, fontFamily: 'monospace', letterSpacing: 1 }}>YOUR SCORE</div>
          <div style={{ color: won ? '#00ff88' : '#fff', fontSize: 28 }}>{formatScore(playerScore)}</div>
        </div>
        <div style={{ color: 'rgba(255,255,255,0.2)', fontSize: 18 }}>vs</div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ color: 'rgba(255,255,255,0.35)', fontSize: 9, fontFamily: 'monospace', letterSpacing: 1 }}>{rival.name.toUpperCase()}</div>
          <div style={{ color: won ? 'rgba(255,255,255,0.4)' : '#ff6b35', fontSize: 28 }}>{formatScore(rival.score)}</div>
        </div>
      </div>

      {/* Rival quote */}
      <div style={{
        width: '100%',
        background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)',
        borderRadius: 10, padding: '14px', marginBottom: 16,
      }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
          <div style={{ fontSize: 28, flexShrink: 0 }}>{rival.avatar}</div>
          <div>
            <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: 9, fontFamily: 'monospace', letterSpacing: 2, marginBottom: 5 }}>
              {rival.name.toUpperCase()}:
            </div>
            <div style={{
              color: 'rgba(255,255,255,0.7)', fontSize: 12, fontFamily: 'monospace',
              lineHeight: 1.6,
            }}>
              "{quote}"
            </div>
          </div>
        </div>
      </div>

      {/* Collectible unlock */}
      {won && isNewWin && (
        <div style={{
          width: '100%',
          background: 'rgba(255,215,0,0.06)', border: '1px solid rgba(255,215,0,0.25)',
          borderRadius: 12, padding: '14px', marginBottom: 16,
          display: 'flex', alignItems: 'center', gap: 14,
        }}>
          <div style={{
            fontSize: 36, background: 'rgba(255,215,0,0.12)',
            borderRadius: 10, width: 56, height: 56,
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>
            {collectible.emoji}
          </div>
          <div>
            <div style={{ color: '#FFD700', fontSize: 11, letterSpacing: 3, marginBottom: 3 }}>
              COLLECTIBLE UNLOCKED!
            </div>
            <div style={{ color: '#fff', fontSize: 18, lineHeight: 1 }}>{collectible.name}</div>
            <div style={{ color: 'rgba(255,255,255,0.35)', fontSize: 10, fontFamily: 'monospace', marginTop: 4 }}>
              {collectible.description}
            </div>
          </div>
        </div>
      )}

      {/* Buttons */}
      <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 10, marginTop: 'auto' }}>
        <button onClick={onContinue} style={{
          background: won
            ? 'linear-gradient(135deg, #00aa55, #00ff88)'
            : 'linear-gradient(135deg, #ff6b35, #f7c59f)',
          border: 'none', borderRadius: 10, color: won ? '#000' : '#fff',
          fontSize: 22, letterSpacing: 3, padding: '17px',
          fontFamily: "'Bebas Neue', Impact, sans-serif",
          cursor: 'pointer', boxShadow: won ? '0 4px 20px rgba(0,255,136,0.3)' : '0 4px 20px rgba(255,107,53,0.35)',
        }}>
          {won ? '→ KEEP ROLLING' : '→ NEXT CITY'}
        </button>
        <button onClick={onRetry} style={{
          background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: 10, color: '#fff', fontSize: 18, letterSpacing: 3, padding: '14px',
          fontFamily: "'Bebas Neue', Impact, sans-serif", cursor: 'pointer',
        }}>
          🔄 RUN IT AGAIN
        </button>
      </div>
    </div>
  );
};
