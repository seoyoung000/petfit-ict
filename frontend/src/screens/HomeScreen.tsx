import React, { useEffect, useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  RefreshControl, StatusBar, Image,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '@/store/useAuthStore';
import { usePetStore } from '@/store/usePetStore';
import { resolveMediaUrl } from '@/services/api';
import { useScanStore } from '@/store/useScanStore';
import { useTheme } from '@/theme/useTheme';
import SpeciesIcon from '@/components/SpeciesIcon';
import { RootStackParams } from '@/navigation/AppNavigator';
import SeverityBadge from '@/components/SeverityBadge';
import HealthScoreRing from '@/components/HealthScoreRing';

type Nav = StackNavigationProp<RootStackParams>;

export default function HomeScreen() {
  const nav = useNavigation<Nav>();
  const { user } = useAuthStore();
  const { selectedPet, fetchPets } = usePetStore();
  const { history, fetchHistory } = useScanStore();
  const [refreshing, setRefreshing] = React.useState(false);
  const colors = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const load = async () => {
    await fetchPets();
    if (selectedPet) await fetchHistory(selectedPet.id);
  };

  useEffect(() => { load(); }, []);
  useEffect(() => {
    if (selectedPet) fetchHistory(selectedPet.id);
  }, [selectedPet?.id]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const latestScan = history[0];

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.background} />
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
      >
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.greeting}>안녕하세요, {user?.name}님</Text>
            <Text style={styles.subGreeting}>오늘도 함께 케어해요</Text>
          </View>
          <TouchableOpacity onPress={() => nav.navigate('Settings')} style={styles.settingBtn}>
            <Ionicons name="settings-outline" size={24} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>

        {selectedPet ? (
          <>
            {/* Pet Card */}
            <TouchableOpacity
              style={styles.petCard}
              onPress={() => nav.navigate('PetProfile', { petId: selectedPet.id })}
              activeOpacity={0.8}
            >
              <View style={styles.petCardTop}>
                <View style={styles.petInfo}>
                  {selectedPet.profile_image_url ? (
                    <Image source={{ uri: resolveMediaUrl(selectedPet.profile_image_url) }} style={styles.petAvatarImage} />
                  ) : (
                    <View style={styles.petAvatar}>
                      <SpeciesIcon species={selectedPet.species} size={28} color={colors.primaryDark} />
                    </View>
                  )}
                  <View style={{ flex: 1 }}>
                    <Text style={styles.petName}>{selectedPet.name}</Text>
                    <Text style={styles.petBreed}>
                      {selectedPet.breed ?? (selectedPet.species === 'cat' ? '고양이' : '강아지')}
                      {selectedPet.age_months ? ` · ${formatAge(selectedPet.age_months)}` : ''}
                    </Text>
                    <Text style={styles.petSubInfo}>
                      등록일 {new Date(selectedPet.created_at).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' })}
                      {` · 함께한 지 ${daysSince(selectedPet.created_at)}일`}
                    </Text>
                  </View>
                </View>
                {latestScan && (
                  <View style={styles.latestHealth}>
                    <HealthScoreRing score={latestScan.health_score ?? 0} size={60} />
                    <SeverityBadge severity={latestScan.severity ?? 'normal'} />
                  </View>
                )}
              </View>

              <View style={styles.petChipsRow}>
                <View style={styles.petChip}>
                  <Ionicons name="barbell-outline" size={14} color={colors.textSecondary} />
                  <Text style={styles.petChipText}>
                    {selectedPet.weight_kg ? `${selectedPet.weight_kg}kg` : '몸무게 미입력'}
                  </Text>
                </View>
                <View style={styles.petChip}>
                  <Ionicons
                    name={selectedPet.neutered ? 'checkmark-circle' : 'ellipse-outline'}
                    size={14}
                    color={selectedPet.neutered ? colors.primary : colors.textSecondary}
                  />
                  <Text style={styles.petChipText}>
                    {selectedPet.neutered ? '중성화 완료' : '중성화 안 함'}
                  </Text>
                </View>
                {selectedPet.gender && (
                  <View style={styles.petChip}>
                    <Ionicons
                      name={selectedPet.gender === 'female' ? 'female' : 'male'}
                      size={14}
                      color={colors.textSecondary}
                    />
                    <Text style={styles.petChipText}>
                      {selectedPet.gender === 'female' ? '암컷' : '수컷'}
                    </Text>
                  </View>
                )}
              </View>
            </TouchableOpacity>

            {/* Scan Button */}
            <TouchableOpacity
              style={styles.scanBtn}
              onPress={() => nav.navigate('BrushConnect')}
            >
              <View style={styles.scanBtnInner}>
                <Ionicons name="scan-outline" size={28} color={colors.white} />
                <View>
                  <Text style={styles.scanBtnTitle}>피부 스캔 시작</Text>
                  <Text style={styles.scanBtnSub}>브러쉬를 연결하고 빗질을 시작하세요</Text>
                </View>
              </View>
              <Ionicons name="chevron-forward" size={20} color={colors.white} />
            </TouchableOpacity>

            {/* Latest Report Preview */}
            {latestScan && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>최근 리포트</Text>
                <TouchableOpacity
                  style={styles.reportCard}
                  onPress={() => nav.navigate('Report', { scanId: latestScan.id })}
                >
                  <View style={styles.reportRow}>
                    <Text style={styles.reportDate}>
                      {new Date(latestScan.scanned_at).toLocaleDateString('ko-KR', {
                        month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit',
                      })}
                    </Text>
                    <SeverityBadge severity={latestScan.severity ?? 'normal'} />
                  </View>
                  <Text style={styles.reportDesc}>
                    {latestScan.condition_count === 0
                      ? '이상이 발견되지 않았어요'
                      : `${latestScan.condition_count}개의 피부 상태가 감지됐어요`}
                  </Text>
                  <Text style={styles.reportLink}>자세히 보기 →</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Quick Stats */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>이번 달 현황</Text>
              <View style={styles.statsRow}>
                <StatCard icon="scan" label="총 스캔" value={`${history.length}회`} />
                <StatCard icon="checkmark-circle" label="정상 판정" value={`${history.filter(s => s.severity === 'normal').length}회`} color={colors.primary} />
                <StatCard icon="alert-circle" label="이상 감지" value={`${history.filter(s => s.severity !== 'normal').length}회`} color={colors.warning} />
              </View>
            </View>
          </>
        ) : (
          <View style={styles.emptyWrap}>
            <Ionicons name="paw" size={56} color={colors.primary} />
            <Text style={styles.emptyTitle}>반려동물을 등록해주세요</Text>
            <Text style={styles.emptyDesc}>프로필을 등록하면 피부 케어를 시작할 수 있어요</Text>
            <TouchableOpacity
              style={styles.addPetBtn}
              onPress={() => nav.navigate('PetProfile', {})}
            >
              <Text style={styles.addPetBtnText}>반려동물 등록하기</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

function formatAge(months: number): string {
  const years = Math.floor(months / 12);
  const remMonths = months % 12;
  if (years === 0) return `${remMonths}개월`;
  if (remMonths === 0) return `${years}세`;
  return `${years}세 ${remMonths}개월`;
}

function daysSince(isoDate: string): number {
  const diffMs = Date.now() - new Date(isoDate).getTime();
  return Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
}

function StatCard({ icon, label, value, color }: {
  icon: string; label: string; value: string; color?: string;
}) {
  const colors = useTheme();
  const statStyles = useMemo(() => createStatStyles(colors), [colors]);
  return (
    <View style={statStyles.card}>
      <Ionicons name={`${icon}-outline` as any} size={22} color={color ?? colors.textSecondary} />
      <Text style={statStyles.value}>{value}</Text>
      <Text style={statStyles.label}>{label}</Text>
    </View>
  );
}

const createStatStyles = (colors: ReturnType<typeof useTheme>) => StyleSheet.create({
  card: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderColor: colors.border,
  },
  value: { fontSize: 18, fontWeight: '700', color: colors.text },
  label: { fontSize: 11, color: colors.textSecondary },
});

const createStyles = (colors: ReturnType<typeof useTheme>) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 56,
    paddingBottom: 16,
  },
  greeting: { fontSize: 20, fontWeight: '700', color: colors.text },
  subGreeting: { fontSize: 13, color: colors.textSecondary, marginTop: 2 },
  settingBtn: { padding: 8 },
  petCard: {
    margin: 16,
    backgroundColor: colors.card,
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 14,
  },
  petCardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  petInfo: { flexDirection: 'row', alignItems: 'center', gap: 14, flex: 1 },
  petChipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  petChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.background,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: colors.border,
  },
  petChipText: { fontSize: 12, color: colors.textSecondary, fontWeight: '500' },
  petAvatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.primaryLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  petAvatarImage: { width: 52, height: 52, borderRadius: 26 },
  petName: { fontSize: 18, fontWeight: '700', color: colors.text },
  petBreed: { fontSize: 13, color: colors.textSecondary, marginTop: 2 },
  petSubInfo: { fontSize: 11, color: colors.textLight, marginTop: 3 },
  latestHealth: { alignItems: 'center', gap: 6 },
  scanBtn: {
    margin: 16,
    marginTop: 4,
    backgroundColor: colors.primary,
    borderRadius: 20,
    padding: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
  },
  scanBtnInner: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  scanBtnTitle: { fontSize: 17, fontWeight: '700', color: colors.white },
  scanBtnSub: { fontSize: 12, color: 'rgba(255,255,255,0.8)', marginTop: 2 },
  section: { paddingHorizontal: 16, marginBottom: 16 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: colors.text, marginBottom: 10 },
  reportCard: {
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 8,
  },
  reportRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  reportDate: { fontSize: 13, color: colors.textSecondary },
  reportDesc: { fontSize: 15, color: colors.text, fontWeight: '500' },
  reportLink: { fontSize: 13, color: colors.primary, fontWeight: '600' },
  statsRow: { flexDirection: 'row', gap: 10 },
  emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40, marginTop: 60, gap: 12 },
  emptyTitle: { fontSize: 20, fontWeight: '700', color: colors.text },
  emptyDesc: { fontSize: 14, color: colors.textSecondary, textAlign: 'center' },
  addPetBtn: { backgroundColor: colors.primary, borderRadius: 14, paddingHorizontal: 32, paddingVertical: 14, marginTop: 8 },
  addPetBtnText: { color: colors.white, fontSize: 16, fontWeight: '700' },
});
