import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors } from '@/theme/colors';
import { Severity } from '@/types';

const CONFIG: Record<Severity, { label: string; bg: string; text: string }> = {
  normal:   { label: '정상',        bg: '#EEF4E4', text: colors.normal },
  minor:    { label: '경미',        bg: '#F6F2DF', text: colors.minor },
  warning:  { label: '주의',        bg: '#F7EDE2', text: colors.warning },
  critical: { label: '즉시 진료',   bg: '#F6E6E2', text: colors.critical },
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
