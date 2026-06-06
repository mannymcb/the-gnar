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

export const SpotDetail: React.FC<Props> = ({ level, player, bestScore, onPlay, onBack }) => {
  const done       = level.challenges.filter(c => player.completedChallenges.includes(c.id)).length;
  const beaten     = player.rivalsBeaten.includes(level.id);
  const hasItem    = player.collectibles.includes(level.collectible.id);
  const grade      = bestScore ? getLetterGrade(bestScore) : null;
  const gradeColor = grade ? getGradeColor(grade) : '#fff';
  const beatRival  = bestScore ? bestScore >= level.rival.score : false;

  return (
    <div style={{
      minHeight: '100dvh', background: '#0a0a0f',
      fontFamily: "'Bebas Neue', Impact, sans-serif",
      overflowY: 'auto', paddingBottom: 40,
    }}>
      {/* Hero */}
      <div style={{
        background: `linear-gradient(180deg, ${level.palette.sky[0]} 0%, ${level.palette.sky[1]} 55%, ${level.palette.sky[2]} 100%)`,
        height: 170, position: 'relative', overflow: 'hidden',
      }}>
        {[...Array(6)].map((_,i) => (
          <div key={i} style={{
            position: 'absolute', bottom: 0, left: `${i*18}%`,
            width: `${12+(i%3)*5}%`, height: `${40+(i%4)*15}%`,
            background: 'rgba(0,0,0,0.5)', borderRadius: '2px 2px 0 0',
          }} />
        ))}
        <div style={{ position: 'absolute', top:0, left:0, right:0, padding: '16px', display:'flex', alignItems:'center', gap:12 }}>
          <button onClick={onBack} style={{
            background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(255,255,255,0.2)',
            borderRadius: 8, color:'#fff', fontSize:18, width:40, height:40,
            cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center',
          }}>←</button>
          <div>
            <div style={{ color:'rgba(255,255,255,0.6)', fontSize:10, letterSpacing:3, fontFamily:'monospace' }}>
              {level.state}
            </div>
            <div style={{ color:'#fff', fontSize:34, lineHeight:1, textShadow:'0 2px 8px rgba(0,0,0,0.7)' }}>
              {level.city}
            </div>
          </div>
          {grade && (
            <div style={{ marginLeft:'auto', textAlign:'center' }}>
              <div style={{ fontSize:46, color:gradeColor, lineHeight:1, filter:`drop-shadow(0 0 12px ${gradeColor}66)` }}>
                {grade}
              </div>
              <div style={{ color:'rgba(255,255,255,0.4)', fontSize:8, fontFamily:'monospace', letterSpacing:1 }}>BEST RUN</div>
            </div>
          )}
        </div>
        <div style={{ position:'absolute', bottom:10, left:16, color:'rgba(255,255,255,0.65)', fontSize:11, fontFamily:'monospace', letterSpacing:3 }}>
          {level.spotName.toUpperCase()}
        </div>
      </div>

      <div style={{ padding: '18px' }}>

        {/* ── RIVAL CARD ── */}
        <div style={{ marginBottom: 18 }}>
          <div style={{ color:'rgba(255,255,255,0.3)', fontSize:10, letterSpacing:4, fontFamily:'monospace', marginBottom:10 }}>
            LOCAL RIVAL
          </div>
          <div style={{
            background: beaten ? 'rgba(255,215,0,0.05)' : 'rgba(255,107,53,0.06)',
            border: `1px solid ${beaten ? 'rgba(255,215,0,0.2)' : 'rgba(255,107,53,0.22)'}`,
            borderRadius: 12, padding: '14px',
            display: 'flex', gap: 14, alignItems: 'center',
          }}>
            <div style={{
              fontSize: 40, background:'rgba(255,255,255,0.06)', borderRadius:10,
              width:58, height:58, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0,
            }}>
              {level.rival.avatar}
            </div>
            <div style={{ flex:1, minWidth:0 }}>
              <div style={{ display:'flex', alignItems:'baseline', gap:8 }}>
                <div style={{ color:'#fff', fontSize:22, lineHeight:1 }}>{level.rival.name}</div>
                {beaten && <div style={{ color:'#FFD700', fontSize:14 }}>★ BEATEN</div>}
              </div>
              <div style={{ color:'rgba(255,255,255,0.35)', fontSize:9, fontFamily:'monospace', letterSpacing:2, marginTop:2 }}>
                "{level.rival.nickname}"
              </div>
              <div style={{ display:'flex', gap:8, marginTop:8, flexWrap:'wrap' }}>
                <div style={{
                  background:'rgba(255,107,53,0.12)', borderRadius:6, padding:'3px 10px',
                }}>
                  <div style={{ color:'rgba(255,255,255,0.35)', fontSize:7, fontFamily:'monospace', letterSpacing:1 }}>SCORE TO BEAT</div>
                  <div style={{ color:'#ff6b35', fontSize:18, lineHeight:1.1 }}>{formatScore(level.rival.score)}</div>
                </div>
                {bestScore != null && bestScore > 0 && (
                  <div style={{
                    background: beatRival ? 'rgba(255,215,0,0.1)' : 'rgba(255,255,255,0.05)',
                    borderRadius:6, padding:'3px 10px',
                  }}>
                    <div style={{ color:'rgba(255,255,255,0.3)', fontSize:7, fontFamily:'monospace', letterSpacing:1 }}>YOUR BEST</div>
                    <div style={{ color: beatRival ? '#FFD700' : 'rgba(255,255,255,0.6)', fontSize:18, lineHeight:1.1 }}>{formatScore(bestScore)}</div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* ── COLLECTIBLE ── */}
        <div style={{
          background: hasItem ? 'rgba(255,215,0,0.05)' : 'rgba(255,255,255,0.03)',
          border: `1px solid ${hasItem ? 'rgba(255,215,0,0.2)' : 'rgba(255,255,255,0.06)'}`,
          borderRadius: 10, padding:'12px 14px', marginBottom:18,
          display:'flex', alignItems:'center', gap:12,
        }}>
          <div style={{ fontSize:30, opacity: hasItem ? 1 : 0.4 }}>{level.collectible.emoji}</div>
          <div style={{ flex:1 }}>
            <div style={{ display:'flex', alignItems:'center', gap:8 }}>
              <div style={{ color: hasItem ? '#FFD700' : 'rgba(255,255,255,0.55)', fontSize:16, lineHeight:1 }}>
                {level.collectible.name}
              </div>
              {hasItem && <div style={{ color:'#FFD700', fontSize:11 }}>✓</div>}
            </div>
            <div style={{ color:'rgba(255,255,255,0.3)', fontSize:9, fontFamily:'monospace', marginTop:3 }}>
              {hasItem ? level.collectible.description : `Unlock: ${level.collectible.unlockCondition}`}
            </div>
          </div>
        </div>

        {/* ── SPOT DESCRIPTION ── */}
        <div style={{
          background:'rgba(255,255,255,0.03)', border:'1px solid rgba(255,255,255,0.06)',
          borderRadius:10, padding:'12px', marginBottom:18,
          color:'rgba(255,255,255,0.45)', fontSize:11, fontFamily:'monospace', lineHeight:1.6,
        }}>
          {level.description}
        </div>

        {/* ── CHALLENGES ── */}
        <div style={{ marginBottom:22 }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10 }}>
            <div style={{ color:'rgba(255,255,255,0.3)', fontSize:10, letterSpacing:4, fontFamily:'monospace' }}>
              CHALLENGES
            </div>
            <div style={{ color:'rgba(255,255,255,0.3)', fontSize:10, fontFamily:'monospace' }}>
              {done}/{level.challenges.length}
            </div>
          </div>
          <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
            {level.challenges.map(ch => {
              const isDone = player.completedChallenges.includes(ch.id);
              return (
                <div key={ch.id} style={{
                  display:'flex', justifyContent:'space-between', alignItems:'center',
                  padding:'10px 12px',
                  background: isDone ? 'rgba(0,255,136,0.04)' : 'rgba(255,255,255,0.02)',
                  border: `1px solid ${isDone ? 'rgba(0,255,136,0.14)' : 'rgba(255,255,255,0.06)'}`,
                  borderRadius:8,
                }}>
                  <div style={{ flex:1 }}>
                    <div style={{
                      color: isDone ? 'rgba(255,255,255,0.4)' : 'rgba(255,255,255,0.7)',
                      fontSize:13, letterSpacing:1,
                      textDecoration: isDone ? 'line-through' : 'none',
                    }}>{ch.description}</div>
                    <div style={{ color:'rgba(255,255,255,0.2)', fontSize:9, fontFamily:'monospace', marginTop:2 }}>
                      +${ch.reward.cash}
                    </div>
                  </div>
                  <div style={{ marginLeft:12 }}>
                    {isDone
                      ? <span style={{ color:'#00ff88', fontSize:16 }}>✓</span>
                      : <span style={{ color:'rgba(255,255,255,0.2)', fontSize:14 }}>○</span>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── CTA ── */}
        <button onClick={onPlay} style={{
          width:'100%', background:'linear-gradient(135deg, #ff6b35, #f7c59f)',
          border:'none', borderRadius:10, color:'#fff',
          fontSize:24, letterSpacing:4, padding:'20px',
          fontFamily:"'Bebas Neue', Impact, sans-serif",
          cursor:'pointer', boxShadow:'0 6px 28px rgba(255,107,53,0.4)',
        }}>
          🛹 CHALLENGE {level.rival.name.toUpperCase()}
        </button>
      </div>
    </div>
  );
};
