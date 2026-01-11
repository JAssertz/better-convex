/** biome-ignore-all lint/suspicious/noBitwiseOperators: ok */
import { useId, useState } from 'react';

const hashString = (value: string): number => {
  let hash = 0x81_1c_9d_c5;

  for (const char of value) {
    const codePoint = char.codePointAt(0) ?? 0;

    hash ^= codePoint;
    hash = Math.imul(hash, 0x01_00_01_93);
  }

  return hash >>> 0;
};

/** Generates a random number between min and max with SSR support. */
export const useRandom = (min = 0, max = 1): number => {
  const id = useId();

  const [random] = useState(() => {
    const lower = Math.min(min, max);
    const upper = Math.max(min, max);
    const hash = hashString(id);
    const normalized = hash / 0x1_00_00_00_00;

    return lower + normalized * (upper - lower);
  });

  return random;
};
