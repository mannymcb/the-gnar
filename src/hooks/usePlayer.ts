import { useState, useCallback } from 'react';
import type { Player, Equipment } from '../game/types';
import { saveGame, loadGame, DEFAULT_PLAYER } from '../game/save';
import { SHOP_ITEMS } from '../game/shop';
import { LEVELS } from '../game/levels';

export function usePlayer() {
  const [player, setPlayer] = useState<Player>(() => loadGame() ?? { ...DEFAULT_PLAYER });

  const updatePlayer = useCallback((updater: (p: Player) => Player) => {
    setPlayer(prev => {
      const next = updater(prev);
      saveGame(next);
      return next;
    });
  }, []);

  const addScore = useCallback((points: number) => {
    updatePlayer(p => ({ ...p, totalScore: p.totalScore + points }));
  }, [updatePlayer]);

  const addCash = useCallback((amount: number) => {
    updatePlayer(p => ({ ...p, cash: p.cash + amount }));
  }, [updatePlayer]);

  const spendCash = useCallback((amount: number): boolean => {
    if (player.cash < amount) return false;
    updatePlayer(p => ({ ...p, cash: p.cash - amount }));
    return true;
  }, [player.cash, updatePlayer]);

  const buyItem = useCallback((itemId: string): { success: boolean; message: string } => {
    const item = SHOP_ITEMS.find(i => i.id === itemId);
    if (!item) return { success: false, message: 'Item not found' };

    const currentLevel = player.equipment[item.category];
    if (item.level !== currentLevel + 1) {
      return { success: false, message: 'Upgrade in order' };
    }
    if (player.cash < item.price) {
      return { success: false, message: 'Not enough cash' };
    }

    updatePlayer(p => {
      const newEquipment: Equipment = { ...p.equipment, [item.category]: item.level };
      const newStats = { ...p.stats };
      for (const [stat, val] of Object.entries(item.statBonus)) {
        if (stat in newStats) {
          (newStats as Record<string, number>)[stat] = Math.min(
            10,
            (newStats as Record<string, number>)[stat] + (val as number),
          );
        }
      }
      return {
        ...p,
        cash: p.cash - item.price,
        equipment: newEquipment,
        stats: newStats,
      };
    });

    return { success: true, message: `${item.name} equipped!` };
  }, [player, updatePlayer]);

  const completeChallenge = useCallback((challengeId: string, reward: { cash: number; xp: number }) => {
    updatePlayer(p => {
      if (p.completedChallenges.includes(challengeId)) return p;
      return {
        ...p,
        completedChallenges: [...p.completedChallenges, challengeId],
        cash: p.cash + reward.cash,
        totalScore: p.totalScore + reward.xp,
      };
    });
  }, [updatePlayer]);

  const unlockLevel = useCallback((levelId: string) => {
    updatePlayer(p => {
      if (p.unlockedLevels.includes(levelId)) return p;
      return { ...p, unlockedLevels: [...p.unlockedLevels, levelId] };
    });
  }, [updatePlayer]);

  const unlockNextLevel = useCallback((currentLevelId: string) => {
    const currentIdx = LEVELS.findIndex(l => l.id === currentLevelId);
    const next = LEVELS[currentIdx + 1];
    if (next && !player.unlockedLevels.includes(next.id)) {
      unlockLevel(next.id);
    }
  }, [player.unlockedLevels, unlockLevel]);

  const unlockTrick = useCallback((trickId: string) => {
    updatePlayer(p => {
      if (p.unlockedTricks.includes(trickId)) return p;
      return { ...p, unlockedTricks: [...p.unlockedTricks, trickId] };
    });
  }, [updatePlayer]);

  const beatRival = useCallback((levelId: string) => {
    updatePlayer(p => {
      if (p.rivalsBeaten.includes(levelId)) return p;
      return { ...p, rivalsBeaten: [...p.rivalsBeaten, levelId] };
    });
  }, [updatePlayer]);

  const unlockCollectible = useCallback((collectibleId: string) => {
    updatePlayer(p => {
      if (p.collectibles.includes(collectibleId)) return p;
      return { ...p, collectibles: [...p.collectibles, collectibleId] };
    });
  }, [updatePlayer]);

  const updateBestScore = useCallback((levelId: string, score: number) => {
    updatePlayer(p => {
      const current = p.cityCredits[levelId] ?? 0;
      if (score <= current) return p;
      return { ...p, cityCredits: { ...p.cityCredits, [levelId]: score } };
    });
  }, [updatePlayer]);

  const resetGame = useCallback(() => {
    const fresh = { ...DEFAULT_PLAYER };
    saveGame(fresh);
    setPlayer(fresh);
  }, []);

  return {
    player,
    updatePlayer,
    addScore,
    addCash,
    spendCash,
    buyItem,
    completeChallenge,
    unlockLevel,
    unlockNextLevel,
    unlockTrick,
    beatRival,
    unlockCollectible,
    updateBestScore,
    resetGame,
  };
}
