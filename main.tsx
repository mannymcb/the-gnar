import { useState, useCallback } from 'react';
import { MainMenu }   from './screens/MainMenu';
import { CitySelect } from './screens/CitySelect';
import { SkateRun }   from './screens/SkateRun';
import { RunResults } from './screens/RunResults';
import { CITIES, getCityById } from './game/cities';
import { saveGame, loadGame, DEFAULT_PLAYER } from './game/save';
import type { Player, TrickResult } from './game/types';

type Screen = 'menu' | 'cities' | 'run' | 'results';

export default function App() {
  const [player, setPlayer] = useState<Player>(() => loadGame());
  const [screen, setScreen]     = useState<Screen>('menu');
  const [cityId, setCityId]     = useState<string>('seattle');
  const [lastScore, setScore]   = useState(0);
  const [lastTricks, setTricks] = useState<TrickResult[]>([]);

  const save = useCallback((p: Player) => {
    setPlayer(p);
    saveGame(p);
  }, []);

  const handleRunComplete = useCallback((score: number, tricks: TrickResult[]) => {
    setScore(score); setTricks(tricks);
    setPlayer(prev => {
      const city = getCityById(cityId);
      const beaten = city && score >= city.rival.score;
      const newBest = Math.max(score, prev.bestScores[cityId] ?? 0);
      const rivalsBeaten = beaten && !prev.rivalsBeaten.includes(cityId)
        ? [...prev.rivalsBeaten, cityId]
        : prev.rivalsBeaten;

      // Unlock next city if rival beaten
      let unlockedCities = [...prev.unlockedCities];
      if (beaten) {
        const idx = CITIES.findIndex(c => c.id === cityId);
        const next = CITIES[idx + 1];
        if (next && !unlockedCities.includes(next.id)) unlockedCities.push(next.id);
      }

      const updated: Player = {
        ...prev,
        totalScore: prev.totalScore + score,
        bestScores: { ...prev.bestScores, [cityId]: newBest },
        rivalsBeaten,
        unlockedCities,
      };
      saveGame(updated);
      return updated;
    });
    setScreen('results');
  }, [cityId]);

  const city = getCityById(cityId)!;

  return (
    <div style={{ maxWidth: 430, margin: '0 auto', height: '100dvh', overflow: 'hidden', position: 'relative' }}>
      {screen === 'menu' && (
        <MainMenu
          player={player}
          onPlay={() => setScreen('cities')}
          onReset={() => { save({ ...DEFAULT_PLAYER }); setScreen('menu'); }}
        />
      )}
      {screen === 'cities' && (
        <CitySelect
          player={player}
          onSelect={id => { setCityId(id); setScreen('run'); }}
          onBack={() => setScreen('menu')}
        />
      )}
      {screen === 'run' && city && (
        <SkateRun
          city={city}
          player={player}
          onComplete={handleRunComplete}
          onBack={() => setScreen('cities')}
        />
      )}
      {screen === 'results' && city && (
        <RunResults
          city={city}
          player={player}
          score={lastScore}
          tricks={lastTricks}
          onRetry={() => setScreen('run')}
          onCities={() => setScreen('cities')}
        />
      )}
    </div>
  );
}
