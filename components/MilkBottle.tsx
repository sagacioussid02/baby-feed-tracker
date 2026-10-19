/**
 * MilkBottle — playful Skia milk bottle that fills as the amount is chosen.
 * Pure visual feedback: presets stay one-tap so the 3am flow is unchanged.
 */
import React, { useEffect, useMemo } from 'react';
import {
  Canvas,
  Circle,
  Group,
  Line,
  Rect,
  RoundedRect,
  LinearGradient,
  Shadow,
  rect,
  rrect,
  useClock,
  vec,
} from '@shopify/react-native-skia';
import { useDerivedValue, useSharedValue, withSpring } from 'react-native-reanimated';

const BODY_X = 32;
const BODY_Y = 52;
const BODY_W = 56;
const BODY_H = 118;

interface BubbleSpec {
  x: number;
  speed: number;
  size: number;
}

function Bubble({
  clock,
  spec,
  bottomY,
  topY,
}: {
  clock: ReturnType<typeof useClock>;
  spec: BubbleSpec;
  bottomY: number;
  topY: number;
}) {
  const phase = useDerivedValue(() => {
    const p = (clock.value / spec.speed) % 1;
    return p < 0 ? p + 1 : p;
  });
  const cy = useDerivedValue(
    () => bottomY - phase.value * (bottomY - topY)
  );
  const opacity = useDerivedValue(() => 0.6 * Math.sin(phase.value * Math.PI));
  return <Circle cx={spec.x} cy={cy} r={spec.size} color="#FFFFFF" opacity={opacity} />;
}

export function MilkBottle({
  amountMl,
  maxMl = 240,
  reduceMotion,
  width = 120,
  height = 190,
}: {
  amountMl: number;
  maxMl?: number;
  reduceMotion: boolean;
  width?: number;
  height?: number;
}) {
  const clock = useClock();
  const target = Math.max(0, Math.min(1, amountMl / maxMl));
  const fill = useSharedValue(0);

  useEffect(() => {
    fill.value = reduceMotion
      ? target
      : withSpring(target, { damping: 22, stiffness: 130 });
  }, [amountMl, maxMl, reduceMotion]); // eslint-disable-line react-hooks/exhaustive-deps

  const liquidTop = useDerivedValue(
    () => BODY_Y + BODY_H * (1 - fill.value)
  );
  const liquidH = useDerivedValue(() => BODY_Y + BODY_H - liquidTop.value);

  const bubbles = useMemo<BubbleSpec[]>(
    () =>
      Array.from({ length: 7 }, (_, i) => ({
        x: BODY_X + 10 + ((i * 37) % (BODY_W - 20)),
        speed: 1400 + ((i * 431) % 900),
        size: 2 + ((i * 13) % 3),
      })),
    []
  );

  const ticks = [60, 120, 180].map((v) => ({
    v,
    y: BODY_Y + BODY_H * (1 - v / maxMl),
  }));

  return (
    <Canvas style={{ width, height }}>
      {/* Cap */}
      <RoundedRect x={46} y={12} width={28} height={18} r={6} color="#E2725B">
        <Shadow dx={0} dy={2} blur={4} color="rgba(0,0,0,0.25)" />
      </RoundedRect>
      {/* Neck */}
      <RoundedRect x={50} y={28} width={20} height={28} r={5} color="rgba(255,255,255,0.55)" />
      {/* Liquid (clipped to the body) */}
      <Group clip={rrect(rect(BODY_X, BODY_Y, BODY_W, BODY_H), 16, 16)}>
        <Rect x={BODY_X} y={liquidTop} width={BODY_W} height={liquidH}>
          <LinearGradient
            start={vec(BODY_X, BODY_Y)}
            end={vec(BODY_X, BODY_Y + BODY_H)}
            colors={['#FFFDF6', '#F1DEBC']}
          />
        </Rect>
        {/* Liquid surface sheen */}
        <Circle cx={BODY_X + BODY_W / 2} cy={liquidTop} r={7} color="#FFFFFF" opacity={0.55} />
        {!reduceMotion &&
          target > 0.03 &&
          bubbles.map((b, i) => (
            <Bubble
              key={i}
              clock={clock}
              spec={b}
              bottomY={BODY_Y + BODY_H - 8}
              topY={BODY_Y + BODY_H * (1 - target)}
            />
          ))}
      </Group>
      {/* Glass body */}
      <RoundedRect
        x={BODY_X}
        y={BODY_Y}
        width={BODY_W}
        height={BODY_H}
        r={16}
        color="rgba(255,255,255,0.18)"
        style="stroke"
        strokeWidth={3}
      >
        <Shadow dx={0} dy={5} blur={10} color="rgba(120,80,40,0.28)" />
      </RoundedRect>
      {/* Glass highlight */}
      <RoundedRect x={BODY_X + 8} y={BODY_Y + 10} width={7} height={BODY_H - 24} r={3.5} color="#FFFFFF" opacity={0.5} />
      {/* Measurement ticks */}
      {ticks.map((t) => (
        <Line
          key={t.v}
          p1={vec(BODY_X + BODY_W + 3, t.y)}
          p2={vec(BODY_X + BODY_W + 11, t.y)}
          strokeWidth={2}
          strokeCap="round"
          color="rgba(120,90,60,0.55)"
        />
      ))}
    </Canvas>
  );
}
