import React, { useEffect, useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Image,
} from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { Ionicons } from '@expo/vector-icons';
import { useScanStore } from '@/store/useScanStore';
import { resolveMediaUrl } from '@/services/api';
import { baseColors } from '@/theme/colors';
import { useTheme } from '@/theme/useTheme';
import { RootStackParams } from '@/navigation/AppNavigator';
import SeverityBadge from '@/components/SeverityBadge';
import HealthScoreRing from '@/components/HealthScoreRing';
import { DiagnosisItem } from '@/types';

type Nav = StackNavigationProp<RootStackParams>;
type Params = RouteProp<RootStackParams, 'Report'>;

const SEVERITY_DESC = {
  normal: { label: '정상', desc: '피부 상태가 양호해요!', color: baseColors.normal, emoji: '✨' },
  minor: { label: '경미한 이상', desc: '가벼운 증상이 발견됐어요.', color: baseColors.minor, emoji: '🔍' },
  warning: { label: '주의 필요', desc: '수의사 상담을 권장해요.', color: baseColors.warning, emoji: '⚠️' },
  critical: { label: '즉시 진료 필요', desc: '가능한 빨리 동물병원을 방문하세요.', color: baseColors.critical, emoji: '🚨' },
};

export default function ReportScreen() {
  const nav = useNavigation<Nav>();
  const route = useRoute<Params>();
  const { currentScan, fetchScan } = useScanStore();
  const { scanId } = route.params;
  const colors = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  useEffect(() => {
    if (!currentScan || currentScan.id !== scanId) fetchScan(scanId);
  }, [scanId]);

  if (!currentScan) {
    return (
      <View style={styles.loading}>
        <Text style={styles.loadingText}>리포트 불러오는 중...</Text>
      </View>
    );
  }

  const sev = SEVERITY_DESC[currentScan.severity ?? 'normal'];
  const scanImageUri = resolveMediaUrl(currentScan.image_url);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => nav.goBack()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={28} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.title}>피부 리포트</Text>
        <Text style={styles.date}>
          {new Date(currentScan.scanned_at).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' })}
        </Text>
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Score card */}
        <View style={[styles.scoreCard, { borderColor: sev.color }]}>
          <View style={styles.scoreLeft}>
            <Text style={styles.sevEmoji}>{sev.emoji}</Text>
            <View>
              <Text style={[styles.sevLabel, { color: sev.color }]}>{sev.label}</Text>
              <Text style={styles.sevDesc}>{sev.desc}</Text>
            </View>
          </View>
          <HealthScoreRing score={currentScan.health_score ?? 0} size={76} />
        </View>

        {/* Scan image */}
        {scanImageUri && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>스캔 이미지</Text>
            <Image
              source={{ uri: scanImageUri }}
              style={styles.scanImage}
              resizeMode="cover"
              onError={(e) =>
                console.warn('[report] 스캔 이미지 로드 실패:', scanImageUri, e.nativeEvent?.error)
              }
            />
          </View>
        )}

        {/* Diagnoses */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            진단 결과 {currentScan.diagnoses.length > 0 ? `(${currentScan.diagnoses.length}건)` : ''}
          </Text>
          {currentScan.diagnoses.length === 0 ? (
            <View style={styles.normalCard}>
              <Text style={styles.normalEmoji}>🌿</Text>
              <Text style={styles.normalText}>피부 이상 없음</Text>
              <Text style={styles.normalSub}>계속 케어를 유지해주세요</Text>
            </View>
          ) : (
            currentScan.diagnoses.map((d, i) => (
              <DiagCard key={i} item={d} />
            ))
          )}
        </View>

        {/* Medication & Suction */}
        {(currentScan.medication_dispensed > 0 || currentScan.suction_used > 0) && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>처치 내역</Text>
            <View style={styles.treatRow}>
              {currentScan.medication_dispensed > 0 && (
                <View style={styles.treatItem}>
                  <Ionicons name="medical" size={18} color={colors.primary} />
                  <Text style={styles.treatText}>약물 분사 {currentScan.medication_dispensed}ml</Text>
                </View>
              )}
              {currentScan.suction_used > 0 && (
                <View style={styles.treatItem}>
                  <Ionicons name="funnel" size={18} color={colors.lavender} />
                  <Text style={styles.treatText}>흡입 처리 {currentScan.suction_used}초</Text>
                </View>
              )}
            </View>
          </View>
        )}

        <View style={{ height: 32 }} />
      </ScrollView>

      <TouchableOpacity style={styles.homeBtn} onPress={() => nav.navigate('MainTabs')}>
        <Text style={styles.homeBtnText}>홈으로 돌아가기</Text>
      </TouchableOpacity>
    </View>
  );
}

function DiagCard({ item }: { item: DiagnosisItem }) {
  const colors = useTheme();
  const diagStyles = useMemo(() => createDiagStyles(colors), [colors]);
  const pct = Math.round(item.confidence * 100);
  return (
    <View style={diagStyles.card}>
      <View style={diagStyles.row}>
        <Text style={diagStyles.name}>{item.condition}</Text>
        {item.area && <Text style={diagStyles.area}>{item.area}</Text>}
      </View>
      <View style={diagStyles.barBg}>
        <View style={[diagStyles.barFill, { width: `${pct}%` }]} />
      </View>
      <View style={diagStyles.row}>
        <Text style={diagStyles.conf}>신뢰도 {pct}%</Text>
        <Text style={diagStyles.action}>{item.action}</Text>
      </View>
    </View>
  );
}

const createDiagStyles = (colors: ReturnType<typeof useTheme>) => StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: 14,
    padding: 16,
    marginBottom: 10,
    gap: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  name: { fontSize: 15, fontWeight: '700', color: colors.text },
  area: { fontSize: 12, color: colors.textSecondary, backgroundColor: colors.lavenderLight, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 },
  barBg: { height: 6, backgroundColor: colors.border, borderRadius: 3 },
  barFill: { height: '100%', backgroundColor: colors.warning, borderRadius: 3 },
  conf: { fontSize: 12, color: colors.textSecondary },
  action: { fontSize: 12, color: colors.primary, fontWeight: '600', flex: 1, textAlign: 'right' },
});

const createStyles = (colors: ReturnType<typeof useTheme>) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  loading: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { color: colors.textSecondary },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 56,
    paddingBottom: 12,
  },
  backBtn: { marginRight: 8 },
  title: { fontSize: 18, fontWeight: '700', color: colors.text, flex: 1 },
  date: { fontSize: 13, color: colors.textSecondary },
  scoreCard: {
    margin: 16,
    backgroundColor: colors.card,
    borderRadius: 20,
    padding: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 2,
  },
  scoreLeft: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  sevEmoji: { fontSize: 32 },
  sevLabel: { fontSize: 18, fontWeight: '700' },
  sevDesc: { fontSize: 13, color: colors.textSecondary, marginTop: 2 },
  section: { paddingHorizontal: 16, marginBottom: 16 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: colors.text, marginBottom: 10 },
  scanImage: { width: '100%', height: 200, borderRadius: 16 },
  normalCard: { backgroundColor: colors.primary + '1A', borderRadius: 16, padding: 24, alignItems: 'center', gap: 6 },
  normalEmoji: { fontSize: 40 },
  normalText: { fontSize: 17, fontWeight: '700', color: colors.primary },
  normalSub: { fontSize: 13, color: colors.textSecondary },
  treatRow: { gap: 8 },
  treatItem: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.card, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: colors.border },
  treatText: { fontSize: 14, color: colors.text },
  homeBtn: {
    margin: 16,
    backgroundColor: colors.primary,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
  },
  homeBtnText: { color: colors.white, fontSize: 16, fontWeight: '700' },
});
