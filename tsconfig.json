import React from 'react';
import { CITIES } from '../game/cities';
import { formatScore } from '../game/scoring';
import type { Player } from '../game/types';

interface Props {
  player: Player;
  onSelect: (cityId: string) => void;
  onBack: () => void;
}

export const CitySelect: React.FC<Props> = ({ player, onSelect, onBack }) => {
  return (
    <div style={{ minHeight: '100dvh', background: '#0a0a0f', fontFamily: "'Bebas Neue',Impact,sans-serif", overflowY: 'auto', paddingBottom: 40 }}>
      <div style={{ padding: '20px 20px 0', display: 'flex', alignItems: 'center', gap: 14, marginBottom: 20 }}>
        <button onClick={onBack} style={{ background: 'none', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 8, color: '#fff', fontSize: 20, width: 44, height: 44, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>←</button>
        <div>
          <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: 10, letterSpacing: 4, fontFamily: 'monospace' }}>SELECT CITY</div>
          <div style={{ color: '#fff', fontSize: 28, lineHeight: 1 }}>WHERE TO SKATE?</div>
        </div>
      </div>

      <div style={{ padding: '0 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {CITIES.map((city, idx) => {
          const unlocked = player.unlockedCities.includes(city.id);
          const beaten = player.rivalsBeaten.includes(city.id);
          const best = player.bestScores[city.id] ?? 0;
          const prevCity = idx > 0 ? CITIES[idx - 1] : null;

          return (
            <button
              key={city.id}
              disabled={!unlocked}
              onClick={() => unlocked && onSelect(city.id)}
              style={{
                display: 'block', width: '100%', textAlign: 'left', cursor: unlocked ? 'pointer' : 'not-allowed',
                background: !unlocked ? 'rgba(255,255,255,0.02)' : beaten ? 'rgba(255,215,0,0.05)' : 'rgba(255,107,53,0.06)',
                border: `1px solid ${!unlocked ? 'rgba(255,255,255,0.05)' : beaten ? 'rgba(255,215,0,0.22)' : 'rgba(255,107,53,0.22)'}`,
                borderRadius: 14, padding: '16px',
                fontFamily: "'Bebas Neue',Impact,sans-serif",
              }}
            >
              {/* City hero strip */}
              <div style={{ height: 6, borderRadius: 3, background: `linear-gradient(90deg, ${city.palette.sky[0]}, ${city.palette.sky[2]})`, marginBottom: 12, opacity: unlocked ? 1 : 0.3 }} />

              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                  <div style={{ fontSize: 34, opacity: unlocked ? 1 : 0.3 }}>{city.rival.avatar}</div>
                  <div>
                    <div style={{ color: unlocked ? '#fff' : 'rgba(255,255,255,0.25)', fontSize: 28, lineHeight: 1 }}>{city.name}</div>
                    <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: 9, fontFamily: 'monospace', letterSpacing: 2 }}>{city.state} · {city.tagline.split('.')[0]}</div>
                  </div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: 10 }}>
                  {!unlocked ? <div style={{ fontSize: 24, opacity: 0.3 }}>🔒</div>
                    : beaten ? <div style={{ color: '#FFD700', fontSize: 22 }}>★</div>
                    : <div style={{ color: '#ff6b35', fontSize: 18 }}>▶</div>}
                </div>
              </div>

              {unlocked && (
                <div style={{ marginTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <div style={{ background: 'rgba(255,107,53,0.12)', borderRadius: 6, padding: '3px 10px' }}>
                    <span style={{ color: 'rgba(255,255,255,0.35)', fontSize: 8, fontFamily: 'monospace' }}>RIVAL SCORE  </span>
                    <span style={{ color: '#ff6b35', fontSize: 14 }}>{formatScore(city.rival.score)}</span>
                  </div>
                  {best > 0 && (
                    <div style={{ background: beaten ? 'rgba(255,215,0,0.1)' : 'rgba(255,255,255,0.05)', borderRadius: 6, padding: '3px 10px' }}>
                      <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: 8, fontFamily: 'monospace' }}>YOUR BEST  </span>
                      <span style={{ color: beaten ? '#FFD700' : 'rgba(255,255,255,0.6)', fontSize: 14 }}>{formatScore(best)}</span>
                    </div>
                  )}
                </div>
              )}

              {!unlocked && prevCity && (
                <div style={{ color: 'rgba(255,255,255,0.2)', fontSize: 9, fontFamily: 'monospace', letterSpacing: 1, marginTop: 8 }}>
                  BEAT {prevCity.name.toUpperCase()} RIVAL TO UNLOCK
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
};
