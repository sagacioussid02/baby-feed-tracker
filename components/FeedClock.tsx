/**
 * FeedClock — 24-hour Skia dial of the day's feeds (home screen hero).
 *
 * Past feeds are markers around the dial (size ~ amount, color ~ milk type),
 * an animated hand sweeps toward the predicted next-feed time, and the center
 * shows the countdown + suggested amount. Tapping a marker selects that feed.
 *
 * All animation runs on the UI thread via Skia + Reanimated shared values.
 */
import React, { useEffect, useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import {
  Canvas,
  Circle,
  Line,
  RadialGradient,
  Shadow,
  useClock,
  vec,
} from '@shopify/react-native-skia';
import {
  Easing,
  useDerivedValue,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { colors } from './theme';
import { formatCountdown, type Prediction } from '../lib/predict';
import type { FeedDoc } from '../lib/store';

const TAU = Math.PI * 2;

const MILK_COLORS: Record<string, [string, string]> = {
  breast: ['#F7B8D0', '#D9637F'],
  formula: ['#A9C9F7', '#4F83D8'],
  pumped: ['#9AE3D8', '#2FA08F'],
  mixed: ['#C9B3FA', '#7E5FDD'],
};

function angleFor(ts: number): number {
  const d = new Date(ts);
  const hours = d.getHours() + d.getMinutes() / 60;
  return (hours / 24) * TAU - Math.PI / 2; // midnight at top
}

interface Marker {
  feed: FeedDoc;
  x: number;
  y: number;
  r: number;
  colors: [string, string];
}

export function FeedClock({
  feeds,
  prediction,
  reduceMotion,
  selectedFeedId,
  onSelectFeed,
  size = 320,
}: {
  feeds: FeedDoc[];
  prediction: Prediction;
  reduceMotion: boolean;
  selectedFeedId: string | null;
  onSelectFeed: (feed: FeedDoc | null) => void;
  size?: number;
}) {
  const clock = useClock();
  const cx = size / 2;
  const cy = size / 2;
  const R = size / 2 - 30;
  const ringR = R - 26;

  const recent = useMemo(() => {
    const cutoff = Date.now() - 24 * 3600 * 1000;
    return feeds.filter((f) => f.timestamp >= cutoff);
  }, [feeds]);

  const markers = useMemo<Marker[]>(
    () =>
      recent.map((feed) => {
        const a = angleFor(feed.timestamp);
        return {
          feed,
          x: cx + ringR * Math.cos(a),
          y: cy + ringR * Math.sin(a),
          r: Math.max(6, Math.min(15, 8 + (feed.amountMl / 220) * 7)),
          colors: MILK_COLORS[feed.milkType] ?? MILK_COLORS.mixed,
        };
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [recent]
  );

  // --- Sweep hand toward the predicted next feed ---
  const progress = useSharedValue(0);
  const target = prediction.nextFeedAtMs;
  const lastTs = feeds[0]?.timestamp ?? Date.now();
  const lastAngle = angleFor(lastTs);
  const delta = useMemo(() => {
    if (target == null) return 0;
    const nextAngle = angleFor(target);
    return ((nextAngle - lastAngle) % TAU + TAU) % TAU;
  }, [target, lastAngle]);

  useEffect(() => {
    if (target == null || reduceMotion) {
      progress.value = 1;
      return;
    }
    progress.value = 0;
    progress.value = withTiming(1, { duration: 1600, easing: Easing.out(Easing.cubic) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, reduceMotion]);

  const handLen = R - 44;
  const handAngle = useDerivedValue(() => lastAngle + delta * progress.value, [lastAngle, delta]);
  const tipX = useDerivedValue(() => cx + handLen * Math.cos(handAngle.value), [handAngle]);
  const tipY = useDerivedValue(() => cy + handLen * Math.sin(handAngle.value), [handAngle]);
  const tip = useDerivedValue(() => ({ x: tipX.value, y: tipY.value }), [tipX, tipY]);

  // Predicted-feed pulsing ring
  const predAngle = target != null ? angleFor(target) : 0;
  const predX = cx + ringR * Math.cos(predAngle);
  const predY = cy + ringR * Math.sin(predAngle);
  const predPulse = useDerivedValue(() =>
    reduceMotion ? 0 : (Math.sin(clock.value / 420) + 1) / 2
  );
  const predR = useDerivedValue(() => 12 + predPulse.value * 5);
  const predOpacity = useDerivedValue(() => 0.75 - predPulse.value * 0.45);

  // Latest-feed pulse ring
  const latest = markers[0];
  const latestPulse = useDerivedValue(() =>
    reduceMotion || !latest ? 0 : (Math.sin(clock.value / 520) + 1) / 2
  );
  const latestRingR = useDerivedValue(() => (latest ? latest.r + 4 + latestPulse.value * 6 : 0));
  const latestRingOpacity = useDerivedValue(() => 0.55 * (1 - latestPulse.value));

  // "Now" dot
  const nowA = angleFor(Date.now());
  const nowX = cx + ringR * Math.cos(nowA);
  const nowY = cy + ringR * Math.sin(nowA);

  const ticks = useMemo(
    () =>
      Array.from({ length: 24 }, (_, h) => {
        const a = (h / 24) * TAU - Math.PI / 2;
        const major = h % 6 === 0;
        const inner = R - (major ? 15 : 9);
        return {
          x1: cx + inner * Math.cos(a),
          y1: cy + inner * Math.sin(a),
          x2: cx + (R - 3) * Math.cos(a),
          y2: cy + (R - 3) * Math.sin(a),
          major,
        };
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const handleTap = (x: number, y: number) => {
    let best: Marker | null = null;
    let bestD = 30;
    for (const m of markers) {
      const d = Math.hypot(m.x - x, m.y - y);
      if (d < bestD) {
        bestD = d;
        best = m;
      }
    }
    onSelectFeed(best ? best.feed : null);
  };

  const countdown =
    prediction.nextFeedAtMs != null ? formatCountdown(prediction.nextFeedAtMs) : null;

  return (
    <View style={[styles.card, { width: size + 32 }]}>
      <View style={{ width: size, height: size }}>
        <Pressable
          onPress={(e) => handleTap(e.nativeEvent.locationX, e.nativeEvent.locationY)}
          style={{ width: size, height: size }}
        >
          <Canvas style={{ width: size, height: size }}>
            {/* Dial face */}
            <Circle cx={cx} cy={cy} r={R} color="#2A2622">
              <RadialGradient
                c={vec(cx, cy - R * 0.25)}
                r={R * 1.35}
                colors={['#453D34', '#2A2622', '#211E1B']}
              />
              <Shadow dx={0} dy={10} blur={24} color="rgba(0,0,0,0.45)" />
            </Circle>
            {/* Glass gloss */}
            <Circle cx={cx} cy={cy - R * 0.42} r={R * 0.72} color="#FFFFFF" opacity={0.05} />

            {/* Ticks */}
            {ticks.map((t, i) => (
              <Line
                key={i}
                p1={vec(t.x1, t.y1)}
                p2={vec(t.x2, t.y2)}
                strokeWidth={t.major ? 3 : 1.5}
                strokeCap="round"
                color={t.major ? 'rgba(255,244,230,0.55)' : 'rgba(255,244,230,0.22)'}
              />
            ))}

            {/* Now dot */}
            <Circle cx={nowX} cy={nowY} r={3.5} color="#FFF4E6" opacity={0.85} />

            {/* Feed markers */}
            {markers.map((m) => (
              <React.Fragment key={m.feed.id}>
                <Circle cx={m.x} cy={m.y} r={m.r} color={m.colors[1]}>
                  <RadialGradient
                    c={vec(m.x - m.r * 0.3, m.y - m.r * 0.3)}
                    r={m.r * 1.4}
                    colors={[m.colors[0], m.colors[1]]}
                  />
                </Circle>
                <Circle
                  cx={m.x}
                  cy={m.y}
                  r={m.r}
                  color="rgba(255,255,255,0.85)"
                  style="stroke"
                  strokeWidth={1.5}
                />
                {selectedFeedId === m.feed.id && (
                  <Circle
                    cx={m.x}
                    cy={m.y}
                    r={m.r + 5}
                    color="#FFF4E6"
                    style="stroke"
                    strokeWidth={2.5}
                  />
                )}
              </React.Fragment>
            ))}

            {/* Latest-feed pulse */}
            {latest && !reduceMotion && (
              <Circle
                cx={latest.x}
                cy={latest.y}
                r={latestRingR}
                color="#FFF4E6"
                style="stroke"
                strokeWidth={2}
                opacity={latestRingOpacity}
              />
            )}

            {/* Predicted-feed ring */}
            {target != null && (
              <Circle
                cx={predX}
                cy={predY}
                r={predR}
                color={colors.primary}
                style="stroke"
                strokeWidth={3}
                opacity={predOpacity}
              />
            )}

            {/* Sweep hand */}
            {target != null && (
              <>
                <Line
                  p1={vec(cx, cy)}
                  p2={tip}
                  strokeWidth={11}
                  strokeCap="round"
                  color={colors.primary}
                  opacity={0.28}
                />
                <Line
                  p1={vec(cx, cy)}
                  p2={tip}
                  strokeWidth={5}
                  strokeCap="round"
                  color="#F0A080"
                />
                <Circle cx={tipX} cy={tipY} r={6.5} color={colors.primary}>
                  <Shadow dx={0} dy={0} blur={10} color="rgba(226,114,91,0.8)" />
                </Circle>
              </>
            )}

            {/* Center cap */}
            <Circle cx={cx} cy={cy} r={10} color="#4A4238">
              <Shadow dx={0} dy={2} blur={6} color="rgba(0,0,0,0.5)" />
            </Circle>
          </Canvas>
        </Pressable>

        {/* Hour labels */}
        <Text style={[styles.hourLabel, { top: 6, left: 0, right: 0, textAlign: 'center' }]}>12a</Text>
        <Text style={[styles.hourLabel, { top: size / 2 - 9, right: 8 }]}>6a</Text>
        <Text style={[styles.hourLabel, { bottom: 6, left: 0, right: 0, textAlign: 'center' }]}>12p</Text>
        <Text style={[styles.hourLabel, { top: size / 2 - 9, left: 8 }]}>6p</Text>

        {/* Center readout */}
        <View style={styles.center} pointerEvents="none">
          <Text style={styles.nextLabel}>NEXT FEED</Text>
          {countdown ? (
            <>
              <Text style={styles.countdown}>{countdown}</Text>
              <Text style={styles.amount}>~{prediction.suggestedAmountMl} ml</Text>
            </>
          ) : (
            <Text style={styles.hint}>Log a feed{'\n'}to start the clock</Text>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.hero,
    borderRadius: 20,
    padding: 16,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  hourLabel: {
    position: 'absolute',
    color: 'rgba(255,244,230,0.5)',
    fontSize: 12,
    fontWeight: '600',
  },
  center: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nextLabel: {
    color: 'rgba(255,244,230,0.55)',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 2,
  },
  countdown: {
    color: '#FFF4E6',
    fontSize: 40,
    fontWeight: '800',
    marginTop: 2,
  },
  amount: {
    color: colors.primary,
    fontSize: 18,
    fontWeight: '700',
    marginTop: 2,
  },
  hint: {
    color: 'rgba(255,244,230,0.6)',
    fontSize: 14,
    textAlign: 'center',
    marginTop: 4,
    lineHeight: 20,
  },
});
