import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Animated, Alert, Image, ActivityIndicator,
} from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import { brushService } from '@/services/brushService';
import { usePetStore } from '@/store/usePetStore';
import { useScanStore, ScanImage } from '@/store/useScanStore';
import { useTheme } from '@/theme/useTheme';
import { RootStackParams } from '@/navigation/AppNavigator';

type Nav = StackNavigationProp<RootStackParams>;

type Phase = 'ready' | 'analyzing';

const VIEW_SIZE = 260;
// 서버가 사진 가운데 70%만 잘라 진단한다 (AI_CENTER_CROP). 그 영역을 안내선으로 보여준다.
const GUIDE_SIZE = Math.round(VIEW_SIZE * 0.7);

export default function ScanningScreen() {
  const nav = useNavigation<Nav>();
  const route = useRoute<RouteProp<RootStackParams, 'Scanning'>>();
  const demo = route.params?.demo ?? false;
  const { selectedPet } = usePetStore();
  const { brushStatus, uploadScan } = useScanStore();

  // 실제 브러쉬가 연결돼 있으면 카메라 미리보기, 기기 없이 들어왔으면 사진을 직접 첨부
  const [live] = useState(() => !demo && brushService.canCapture);
  const [phase, setPhase] = useState<Phase>('ready');
  const [liveFrame, setLiveFrame] = useState<string | undefined>();
  const [attached, setAttached] = useState<ScanImage | undefined>();
  const [medicationUsed, setMedicationUsed] = useState(0);
  const [isDispensing, setIsDispensing] = useState(false);
  const colors = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const pulse = useRef(new Animated.Value(1)).current;
  const stopPreviewRef = useRef<(() => void) | null>(null);

  const startPreview = () => {
    stopPreviewRef.current = brushService.startPreview(setLiveFrame);
  };

  const stopPreview = () => {
    stopPreviewRef.current?.();
    stopPreviewRef.current = null;
  };

  useEffect(() => {
    if (!live) return;
    startPreview();
    return () => {
      stopPreview();
      brushService.cancelCapture();
    };
  }, [live]);

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.06, duration: 900, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 900, useNativeDriver: true }),
      ]),
    );
    if (phase === 'ready') loop.start();
    else loop.stop();
    return () => loop.stop();
  }, [phase]);

  const pickFromGallery = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: 'image/*',
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (!result.canceled && result.assets?.[0]) {
        setAttached({ uri: result.assets[0].uri });
      }
    } catch (e: any) {
      console.error('[image-attach] error:', e);
      Alert.alert('파일 선택 오류', String(e?.message ?? e));
    }
  };

  // 지금 화면을 그대로 멈추고 그 사진으로 AI 진단을 요청한다
  const startDiagnosis = async () => {
    if (!selectedPet) {
      Alert.alert('알림', '반려동물을 먼저 선택해주세요.');
      return;
    }
    setPhase('analyzing');

    try {
      let image: ScanImage | undefined = attached;
      if (live) {
        // 미리보기를 끊으면 마지막 프레임이 화면에 그대로 남는다
        stopPreview();
        let frame = liveFrame;
        if (!frame) {
          // 미리보기 프레임이 아직 없으면(또는 미리보기를 모르는 예전 펌웨어면) 한 장 촬영
          frame = await brushService.captureImage();
          setLiveFrame(frame);
        }
        image = { base64: frame };
      }
      const scan = await uploadScan(selectedPet.id, image, medicationUsed);
      nav.replace('Report', { scanId: scan.id });
    } catch (e: any) {
      // 서버가 사진 품질 문제(422)면 이유를 detail로 알려준다
      const detail = e?.response?.data?.detail;
      Alert.alert(
        '진단 실패',
        typeof detail === 'string' ? detail : e?.message ?? '진단을 요청하지 못했어요. 다시 시도해주세요.',
      );
      setPhase('ready');
      if (live) startPreview();
    }
  };

  const dispense = async () => {
    if (isDispensing || !brushStatus.connected) return;
    setIsDispensing(true);
    try {
      await brushService.dispense();
      Alert.alert('약물 분사 완료', '펌프 작동이 완료됐습니다.');
    } catch (e: any) {
      Alert.alert('약물 분사 실패', e?.message ?? '펌프 작동을 확인하지 못했어요.');
    } finally {
      setIsDispensing(false);
    }
  };

  const shownUri = live
    ? liveFrame && `data:image/jpeg;base64,${liveFrame}`
    : attached && ('uri' in attached ? attached.uri : `data:image/jpeg;base64,${attached.base64}`);

  const message =
    phase === 'analyzing' ? 'AI가 피부를 분석하고 있어요...'
    : live ? (liveFrame ? '진단할 부위를 가운데 원 안에 맞춰주세요' : '브러쉬 카메라를 연결하는 중이에요...')
    : attached ? '가운데 원 안의 부위로 진단해요'
    : '브러쉬 없이 진단하려면 사진을 첨부해주세요';

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => nav.goBack()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={28} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.title}>피부 진단</Text>
        <View style={styles.statusChip}>
          <View style={[styles.statusDot, { backgroundColor: live ? colors.primary : colors.textLight }]} />
          <Text style={styles.statusText}>{live ? '브러쉬 연결됨' : '기기 없음'}</Text>
        </View>
      </View>

      {/* Pet name */}
      <Text style={styles.petLabel}>
        {selectedPet ? `${selectedPet.name}의 피부 진단` : '반려동물 미선택'}
      </Text>

      {/* Camera view */}
      <View style={styles.center}>
        <Animated.View style={[styles.pulseRing, { transform: [{ scale: pulse }] }]} />
        <View style={styles.viewCircle}>
          {shownUri ? (
            <Image source={{ uri: shownUri }} style={styles.viewImage} />
          ) : (
            <Ionicons name={live ? 'videocam-outline' : 'image-outline'} size={48} color={colors.primary} />
          )}
          {shownUri && phase === 'ready' && <View style={styles.guideRing} pointerEvents="none" />}
          {live && phase === 'ready' && liveFrame && (
            <View style={styles.liveBadge}>
              <View style={styles.liveDot} />
              <Text style={styles.liveText}>LIVE</Text>
            </View>
          )}
          {phase === 'analyzing' && (
            <View style={styles.analyzingOverlay}>
              <ActivityIndicator size="large" color={colors.white} />
            </View>
          )}
        </View>
        {!live && attached && phase === 'ready' && (
          <TouchableOpacity onPress={() => setAttached(undefined)} style={styles.removeBtn}>
            <Ionicons name="close-circle" size={28} color={colors.error} />
          </TouchableOpacity>
        )}
      </View>

      {/* Phase message */}
      <Text style={styles.phaseMsg}>{message}</Text>

      {/* Device stats (브러쉬 연결 시에만) */}
      {live && (
        <View style={styles.statsRow}>
          <View style={styles.statChip}>
            <Ionicons name="battery-half-outline" size={16} color={colors.textSecondary} />
            <Text style={styles.statText}>{brushStatus.battery}%</Text>
          </View>
          <View style={styles.statChip}>
            <Ionicons name="medical-outline" size={16} color={colors.textSecondary} />
            <Text style={styles.statText}>약물 잔량 확인 불가</Text>
          </View>
        </View>
      )}

      {/* Module controls */}
      {phase === 'ready' && (
        <View style={styles.controls}>
          {live ? (
            <TouchableOpacity style={styles.controlBtn} onPress={dispense} disabled={!brushStatus.connected || isDispensing}>
              <Ionicons name="medical" size={22} color={brushStatus.connected ? colors.primary : colors.textLight} />
              <Text style={[styles.controlLabel, (!brushStatus.connected || isDispensing) && { color: colors.textLight }]}>
                {isDispensing ? '분사 중...' : '약물 분사'}
              </Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={styles.controlBtn} onPress={pickFromGallery}>
              <Ionicons name="image-outline" size={22} color={colors.info} />
              <Text style={[styles.controlLabel, { color: colors.info }]}>이미지 첨부</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* Action button */}
      <View style={styles.actionArea}>
        <TouchableOpacity
          style={[styles.mainBtn, phase === 'analyzing' && styles.mainBtnDisabled]}
          onPress={startDiagnosis}
          disabled={phase === 'analyzing'}
        >
          <Text style={styles.mainBtnText}>{phase === 'analyzing' ? '분석 중...' : '진단 시작'}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const createStyles = (colors: ReturnType<typeof useTheme>) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, paddingHorizontal: 20, paddingTop: 56 },
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  backBtn: { marginRight: 8 },
  title: { fontSize: 18, fontWeight: '700', color: colors.text, flex: 1 },
  statusChip: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.card, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6, borderWidth: 1, borderColor: colors.border },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  statusText: { fontSize: 12, color: colors.textSecondary },
  petLabel: { fontSize: 14, color: colors.textSecondary, marginBottom: 8, marginLeft: 4 },
  center: { alignItems: 'center', justifyContent: 'center', height: VIEW_SIZE + 60 },
  pulseRing: {
    position: 'absolute',
    width: VIEW_SIZE + 40,
    height: VIEW_SIZE + 40,
    borderRadius: (VIEW_SIZE + 40) / 2,
    backgroundColor: `${colors.primary}22`,
  },
  viewCircle: {
    width: VIEW_SIZE,
    height: VIEW_SIZE,
    borderRadius: VIEW_SIZE / 2,
    backgroundColor: colors.card,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 4,
    borderColor: colors.primary,
    overflow: 'hidden',
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 6,
  },
  viewImage: { width: '100%', height: '100%' },
  guideRing: {
    position: 'absolute',
    width: GUIDE_SIZE,
    height: GUIDE_SIZE,
    borderRadius: GUIDE_SIZE / 2,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.9)',
    borderStyle: 'dashed',
  },
  liveBadge: {
    position: 'absolute',
    top: 28,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.critical },
  liveText: { fontSize: 11, fontWeight: '700', color: colors.white },
  analyzingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  removeBtn: { position: 'absolute', top: 20, right: 40, backgroundColor: colors.white, borderRadius: 14 },
  phaseMsg: { fontSize: 15, color: colors.textSecondary, textAlign: 'center', marginVertical: 10 },
  statsRow: { flexDirection: 'row', gap: 10, justifyContent: 'center', marginBottom: 8 },
  statChip: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.card, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8, borderWidth: 1, borderColor: colors.border },
  statText: { fontSize: 13, color: colors.textSecondary },
  controls: { flexDirection: 'row', justifyContent: 'space-around', marginVertical: 4 },
  controlBtn: { alignItems: 'center', gap: 4, padding: 12 },
  controlLabel: { fontSize: 12, color: colors.text },
  actionArea: { flex: 1, justifyContent: 'flex-end', paddingBottom: 32 },
  mainBtn: {
    backgroundColor: colors.primary,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  mainBtnDisabled: { opacity: 0.6 },
  mainBtnText: { color: colors.white, fontSize: 17, fontWeight: '700' },
});
