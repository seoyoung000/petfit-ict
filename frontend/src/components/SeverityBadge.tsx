import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors } from '@/theme/colors';
import { Severity } from '@/types';

const CONFIG: Record<Severity, { label: string; bg: string; text: string }> = {
  normal:   { label: '정상',        bg: '#EDF7EA', text: colors.normal },
  minor:    { label: '경미',        bg: '#FEF9E7', text: '#C9A227' },
  warning:  { label: '주의',        bg: '#FEF3E9', text: colors.warning },
  critical: { label: '즉시 진료',   bg: '#FEECEC', text: colors.critical },
};

export default function SeverityBadge({ severity }: { severity: Severity }) {
  const c = CONFIG[severity] ?? CONFIG.normal;
  return (
    <View style={[styles.badge, { backgroundColor: c.bg }]}>
      <Text style={[styles.text, { color: c.text }]}>{c.label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  text: { fontSize: 12, fontWeight: '700' },
});
