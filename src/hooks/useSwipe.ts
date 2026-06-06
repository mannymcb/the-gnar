import { useRef, useCallback } from 'react';
import type { SwipeDirection } from '../game/types';

interface SwipeConfig {
  onSwipe: (dir: SwipeDirection, isHold: boolean) => void;
  onTap: (accuracy: number) => void;
  minDistance?: number;
  holdThreshold?: number; // ms to trigger hold gesture
}

interface TouchState {
  startX: number;
  startY: number;
  startTime: number;
  moved: boolean;
}

export function useSwipe({ onSwipe, onTap, minDistance = 40, holdThreshold = 250 }: SwipeConfig) {
  const touch = useRef<TouchState | null>(null);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const holdFired = useRef(false);
  const tapWindowRef = useRef<{ start: number; duration: number } | null>(null);

  const setTapWindow = useCallback((start: number, duration: number) => {
    tapWindowRef.current = { start, duration };
  }, []);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    const t = e.touches[0];
    touch.current = {
      startX: t.clientX,
      startY: t.clientY,
      startTime: Date.now(),
      moved: false,
    };
    holdFired.current = false;

    holdTimer.current = setTimeout(() => {
      if (touch.current && !touch.current.moved) {
        holdFired.current = true;
        // Determine hold direction from slight movement or default to up
        const dx = 0;
        const dy = 0;
        let dir: SwipeDirection = 'up';
        if (Math.abs(dx) > Math.abs(dy)) {
          dir = dx > 0 ? 'right' : 'left';
        }
        onSwipe(dir, true);
      }
    }, holdThreshold);
  }, [onSwipe, holdThreshold]);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    if (holdTimer.current) clearTimeout(holdTimer.current);
    if (!touch.current) return;

    const t = e.changedTouches[0];
    const dx = t.clientX - touch.current.startX;
    const dy = t.clientY - touch.current.startY;
    const elapsed = Date.now() - touch.current.startTime;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (holdFired.current) {
      touch.current = null;
      return;
    }

    if (dist < 15 && elapsed < 300) {
      // TAP — calculate accuracy if tap window is active
      if (tapWindowRef.current) {
        const { start, duration } = tapWindowRef.current;
        const elapsed2 = Date.now() - start;
        const center = duration / 2;
        const deviation = Math.abs(elapsed2 - center);
        const accuracy = Math.max(0, 1 - deviation / center);
        onTap(accuracy);
        tapWindowRef.current = null;
      } else {
        onTap(0.5); // default mid accuracy if no window
      }
    } else if (dist >= minDistance) {
      const absX = Math.abs(dx);
      const absY = Math.abs(dy);
      let dir: SwipeDirection;
      if (absY > absX) {
        dir = dy < 0 ? 'up' : 'down';
      } else {
        dir = dx > 0 ? 'right' : 'left';
      }
      onSwipe(dir, false);
    }

    touch.current = null;
  }, [onSwipe, onTap, minDistance]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (touch.current) {
      const t = e.touches[0];
      const dx = t.clientX - touch.current.startX;
      const dy = t.clientY - touch.current.startY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > 10) touch.current.moved = true;
    }
  }, []);

  return { handleTouchStart, handleTouchEnd, handleTouchMove, setTapWindow };
}
