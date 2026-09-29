import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Animated, Alert, Image,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { brushService } from '@/services/brushService';
import { usePetStore } from '@/store/usePetStore';
import { useScanStore } from '@/store/useScanStore';
import { useTheme } from '@/theme/useTheme';
import { RootStackParams } from '@/navigation/AppNavigator';

type Nav = StackNavigationProp<RootStackParams>;

type Phase = 'ready' | 'scanning' | 'uploading' | 'done';

export default function ScanningScreen() {
  const nav = useNavigation<Nav>();
  const { selectedPet } = usePetStore();
  const { brushStatus, uploadScan, setBrushStatus } = useScanStore();

  const [phase, setPhase] = useState<Phase>('ready');
  const [progress, setProgress] = useState(0);
  const [capturedImageUri, setCapturedImageUri] = useState<string | undefined>();
  const [medicationUsed, setMedicationUsed] = useState(0);
  const colors = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const pulse = useRef(new Animated.Value(1)).current;
  const progressAnim = useRef(new Animated.Value(0)).current;
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.15, duration: 900, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 900, useNativeDriver: true }),
      ]),
    );
    if (phase === 'scanning') loop.start();
    else loop.stop();
    return () => loop.stop();
  }, [phase]);

  const startScan = async () => {
    if (!selectedPet) {
      Alert.alert('알림', '반려동물을 먼저 선택해주세요.');
      return;
    }
    setPhase('scanning');
    setProgress(0);

    await brushService.sendCommand('START_SCAN');

    intervalRef.current = setInterval(() => {
      setProgress((p) => {
        if (p >= 100) {
          if (intervalRef.current) clearInterval(intervalRef.current);
          return 100;
        }
        return p + 2;
      });
    }, 200);
  };

  const stopScan = async () => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    await brushService.sendCommand('STOP_SCAN');
    setPhase('ready');
    setProgress(0);
    setBrushStatus({ scanning: false });
  };

  const captureWithCamera = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('권한 필요', '카메라 권한이 필요합니다. 설정에서 허용해주세요.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      quality: 0.85,
      allowsEditing: false,
    });
    if (!result.canceled) {
      setCapturedImageUri(result.assets[0].uri);
    }
  };

  const pickFromGallery = async () => {
    const result = await DocumentPicker.getDocumentAsync({
      type: 'image/*',
      copyToCacheDirectory: true,
      multiple: false,
    });
    if (!result.canceled && result.assets?.[0]) {
      setCapturedImageUri(result.assets[0].uri);
    }
  };

  const pickOrCaptureScanImage = async () => {
    try {
      await pickFromGallery();
    } catch (e: any) {
      console.error('[image-attach] error:', e);
      Alert.alert('파일 선택 오류', String(e?.message ?? e));
    }
  };

  const submitScan = async () => {
    if (!selectedPet) return;
    setPhase('uploading');
    try {
      const scan = await uploadScan(selectedPet.id, capturedImageUri, medicationUsed);
      setPhase('done');
      void brushService.sendCommand('STOP_SCAN');
      nav.replace('Report', { scanId: scan.id });
    } catch (e: any) {
      Alert.alert('오류', '스캔 결과를 업로드하지 못했습니다.');
      setPhase('ready');
    }
  };

  const dispense = async () => {
    await brushService.sendCommand('DISPENSE');
    setMedicationUsed((m) => m + 0.5);
    Alert.alert('약물 분사', '질환 부위에 약물을 분사했습니다.');
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => { stopScan(); nav.goBack(); }} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={28} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.title}>스캔 중</Text>
        <View style={styles.statusChip}>
          <View style={[styles.statusDot, { backgroundColor: brushStatus.connected ? colors.primary : colors.error }]} />
          <Text style={styles.statusText}>{brushStatus.connected ? '연결됨' : '연결 안 됨'}</Text>
        </View>
      </View>

      {/* Pet name */}
      <Text style={styles.petLabel}>
        {selectedPet ? `${selectedPet.name}의 피부 스캔` : '반려동물 미선택'}
      </Text>

      {/* Main animation */}
      <View style={styles.center}>
        <Animated.View style={[styles.pulseRing, { transform: [{ scale: pulse }] }]} />
        <View style={styles.scanCircle}>
          <Text style={styles.scanEmoji}>
            {phase === 'uploading' ? '⏳' : phase === 'done' ? '✅' : '🔬'}
          </Text>
          {phase === 'scanning' && (
            <Text style={styles.progressText}>{progress}%</Text>
          )}
        </View>
      </View>

      {/* Progress bar */}
      {phase === 'scanning' && (
        <View style={styles.progressBar}>
          <View style={[styles.progressFill, { width: `${progress}%` }]} />
        </View>
      )}

      {/* Phase message */}
      <Text style={styles.phaseMsg}>
        {phase === 'ready' && '브러쉬로 반려동물의 털을 빗어주세요'}
        {phase === 'scanning' && '카메라가 피부를 촬영하고 있어요...'}
        {phase === 'uploading' && 'AI가 피부를 분석하고 있어요...'}
        {phase === 'done' && '분석 완료!'}
      </Text>

      {/* Device stats */}
      <View style={styles.statsRow}>
        <View style={styles.statChip}>
          <Ionicons name="battery-half-outline" size={16} color={colors.textSecondary} />
          <Text style={styles.statText}>{brushStatus.battery}%</Text>
        </View>
        <View style={styles.statChip}>
          <Ionicons name="medical-outline" size={16} color={colors.textSecondary} />
          <Text style={styles.statText}>약물 {brushStatus.medication}%</Text>
        </View>
      </View>

      {/* Module controls */}
      {phase !== 'uploading' && (
        <View style={styles.controls}>
          <TouchableOpacity style={styles.controlBtn} onPress={dispense} disabled={!brushStatus.connected}>
            <Ionicons name="medical" size={22} color={brushStatus.connected ? colors.primary : colors.textLight} />
            <Text style={[styles.controlLabel, !brushStatus.connected && { color: colors.textLight }]}>약물 분사</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.controlBtn} onPress={pickOrCaptureScanImage}>
            <Ionicons name="image-outline" size={22} color={colors.info} />
            <Text style={[styles.controlLabel, { color: colors.info }]}>이미지 첨부</Text>
          </TouchableOpacity>
        </View>
      )}

      {capturedImageUri && (
        <View style={styles.previewBox}>
          <Image source={{ uri: capturedImageUri }} style={styles.previewImage} />
          <TouchableOpacity onPress={() => setCapturedImageUri(undefined)} style={styles.previewRemove}>
            <Ionicons name="close-circle" size={22} color={colors.error} />
          </TouchableOpacity>
        </View>
      )}

      {/* Action button */}
      <View style={styles.actionArea}>
        {phase === 'ready' && (
          <TouchableOpacity style={styles.mainBtn} onPress={startScan}>
            <Text style={styles.mainBtnText}>스캔 시작</Text>
          </TouchableOpacity>
        )}
        {phase === 'scanning' && progress >= 100 && (
          <TouchableOpacity style={styles.mainBtn} onPress={submitScan}>
            <Text style={styles.mainBtnText}>결과 분석하기</Text>
          </TouchableOpacity>
        )}
        {phase === 'scanning' && progress < 100 && (
          <TouchableOpacity style={[styles.mainBtn, styles.stopBtn]} onPress={stopScan}>
            <Text style={styles.mainBtnText}>스캔 중지</Text>
          </TouchableOpacity>
        )}
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
  petLabel: { fontSize: 14, color: colors.textSecondary, marginBottom: 16, marginLeft: 4 },
  center: { alignItems: 'center', justifyContent: 'center', height: 180 },
  pulseRing: {
    position: 'absolute',
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: `${colors.primary}22`,
  },
  scanCircle: {
    width: 110,
    height: 110,
    borderRadius: 55,
    backgroundColor: colors.card,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: colors.primary,
    gap: 4,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 6,
  },
  scanEmoji: { fontSize: 36 },
  progressText: { fontSize: 16, fontWeight: '700', color: colors.primary },
  progressBar: { height: 6, backgroundColor: colors.border, borderRadius: 3, marginVertical: 12, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: colors.primary, borderRadius: 3 },
  phaseMsg: { fontSize: 15, color: colors.textSecondary, textAlign: 'center', marginVertical: 10 },
  statsRow: { flexDirection: 'row', gap: 10, justifyContent: 'center', marginBottom: 16 },
  statChip: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.card, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8, borderWidth: 1, borderColor: colors.border },
  statText: { fontSize: 13, color: colors.textSecondary },
  controls: { flexDirection: 'row', justifyContent: 'space-around', marginVertical: 8 },
  controlBtn: { alignItems: 'center', gap: 4, padding: 12 },
  controlLabel: { fontSize: 12, color: colors.text },
  previewBox: { alignSelf: 'center', marginVertical: 8, position: 'relative' },
  previewImage: { width: 120, height: 120, borderRadius: 12, borderWidth: 2, borderColor: colors.primary },
  previewRemove: { position: 'absolute', top: -8, right: -8, backgroundColor: colors.white, borderRadius: 12 },
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
  stopBtn: { backgroundColor: colors.error },
  mainBtnText: { color: colors.white, fontSize: 17, fontWeight: '700' },
});
