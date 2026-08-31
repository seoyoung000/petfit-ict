import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { colors } from '@/theme/colors';

interface Props {
  score: number;  // 0~100
  size?: number;
}

function scoreColor(score: number): string {
  if (score >= 80) return colors.normal;
  if (score >= 60) return colors.minor;
  if (score >= 40) return colors.warning;
  return colors.critical;
}

export default function HealthScoreRing({ score, size = 64 }: Props) {
  const stroke = size * 0.1;
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const dash = (score / 100) * circ;
  const color = scoreColor(score);
  const center = size / 2;

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
        {/* Track */}
        <Circle cx={center} cy={center} r={r} stroke={colors.border} strokeWidth={stroke} fill="none" />
        {/* Progress */}
        <Circle
          cx={center}
          cy={center}
          r={r}
          stroke={color}
          strokeWidth={stroke}
          fill="none"
          strokeDasharray={`${dash} ${circ}`}
          strokeLinecap="round"
          rotation="-90"
          origin={`${center}, ${center}`}
        />
      </Svg>
      <Text style={[styles.score, { color, fontSize: size * 0.22 }]}>{score}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  score: { fontWeight: '800' },
});
