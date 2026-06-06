import { useState, useCallback } from 'react';
import { MainMenu }    from './screens/MainMenu';
import { CareerMap }   from './screens/CareerMap';
import { SpotDetail }  from './screens/SpotDetail';
import { RivalIntro } from './screens/RivalCard';
import { SkateRun }    from './screens/SkateRun';
import { RunResults }  from './screens/RunResults';
import { ShopScreen }  from './screens/ShopScreen';
import { usePlayer }   from './hooks/usePlayer';
import { getLevelById, LEVELS } from './game/levels';
import type { TrickResult } from './game/types';

type Screen = 'menu' | 'career' | 'spot' | 'rival-intro' | 'run' | 'results' | 'rival-result' | 'shop';

interface AppState {
  screen: Screen;
  activeLevelId: string | null;
  lastScore: number;
  lastTrickHistory: TrickResult[];
}

export default function App() {
  const [state, setState] = useState<AppState>({
    screen: 'menu', activeLevelId: null, lastScore: 0, lastTrickHistory: [],
  });

  const {
    player, addScore, addCash, buyItem, completeChallenge,
    unlockNextLevel, resetGame, beatRival, unlockCollectible, updateBestScore,
  } = usePlayer();

  const go = useCallback((screen: Screen, levelId?: string) => {
    setState(s => ({ ...s, screen, activeLevelId: levelId ?? s.activeLevelId }));
  }, []);

  // ── RUN COMPLETE ─────────────────────────────────────────────────────────
  const handleRunComplete = useCallback((score: number, trickHistory: TrickResult[]) => {
    addScore(score);
    // Save best score
    const levelId = state.activeLevelId;
    if (levelId) updateBestScore(levelId, score);

    setState(s => ({ ...s, screen: 'results', lastScore: score, lastTrickHistory: trickHistory }));
  }, [addScore, updateBestScore, state.activeLevelId]);

  // ── RESULTS ACCEPTED ─────────────────────────────────────────────────────
  const handleResultsComplete = useCallback((earnedCash: number, completedChallengeIds: string[]) => {
    if (earnedCash > 0) addCash(earnedCash);

    const level = getLevelById(state.activeLevelId ?? '');
    if (level) {
      // Challenges
      for (const id of completedChallengeIds) {
        const ch = level.challenges.find(c => c.id === id);
        if (ch) completeChallenge(id, ch.reward);
      }
      // Rival + collectible
      if (state.lastScore >= level.rival.score) {
        beatRival(level.id);
        unlockCollectible(level.collectible.id);
      }
      // Unlock next city when all challenges done
      const allDone = level.challenges.every(
        ch => completedChallengeIds.includes(ch.id) || player.completedChallenges.includes(ch.id),
      );
      if (allDone) unlockNextLevel(level.id);
    }
  }, [state.activeLevelId, state.lastScore, addCash, completeChallenge, beatRival, unlockCollectible, unlockNextLevel, player.completedChallenges]);

  const activeLevel = state.activeLevelId ? getLevelById(state.activeLevelId) : null;
  const activeLevelIndex = state.activeLevelId ? LEVELS.findIndex(l => l.id === state.activeLevelId) : 0;
  const bestScore = state.activeLevelId ? (player.cityCredits[state.activeLevelId] ?? 0) : 0;
  const rivalBeaten = activeLevel ? player.rivalsBeaten.includes(activeLevel.id) : false;



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
          bestScore={bestScore || undefined}
          onPlay={() => go('rival-intro')}
          onBack={() => go('career')}
        />
      )}

      {state.screen === 'rival-intro' && activeLevel && (
        <RivalIntro
          level={activeLevel}
          alreadyBeaten={rivalBeaten}
          onSkate={() => go('run')}
          onBack={() => go('spot')}
        />
      )}

      {state.screen === 'run' && activeLevel && (
        <SkateRun
          level={activeLevel}
          player={player}
          levelIndex={activeLevelIndex}
          onComplete={handleRunComplete}
          onBack={() => go('rival-intro')}
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
