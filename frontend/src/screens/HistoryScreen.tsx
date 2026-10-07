import React, { useEffect, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, RefreshControl,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { Ionicons } from '@expo/vector-icons';
import { usePetStore } from '@/store/usePetStore';
import { useScanStore } from '@/store/useScanStore';
import { useTheme } from '@/theme/useTheme';
import { RootStackParams } from '@/navigation/AppNavigator';
import SeverityBadge from '@/components/SeverityBadge';
import HealthScoreRing from '@/components/HealthScoreRing';
import { ScanSummary } from '@/types';

type Nav = StackNavigationProp<RootStackParams>;

export default function HistoryScreen() {
  const nav = useNavigation<Nav>();
  const { selectedPet } = usePetStore();
  const { history, fetchHistory } = useScanStore();
  const [refreshing, setRefreshing] = useState(false);
  const colors = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const load = async () => {
    if (selectedPet) await fetchHistory(selectedPet.id);
  };

  useEffect(() => { load(); }, [selectedPet?.id]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const renderItem = ({ item }: { item: ScanSummary }) => {
    const d = new Date(item.scanned_at);
    return (
      <TouchableOpacity
        style={styles.card}
        onPress={() => nav.navigate('Report', { scanId: item.id })}
      >
        <HealthScoreRing score={item.health_score ?? 0} size={52} />
        <View style={styles.cardBody}>
          <Text style={styles.cardDate}>
            {d.toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' })} ·{' '}
            {d.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}
          </Text>
          <Text style={styles.cardDesc}>
            {item.condition_count === 0
              ? '이상 없음'
              : `${item.condition_count}개 질환 감지`}
          </Text>
        </View>
        <View style={styles.cardRight}>
          <SeverityBadge severity={item.severity ?? 'normal'} />
          <Ionicons name="chevron-forward" size={16} color={colors.textLight} style={{ marginTop: 4 }} />
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>스캔 히스토리</Text>
        {selectedPet && <Text style={styles.petName}>{selectedPet.name}</Text>}
      </View>

      <FlatList
        data={history}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="document-text-outline" size={48} color={colors.primary} />
            <Text style={styles.emptyTitle}>스캔 기록이 없어요</Text>
            <Text style={styles.emptyDesc}>첫 스캔을 시작해보세요</Text>
          </View>
        }
      />
    </View>
  );
}

const createStyles = (colors: ReturnType<typeof useTheme>) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: {
    paddingHorizontal: 20,
    paddingTop: 56,
    paddingBottom: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
  },
  title: { fontSize: 22, fontWeight: '800', color: colors.text },
  petName: { fontSize: 14, color: colors.textSecondary },
  list: { paddingHorizontal: 16, paddingBottom: 24 },
  card: {
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 16,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardBody: { flex: 1 },
  cardDate: { fontSize: 13, color: colors.textSecondary },
  cardDesc: { fontSize: 15, fontWeight: '600', color: colors.text, marginTop: 2 },
  cardRight: { alignItems: 'flex-end', gap: 2 },
  empty: { flex: 1, alignItems: 'center', marginTop: 80, gap: 10 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: colors.text },
  emptyDesc: { fontSize: 14, color: colors.textSecondary },
});
