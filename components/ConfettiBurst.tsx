/**
 * ConfettiBurst — one-shot Skia particle burst for the save moment.
 * Increment `burstKey` to play; pointer-events-transparent overlay.
 */
import React, { useEffect, useMemo } from 'react';
import { Canvas, Circle } from '@shopify/react-native-skia';
import {
  Easing,
  type SharedValue,
  useDerivedValue,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

const COUNT = 16;
const COLORS = ['#E2725B', '#F2B134', '#6FD3C7', '#8B6FE8', '#F4A7C3', '#7FB5F2'];

interface Spec {
  angle: number;
  dist: number;
  color: string;
  size: number;
}

function Particle({
  progress,
  spec,
  cx,
  cy,
}: {
  progress: SharedValue<number>;
  spec: Spec;
  cx: number;
  cy: number;
}) {
  const eased = useDerivedValue(() => {
    const p = progress.value;
    return 1 - Math.pow(1 - p, 3);
  });
  const px = useDerivedValue(() => cx + Math.cos(spec.angle) * spec.dist * eased.value);
  const py = useDerivedValue(
    () => cy + Math.sin(spec.angle) * spec.dist * eased.value + progress.value * 34
  );
  const opacity = useDerivedValue(() => 1 - progress.value);
  const r = useDerivedValue(() => spec.size * (1 - progress.value * 0.4));
  return <Circle cx={px} cy={py} r={r} color={spec.color} opacity={opacity} />;
}

export function ConfettiBurst({
  burstKey,
  reduceMotion,
  width = 220,
  height = 200,
}: {
  burstKey: number;
  reduceMotion: boolean;
  width?: number;
  height?: number;
}) {
  const progress = useSharedValue(0);

  useEffect(() => {
    if (burstKey > 0 && !reduceMotion) {
      progress.value = 0;
      progress.value = withTiming(1, {
        duration: 750,
        easing: Easing.out(Easing.cubic),
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [burstKey, reduceMotion]);

  const specs = useMemo<Spec[]>(
    () =>
      Array.from({ length: COUNT }, (_, i) => ({
        angle: (i / COUNT) * Math.PI * 2 + ((i * 137) % 40) / 40 - 0.5,
        dist: 46 + ((i * 53) % 64),
        color: COLORS[i % COLORS.length],
        size: 3 + ((i * 29) % 4),
      })),
    []
  );

  if (burstKey === 0 || reduceMotion) return null;

  const cx = width / 2;
  const cy = height / 2;
  return (
    <Canvas style={{ width, height }} pointerEvents="none">
      {specs.map((s, i) => (
        <Particle key={i} progress={progress} spec={s} cx={cx} cy={cy} />
      ))}
    </Canvas>
  );
}
