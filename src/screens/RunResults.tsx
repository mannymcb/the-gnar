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
  const grade      = getLetterGrade(score);
  const gradeColor = getGradeColor(grade);
  const bails      = trickHistory.filter(t => t.landingQuality === 'bail').length;
  const landed     = trickHistory.filter(t => t.landingQuality !== 'bail').length;
  const maxCombo   = Math.max(...trickHistory.map(t => t.multiplier), 1);
  const topTrick   = trickHistory.reduce<TrickResult | null>((b,t) => !b || t.total > b.total ? t : b, null);

  const beatRival  = score >= level.rival.score;
  const alreadyWon = player.rivalsBeaten.includes(level.id);
  const isNewWin   = beatRival && !alreadyWon;

  // Challenge completion
  const newlyCompleted: string[] = [];
  let earnedCash = 0;

  for (const ch of level.challenges) {
    if (player.completedChallenges.includes(ch.id)) continue;
    let completed = false;
    if (ch.type === 'score')  completed = score >= (ch.target as number);
    if (ch.type === 'trick')  completed = trickHistory.some(t => t.trick.id === ch.target && t.landingQuality !== 'bail');
    if (ch.type === 'grind')  completed = trickHistory.some(t => t.trick.category === 'grind' && t.landingQuality !== 'bail');
    if (ch.type === 'manual') completed = trickHistory.filter(t => t.trick.category === 'manual' && t.landingQuality !== 'bail').length >= (ch.target as number);
    if (ch.type === 'combo') {
      const best = trickHistory.reduce((mx, _, i, arr) => {
        let streak = 0;
        for (let j=i; j<arr.length && arr[j].landingQuality!=='bail'; j++) streak++;
        return Math.max(mx, streak);
      }, 0);
      completed = best >= (ch.target as number);
    }
    if (completed) { newlyCompleted.push(ch.id); earnedCash += ch.reward.cash; }
  }

  const handleContinue = () => {
    onComplete(earnedCash, newlyCompleted);
    onMap();
  };

  return (
    <div style={{
      minHeight: '100dvh', background: '#0a0a0f',
      fontFamily: "'Bebas Neue', Impact, sans-serif",
      overflowY: 'auto', padding: '24px 20px 48px',
    }}>
      {/* Grade + score */}
      <div style={{ textAlign:'center', marginBottom:20 }}>
        <div style={{ color:'rgba(255,255,255,0.3)', fontSize:10, letterSpacing:4, fontFamily:'monospace', marginBottom:6 }}>
          {level.city.toUpperCase()} · {level.spotName.toUpperCase()}
        </div>
        <div style={{ fontSize:90, lineHeight:1, color:gradeColor, filter:`drop-shadow(0 0 28px ${gradeColor}88)` }}>
          {grade}
        </div>
        <div style={{ color:'#fff', fontSize:44 }}>{formatScore(score)}</div>
      </div>

      {/* ── RIVAL RESULT ── */}
      <div style={{
        background: beatRival ? 'rgba(0,255,136,0.06)' : 'rgba(255,60,60,0.05)',
        border: `1px solid ${beatRival ? 'rgba(0,255,136,0.22)' : 'rgba(255,60,60,0.18)'}`,
        borderRadius: 12, padding:'14px', marginBottom:16,
      }}>
        <div style={{ display:'flex', alignItems:'center', gap:12 }}>
          <div style={{ fontSize:32 }}>{level.rival.avatar}</div>
          <div style={{ flex:1 }}>
            <div style={{ display:'flex', gap:8, alignItems:'center' }}>
              <div style={{ color:'#fff', fontSize:18 }}>{level.rival.name}</div>
              <div style={{
                background: beatRival ? 'rgba(0,255,136,0.15)' : 'rgba(255,60,60,0.15)',
                borderRadius:5, padding:'2px 8px',
                color: beatRival ? '#00ff88' : '#ff5555', fontSize:12,
              }}>
                {beatRival ? (isNewWin ? '★ FIRST WIN!' : '✓ BEATEN') : '✗ NOT YET'}
              </div>
            </div>
            <div style={{ color:'rgba(255,255,255,0.35)', fontSize:9, fontFamily:'monospace', marginTop:3 }}>
              {formatScore(score)} vs {formatScore(level.rival.score)} to beat
            </div>
          </div>
          {!beatRival && (
            <div style={{ textAlign:'right' }}>
              <div style={{ color:'rgba(255,255,255,0.3)', fontSize:9, fontFamily:'monospace' }}>NEED</div>
              <div style={{ color:'#ff6b35', fontSize:16 }}>+{formatScore(level.rival.score - score)}</div>
            </div>
          )}
        </div>

        {/* Rival quote */}
        <div style={{
          marginTop:10, padding:'10px 12px',
          background:'rgba(255,255,255,0.04)', borderRadius:8,
          color:'rgba(255,255,255,0.55)', fontSize:11, fontFamily:'monospace', lineHeight:1.6,
        }}>
          "{beatRival
            ? level.rival.defeats[Math.floor(Math.random() * level.rival.defeats.length)]
            : level.rival.lossLines[Math.floor(Math.random() * level.rival.lossLines.length)]
          }"
        </div>
      </div>

      {/* Collectible unlock */}
      {isNewWin && (
        <div style={{
          background:'rgba(255,215,0,0.06)', border:'1px solid rgba(255,215,0,0.24)',
          borderRadius:12, padding:'12px 14px', marginBottom:16,
          display:'flex', alignItems:'center', gap:14,
        }}>
          <div style={{
            fontSize:32, background:'rgba(255,215,0,0.1)', borderRadius:10,
            width:52, height:52, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0,
          }}>
            {level.collectible.emoji}
          </div>
          <div>
            <div style={{ color:'#FFD700', fontSize:12, letterSpacing:3, marginBottom:2 }}>COLLECTIBLE UNLOCKED!</div>
            <div style={{ color:'#fff', fontSize:18, lineHeight:1 }}>{level.collectible.name}</div>
            <div style={{ color:'rgba(255,255,255,0.35)', fontSize:10, fontFamily:'monospace', marginTop:3 }}>
              {level.collectible.description}
            </div>
          </div>
        </div>
      )}

      {/* Run stats */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:8, marginBottom:16 }}>
        {[
          { label:'LANDED', val: landed },
          { label:'BAILS',  val: bails  },
          { label:'MAX x',  val: `${maxCombo}x` },
          { label:'TOP TRICK', val: topTrick ? formatScore(topTrick.total) : '—' },
          { label:'BEST MOVE', val: topTrick?.trick.name ?? '—' },
          { label:'CASH',  val: earnedCash > 0 ? `+$${earnedCash}` : '—' },
        ].map(s => (
          <div key={s.label} style={{
            background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.07)',
            borderRadius:8, padding:'8px', textAlign:'center',
          }}>
            <div style={{ color:'#ff6b35', fontSize:16, lineHeight:1 }}>{s.val}</div>
            <div style={{ color:'rgba(255,255,255,0.3)', fontSize:7, fontFamily:'monospace', letterSpacing:1, marginTop:3 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Challenges */}
      {(newlyCompleted.length > 0 || level.challenges.some(c => player.completedChallenges.includes(c.id))) && (
        <div style={{ marginBottom:18 }}>
          <div style={{ color:'rgba(255,255,255,0.3)', fontSize:10, letterSpacing:4, fontFamily:'monospace', marginBottom:8 }}>
            CHALLENGES
          </div>
          <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
            {level.challenges.map(ch => {
              const wasAlready = player.completedChallenges.includes(ch.id);
              const justDone   = newlyCompleted.includes(ch.id);
              const isDone     = wasAlready || justDone;
              if (!isDone) return null;
              return (
                <div key={ch.id} style={{
                  display:'flex', justifyContent:'space-between', alignItems:'center',
                  padding:'9px 12px',
                  background: justDone ? 'rgba(0,255,136,0.06)' : 'rgba(255,255,255,0.03)',
                  border: `1px solid ${justDone ? 'rgba(0,255,136,0.22)' : 'rgba(255,255,255,0.06)'}`,
                  borderRadius:8,
                }}>
                  <div style={{ color:'rgba(255,255,255,0.6)', fontSize:13, flex:1 }}>{ch.description}</div>
                  <div style={{ display:'flex', gap:8, alignItems:'center' }}>
                    {justDone && <span style={{ color:'#00ff88', fontSize:12, fontFamily:'monospace' }}>+${ch.reward.cash}</span>}
                    <span style={{ color:'#00ff88', fontSize:15 }}>✓</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Trick log */}
      {trickHistory.length > 0 && (
        <div style={{ marginBottom:20 }}>
          <div style={{ color:'rgba(255,255,255,0.3)', fontSize:10, letterSpacing:4, fontFamily:'monospace', marginBottom:8 }}>
            TRICK LOG
          </div>
          <div style={{ display:'flex', flexDirection:'column', gap:3 }}>
            {[...trickHistory].reverse().slice(0,10).map((t,i) => (
              <div key={i} style={{
                display:'flex', justifyContent:'space-between', alignItems:'center',
                padding:'5px 0', borderBottom:'1px solid rgba(255,255,255,0.04)',
              }}>
                <span style={{
                  color: t.landingQuality==='bail' ? '#ff4444' : t.landingQuality==='perfect' ? '#FFD700' : 'rgba(255,255,255,0.6)',
                  fontSize:13,
                }}>{t.trick.name}</span>
                <span style={{ color:'rgba(255,255,255,0.3)', fontSize:10, fontFamily:'monospace' }}>
                  {t.landingQuality==='bail' ? 'BAIL' : `+${formatScore(t.total)} ×${t.multiplier}`}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Actions */}
      <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
        <button onClick={onRetry} style={{
          background:'linear-gradient(135deg, #ff6b35, #f7c59f)',
          border:'none', borderRadius:10, color:'#fff',
          fontSize:20, letterSpacing:4, padding:'16px',
          fontFamily:"'Bebas Neue', Impact, sans-serif", cursor:'pointer',
          boxShadow:'0 4px 18px rgba(255,107,53,0.38)',
        }}>🔄 RUN IT AGAIN</button>
        <button onClick={handleContinue} style={{
          background:'rgba(255,255,255,0.06)', border:'1px solid rgba(255,255,255,0.1)',
          borderRadius:10, color:'#fff', fontSize:18, letterSpacing:3, padding:'14px',
          fontFamily:"'Bebas Neue', Impact, sans-serif", cursor:'pointer',
        }}>← BACK TO MAP</button>
      </div>
    </div>
  );
};
