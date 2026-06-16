import React from 'react';
import type { City, Player, TrickResult } from '../game/types';
import { formatScore, grade } from '../game/scoring';

interface Props {
  city: City;
  player: Player;
  score: number;
  tricks: TrickResult[];
  onRetry: () => void;
  onCities: () => void;
}

export const RunResults: React.FC<Props> = ({ city, player, score, tricks, onRetry, onCities }) => {
  const { letter, color } = grade(score);
  const won = score >= city.rival.score;
  const prev = player.bestScores[city.id] ?? 0;
  const isNewBest = score > prev;
  const landed = tricks.filter(t => t.name !== '__death');
  const maxCombo = Math.max(...tricks.map(t => t.combo), 1);

  return (
    <div style={{ minHeight: '100dvh', background: '#0a0a0f', fontFamily: "'Bebas Neue',Impact,sans-serif", overflowY: 'auto', padding: '24px 20px 48px' }}>
      {/* Grade */}
      <div style={{ textAlign: 'center', marginBottom: 20 }}>
        <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: 10, letterSpacing: 4, fontFamily: 'monospace', marginBottom: 6 }}>{city.name.toUpperCase()}</div>
        <div style={{ fontSize: 88, lineHeight: 1, color, filter: `drop-shadow(0 0 28px ${color}88)` }}>{letter}</div>
        <div style={{ color: '#fff', fontSize: 44 }}>{formatScore(score)}</div>
        {isNewBest && <div style={{ color: '#FFD700', fontSize: 14, letterSpacing: 3, marginTop: 4 }}>⭐ NEW BEST!</div>}
      </div>

      {/* Rival result */}
      <div style={{ background: won ? 'rgba(0,255,136,0.06)' : 'rgba(255,60,60,0.05)', border: `1px solid ${won ? 'rgba(0,255,136,0.22)' : 'rgba(255,60,60,0.18)'}`, borderRadius: 12, padding: '14px', marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ fontSize: 30 }}>{city.rival.avatar}</div>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <div style={{ color: '#fff', fontSize: 18 }}>{city.rival.name}</div>
              <div style={{ background: won ? 'rgba(0,255,136,0.15)' : 'rgba(255,60,60,0.15)', borderRadius: 5, padding: '2px 8px', color: won ? '#00ff88' : '#ff5555', fontSize: 12 }}>
                {won ? '★ BEATEN!' : '✗ NOT YET'}
              </div>
            </div>
            <div style={{ color: 'rgba(255,255,255,0.35)', fontSize: 9, fontFamily: 'monospace', marginTop: 2 }}>
              {formatScore(score)} vs {formatScore(city.rival.score)} to beat
              {!won && <span style={{ color: '#ff6b35', marginLeft: 8 }}>need +{formatScore(city.rival.score - score)}</span>}
            </div>
          </div>
        </div>
        <div style={{ marginTop: 10, padding: '8px 12px', background: 'rgba(255,255,255,0.04)', borderRadius: 8, color: 'rgba(255,255,255,0.55)', fontSize: 11, fontFamily: 'monospace', lineHeight: 1.6 }}>
          "{won ? city.rival.defeatLine : city.rival.lossLine}"
        </div>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 14 }}>
        {[['TRICKS', landed.length], ['MAX COMBO', `x${Math.min(maxCombo, 5)}`], ['BEST TRICK', landed.length > 0 ? formatScore(Math.max(...landed.map(t => t.total))) : '—']].map(([l, v]) => (
          <div key={l as string} style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 8, padding: '10px 8px', textAlign: 'center' }}>
            <div style={{ color: '#ff6b35', fontSize: 18, lineHeight: 1 }}>{v}</div>
            <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: 7, fontFamily: 'monospace', letterSpacing: 1, marginTop: 3 }}>{l}</div>
          </div>
        ))}
      </div>

      {/* Trick log */}
      {landed.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: 10, letterSpacing: 3, fontFamily: 'monospace', marginBottom: 8 }}>TRICK LOG</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            {[...landed].reverse().slice(0, 10).map((t, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                <span style={{ color: 'rgba(255,255,255,0.65)', fontSize: 13 }}>{t.name}</span>
                <span style={{ color: 'rgba(255,255,255,0.35)', fontSize: 10, fontFamily: 'monospace' }}>+{formatScore(t.total)}{t.combo >= 2 ? ` x${Math.min(t.combo, 5)}` : ''}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Actions */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <button onClick={onRetry} style={{ background: 'linear-gradient(135deg,#ff6b35,#f7c59f)', border: 'none', borderRadius: 10, color: '#fff', fontSize: 22, letterSpacing: 4, padding: '16px', fontFamily: "'Bebas Neue',Impact,sans-serif", cursor: 'pointer', boxShadow: '0 4px 18px rgba(255,107,53,0.38)' }}>🔄 RUN IT AGAIN</button>
        <button onClick={onCities} style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, color: '#fff', fontSize: 18, letterSpacing: 3, padding: '14px', fontFamily: "'Bebas Neue',Impact,sans-serif", cursor: 'pointer' }}>← PICK CITY</button>
      </div>
    </div>
  );
};
