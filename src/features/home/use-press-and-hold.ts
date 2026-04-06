"use client";

import { useCallback, useRef } from "react";

type UsePressAndHoldOptions = {
  delay?: number;
  enabled?: boolean;
  onLongPress: () => void;
};

export function usePressAndHold(options: UsePressAndHoldOptions) {
  const { delay = 420, enabled = true, onLongPress } = options;
  const timerRef = useRef<number | null>(null);
  const consumedClickRef = useRef(false);

  const clear = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const start = useCallback(
    (button: number) => {
      if (!enabled || button !== 0) {
        return;
      }

      consumedClickRef.current = false;
      clear();
      timerRef.current = window.setTimeout(() => {
        consumedClickRef.current = true;
        timerRef.current = null;
        onLongPress();
      }, delay);
    },
    [clear, delay, enabled, onLongPress]
  );

  const consumeClick = useCallback(() => {
    if (!consumedClickRef.current) {
      return false;
    }

    consumedClickRef.current = false;
    return true;
  }, []);

  return {
    start,
    clear,
    consumeClick
  };
}
