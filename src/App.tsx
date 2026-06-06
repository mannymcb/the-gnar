import { useState, useCallback } from 'react';
import { MainMenu } from './screens/MainMenu';
import { CareerMap } from './screens/CareerMap';
import { SpotDetail } from './screens/SpotDetail';
import { SkateRun } from './screens/SkateRun';
import { RunResults } from './screens/RunResults';
import { ShopScreen } from './screens/ShopScreen';
import { usePlayer } from './hooks/usePlayer';
import { getLevelById, LEVELS } from './game/levels';
import type { TrickResult } from './game/types';

type Screen =
  | 'menu'
  | 'career'
  | 'spot'
  | 'run'
  | 'results'
  | 'shop';

interface AppState {
  screen: Screen;
  activeLevelId: string | null;
  lastScore: number;
  lastTrickHistory: TrickResult[];
}

export default function App() {
  const [state, setState] = useState<AppState>({
    screen: 'menu',
    activeLevelId: null,
    lastScore: 0,
    lastTrickHistory: [],
  });

  const { player, addScore, addCash, buyItem, completeChallenge, unlockNextLevel, resetGame } = usePlayer();

  // ── NAVIGATION ─────────────────────────────────────────────────────────────

  const go = useCallback((screen: Screen, levelId?: string) => {
    setState(s => ({ ...s, screen, activeLevelId: levelId ?? s.activeLevelId }));
  }, []);

  // ── RUN COMPLETE ────────────────────────────────────────────────────────────

  const handleRunComplete = useCallback((score: number, trickHistory: TrickResult[]) => {
    addScore(score);
    setState(s => ({
      ...s,
      screen: 'results',
      lastScore: score,
      lastTrickHistory: trickHistory,
    }));
  }, [addScore]);

  // ── RESULTS ACCEPTED ────────────────────────────────────────────────────────

  const handleResultsComplete = useCallback((earnedCash: number, completedChallengeIds: string[]) => {
    if (earnedCash > 0) addCash(earnedCash);

    const level = getLevelById(state.activeLevelId ?? '');
    if (level) {
      for (const id of completedChallengeIds) {
        const ch = level.challenges.find(c => c.id === id);
        if (ch) completeChallenge(id, ch.reward);
      }

      // Check if all challenges done → unlock next level
      const allNowDone = level.challenges.every(
        ch => completedChallengeIds.includes(ch.id) || player.completedChallenges.includes(ch.id),
      );
      if (allNowDone) {
        unlockNextLevel(level.id);
      }
    }
  }, [state.activeLevelId, addCash, completeChallenge, unlockNextLevel, player.completedChallenges]);

  // ── BEST SCORES ─────────────────────────────────────────────────────────────
  // Track best score per level in player.cityCredits (reused as score store)
  const getBestScore = (levelId: string): number | undefined => {
    return player.cityCredits[levelId] || undefined;
  };


  // ── ACTIVE LEVEL ────────────────────────────────────────────────────────────

  const activeLevel = state.activeLevelId ? getLevelById(state.activeLevelId) : null;
  const activeLevelIndex = state.activeLevelId
    ? LEVELS.findIndex(l => l.id === state.activeLevelId)
    : 0;

  // ── RENDER ──────────────────────────────────────────────────────────────────

  return (
    <div style={{ maxWidth: 430, margin: '0 auto', height: '100dvh', overflow: 'hidden', position: 'relative' }}>
      {state.screen === 'menu' && (
        <MainMenu
          player={player}
          onCareer={() => go('career')}
          onSession={() => go('career')}
          onShop={() => go('shop')}
          onReset={resetGame}
        />
      )}

      {state.screen === 'career' && (
        <CareerMap
          player={player}
          onSelectLevel={id => go('spot', id)}
          onBack={() => go('menu')}
        />
      )}

      {state.screen === 'spot' && activeLevel && (
        <SpotDetail
          level={activeLevel}
          player={player}
          bestScore={getBestScore(activeLevel.id)}
          onPlay={() => go('run')}
          onBack={() => go('career')}
        />
      )}

      {state.screen === 'run' && activeLevel && (
        <SkateRun
          level={activeLevel}
          player={player}
          levelIndex={activeLevelIndex}
          onComplete={handleRunComplete}
          onBack={() => go('spot')}
        />
      )}

      {state.screen === 'results' && activeLevel && (
        <RunResults
          level={activeLevel}
          player={player}
          score={state.lastScore}
          trickHistory={state.lastTrickHistory}
          onComplete={handleResultsComplete}
          onRetry={() => go('run')}
          onMap={() => go('career')}
        />
      )}

      {state.screen === 'shop' && (
        <ShopScreen
          player={player}
          onBuy={buyItem}
          onBack={() => go('menu')}
        />
      )}
    </div>
  );
}
