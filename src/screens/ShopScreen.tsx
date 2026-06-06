import React, { useState } from 'react';
import type { Player } from '../game/types';
import { SHOP_ITEMS } from '../game/shop';
import { getEquipmentBonus } from '../game/save';

interface Props {
  player: Player;
  onBuy: (itemId: string) => { success: boolean; message: string };
  onBack: () => void;
}

const CATEGORY_LABELS: Record<string, string> = {
  deck: '🛹 DECK',
  trucks: '⚙️ TRUCKS',
  wheels: '🔵 WHEELS',
  bearings: '🔩 BEARINGS',
  shoes: '👟 SHOES',
};

const STAT_LABELS: Record<string, string> = {
  pop: 'POP',
  speed: 'SPEED',
  balance: 'BALANCE',
  style: 'STYLE',
  nerve: 'NERVE',
  endurance: 'ENDURANCE',
};

export const ShopScreen: React.FC<Props> = ({ player, onBuy, onBack }) => {
  const [activeCategory, setActiveCategory] = useState<keyof typeof CATEGORY_LABELS>('deck');
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);

  const eqBonus = getEquipmentBonus(player);

  const handleBuy = (itemId: string) => {
    const result = onBuy(itemId);
    setToast({ msg: result.message, ok: result.success });
    setTimeout(() => setToast(null), 2000);
  };

  const categoryItems = SHOP_ITEMS.filter(i => i.category === activeCategory);
  const currentLevel = player.equipment[activeCategory as keyof typeof player.equipment];

  const effectiveStat = (stat: string) => {
    const base = (player.stats as unknown as Record<string, number>)[stat] ?? 0;
    const bonus = (eqBonus as unknown as Record<string, number>)[stat] ?? 0;
    return base + bonus;
  };

  return (
    <div style={{
      minHeight: '100dvh', background: '#0a0a0f',
      fontFamily: "'Bebas Neue', 'Impact', sans-serif",
      padding: '0 0 40px',
    }}>
      {/* Header */}
      <div style={{
        padding: '20px 20px 16px',
        display: 'flex', alignItems: 'center', gap: 16,
        borderBottom: '1px solid rgba(255,255,255,0.06)',
      }}>
        <button onClick={onBack} style={{
          background: 'none', border: '1px solid rgba(255,255,255,0.15)',
          borderRadius: 8, color: '#fff', fontSize: 20,
          width: 44, height: 44, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>←</button>
        <div style={{ flex: 1 }}>
          <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 10, letterSpacing: 4, fontFamily: 'monospace' }}>UPGRADE</div>
          <div style={{ color: '#fff', fontSize: 28, lineHeight: 1 }}>SETUP</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 9, fontFamily: 'monospace', letterSpacing: 2 }}>CASH</div>
          <div style={{ color: '#00ff88', fontSize: 24 }}>${player.cash}</div>
        </div>
      </div>

      {/* Stats */}
      <div style={{ padding: '16px 20px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: 9, fontFamily: 'monospace', letterSpacing: 3, marginBottom: 10 }}>
          SKATER STATS
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
          {Object.entries(player.stats).map(([stat, val]) => {
            const effective = effectiveStat(stat);
            const bonus = effective - val;
            return (
              <div key={stat}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                  <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: 9, fontFamily: 'monospace', letterSpacing: 1 }}>
                    {STAT_LABELS[stat]}
                  </span>
                  <span style={{ color: bonus > 0 ? '#00ff88' : '#fff', fontSize: 9, fontFamily: 'monospace' }}>
                    {effective}{bonus > 0 ? ` (+${bonus})` : ''}
                  </span>
                </div>
                <div style={{ height: 4, background: 'rgba(255,255,255,0.08)', borderRadius: 2 }}>
                  <div style={{
                    height: '100%', borderRadius: 2,
                    width: `${(effective / 10) * 100}%`,
                    background: `linear-gradient(90deg, #ff6b35 ${(val / 10) * 100}%, #00ff88 ${(val / 10) * 100}%)`,
                    transition: 'width 0.4s',
                  }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Category tabs */}
      <div style={{
        display: 'flex', overflowX: 'auto', padding: '12px 20px',
        gap: 8, borderBottom: '1px solid rgba(255,255,255,0.06)',
        scrollbarWidth: 'none',
      }}>
        {Object.entries(CATEGORY_LABELS).map(([cat, label]) => {
          const lvl = player.equipment[cat as keyof typeof player.equipment];
          const isActive = cat === activeCategory;
          return (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat as keyof typeof CATEGORY_LABELS)}
              style={{
                background: isActive ? 'rgba(255,107,53,0.15)' : 'rgba(255,255,255,0.04)',
                border: `1px solid ${isActive ? 'rgba(255,107,53,0.4)' : 'rgba(255,255,255,0.08)'}`,
                borderRadius: 8, color: isActive ? '#ff6b35' : 'rgba(255,255,255,0.5)',
                fontSize: 11, letterSpacing: 2, padding: '8px 12px',
                fontFamily: "'Bebas Neue', 'Impact', sans-serif",
                cursor: 'pointer', whiteSpace: 'nowrap',
                flexShrink: 0,
              }}
            >
              {label} <span style={{ opacity: 0.6 }}>LV{lvl}</span>
            </button>
          );
        })}
      </div>

      {/* Items */}
      <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: 10, letterSpacing: 3, fontFamily: 'monospace', marginBottom: 4 }}>
          CURRENT LEVEL: {currentLevel} / 5
        </div>
        {categoryItems.map(item => {
          const owned = player.equipment[item.category] >= item.level;
          const canBuy = player.equipment[item.category] === item.level - 1;
          const locked = player.equipment[item.category] < item.level - 1;
          const canAfford = player.cash >= item.price;

          return (
            <div key={item.id} style={{
              background: owned
                ? 'rgba(0,255,136,0.03)'
                : canBuy
                  ? 'rgba(255,107,53,0.05)'
                  : 'rgba(255,255,255,0.02)',
              border: `1px solid ${owned ? 'rgba(0,255,136,0.15)' : canBuy ? 'rgba(255,107,53,0.2)' : 'rgba(255,255,255,0.05)'}`,
              borderRadius: 12, padding: '14px 14px',
              opacity: locked ? 0.4 : 1,
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{
                      background: owned ? 'rgba(0,255,136,0.2)' : 'rgba(255,107,53,0.15)',
                      borderRadius: 4, padding: '2px 6px',
                      color: owned ? '#00ff88' : '#ff6b35',
                      fontSize: 9, fontFamily: 'monospace', letterSpacing: 1,
                    }}>
                      LV{item.level}
                    </div>
                    <span style={{ color: owned ? 'rgba(255,255,255,0.6)' : '#fff', fontSize: 18 }}>
                      {item.name}
                    </span>
                  </div>
                  <div style={{
                    color: 'rgba(255,255,255,0.35)', fontSize: 11, fontFamily: 'monospace',
                    marginTop: 4, letterSpacing: 0.5,
                  }}>
                    {item.description}
                  </div>
                  {/* Stat bonuses */}
                  <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                    {Object.entries(item.statBonus).map(([stat, val]) => (
                      <span key={stat} style={{
                        background: 'rgba(0,255,136,0.1)', border: '1px solid rgba(0,255,136,0.2)',
                        borderRadius: 4, padding: '1px 6px',
                        color: '#00ff88', fontSize: 9, fontFamily: 'monospace', letterSpacing: 1,
                      }}>
                        +{val} {STAT_LABELS[stat]}
                      </span>
                    ))}
                  </div>
                </div>

                <div style={{ marginLeft: 12, textAlign: 'right', flexShrink: 0 }}>
                  {owned ? (
                    <div style={{ color: '#00ff88', fontSize: 20 }}>✓</div>
                  ) : locked ? (
                    <div style={{ color: 'rgba(255,255,255,0.2)', fontSize: 16 }}>🔒</div>
                  ) : (
                    <button
                      disabled={!canAfford}
                      onClick={() => handleBuy(item.id)}
                      style={{
                        background: canAfford
                          ? 'linear-gradient(135deg, #ff6b35, #f7a659)'
                          : 'rgba(255,255,255,0.08)',
                        border: 'none', borderRadius: 8,
                        color: canAfford ? '#fff' : 'rgba(255,255,255,0.3)',
                        fontSize: 14, letterSpacing: 1, padding: '8px 14px',
                        fontFamily: "'Bebas Neue', 'Impact', sans-serif",
                        cursor: canAfford ? 'pointer' : 'not-allowed',
                      }}
                    >
                      ${item.price}
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', bottom: 32, left: '50%', transform: 'translateX(-50%)',
          background: toast.ok ? 'rgba(0,255,136,0.9)' : 'rgba(255,68,68,0.9)',
          color: '#000', borderRadius: 8, padding: '10px 20px',
          fontSize: 14, letterSpacing: 2, fontFamily: "'Bebas Neue', 'Impact', sans-serif",
          boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
          zIndex: 100,
        }}>
          {toast.msg}
        </div>
      )}
    </div>
  );
};
