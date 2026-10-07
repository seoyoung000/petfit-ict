import React, { useState, useEffect, useMemo } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, FlatList,
  ActivityIndicator, Alert,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { Ionicons } from '@expo/vector-icons';
import { brushService, DiscoveredDevice } from '@/services/brushService';
import { useScanStore } from '@/store/useScanStore';
import { useTheme } from '@/theme/useTheme';
import { RootStackParams } from '@/navigation/AppNavigator';

type Nav = StackNavigationProp<RootStackParams>;

export default function BrushConnectScreen() {
  const nav = useNavigation<Nav>();
  const { setBrushStatus } = useScanStore();
  const [scanning, setScanning] = useState(false);
  const [devices, setDevices] = useState<DiscoveredDevice[]>([]);
  const [connecting, setConnecting] = useState<string | null>(null);
  const colors = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const isBle = brushService.transport === 'ble';

  useEffect(() => {
    return () => {
      brushService.stopStatusPolling();
    };
  }, []);

  const startScan = async () => {
    setDevices([]);
    setScanning(true);
    try {
      const found = await brushService.discover();
      setDevices(found);
      if (found.length === 0) {
        Alert.alert(
          '기기 없음',
          isBle
            ? '주변에서 펫핏 기기를 찾지 못했습니다. 기기 전원과 블루투스를 확인해주세요.'
            : '주변에서 펫핏 기기를 찾지 못했습니다.',
        );
      }
    } catch (e: any) {
      const msg = e?.message
        ? e.message
        : e?.response?.status === 401
          ? '로그인이 필요합니다.'
          : '백엔드에 연결할 수 없습니다. 서버가 실행 중인지 확인해주세요.';
      Alert.alert('검색 실패', msg);
    } finally {
      setScanning(false);
    }
  };

  const connect = async (device: DiscoveredDevice) => {
    setConnecting(device.id);
    try {
      const status = await brushService.connect(device);
      setBrushStatus(status);
      brushService.startStatusPolling((s) => setBrushStatus(s));
      nav.navigate('Scanning');
    } catch (e) {
      Alert.alert('연결 실패', '기기와 연결할 수 없습니다. 다시 시도해주세요.');
    } finally {
      setConnecting(null);
    }
  };

  return (
    <View style={styles.container}>
      <TouchableOpacity onPress={() => nav.goBack()} style={styles.backBtn}>
        <Ionicons name="chevron-back" size={28} color={colors.text} />
      </TouchableOpacity>

      <Text style={styles.title}>브러쉬 연결</Text>
      <Text style={styles.subtitle}>
        {isBle
          ? '주변 펫핏 기기를 블루투스로 검색해요'
          : '데모 모드: 가상 펫핏 기기를 검색해요'}
      </Text>

      {brushService.unavailableReason && (
        <Text style={styles.noticeText}>{brushService.unavailableReason}</Text>
      )}

      {/* Illustration */}
      <View style={styles.illustration}>
        <View style={[styles.ring, { width: 160, height: 160, opacity: 0.15 }]} />
        <View style={[styles.ring, { width: 120, height: 120, opacity: 0.25 }]} />
        <View style={styles.brushIcon}>
          <Ionicons name="brush" size={40} color={colors.primary} />
        </View>
      </View>

      <TouchableOpacity
        style={[styles.scanBtn, scanning && styles.scanBtnActive]}
        onPress={startScan}
        disabled={scanning}
      >
        {scanning ? (
          <ActivityIndicator color={colors.white} />
        ) : (
          <Ionicons name="bluetooth" size={20} color={colors.white} />
        )}
        <Text style={styles.scanBtnText}>{scanning ? '검색 중...' : '기기 검색'}</Text>
      </TouchableOpacity>

      <FlatList
        data={devices}
        keyExtractor={(d) => d.id}
        style={styles.list}
        ListEmptyComponent={
          scanning ? (
            <Text style={styles.emptyText}>주변 펫핏 기기를 찾는 중이에요...</Text>
          ) : null
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.deviceItem}
            onPress={() => connect(item)}
            disabled={!!connecting}
          >
            <View style={styles.deviceLeft}>
              <View style={styles.deviceDot} />
              <View>
                <Text style={styles.deviceName}>{item.name}</Text>
                <Text style={styles.deviceSerial}>S/N: {item.serial}</Text>
              </View>
            </View>
            {connecting === item.id ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              <Text style={styles.connectText}>연결</Text>
            )}
          </TouchableOpacity>
        )}
      />

      {/* Demo mode for testing without backend */}
      <TouchableOpacity
        style={styles.demoBtn}
        onPress={() => {
          setBrushStatus({ connected: true, battery: 85, medication: 70, scanning: false });
          nav.navigate('Scanning');
        }}
      >
        <Text style={styles.demoBtnText}>기기 없이 테스트 →</Text>
      </TouchableOpacity>
    </View>
  );
}

const createStyles = (colors: ReturnType<typeof useTheme>) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, paddingHorizontal: 20, paddingTop: 56 },
  backBtn: { marginBottom: 8, width: 40 },
  title: { fontSize: 24, fontWeight: '800', color: colors.text },
  subtitle: { fontSize: 14, color: colors.textSecondary, marginTop: 6 },
  noticeText: { fontSize: 12, color: colors.textLight, marginTop: 8 },
  illustration: { alignItems: 'center', justifyContent: 'center', height: 160, marginTop: 24, marginBottom: 24 },
  ring: {
    position: 'absolute',
    borderRadius: 999,
    backgroundColor: colors.primary,
  },
  brushIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.card,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  scanBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: colors.primary,
    borderRadius: 14,
    paddingVertical: 14,
    marginBottom: 20,
  },
  scanBtnActive: { opacity: 0.8 },
  scanBtnText: { color: colors.white, fontSize: 16, fontWeight: '700' },
  list: { flex: 1 },
  emptyText: { textAlign: 'center', color: colors.textSecondary, marginTop: 20 },
  deviceItem: {
    backgroundColor: colors.card,
    borderRadius: 14,
    padding: 16,
    marginBottom: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  deviceLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  deviceDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.primary },
  deviceName: { fontSize: 15, fontWeight: '600', color: colors.text },
  deviceSerial: { fontSize: 11, color: colors.textSecondary, marginTop: 2 },
  connectText: { color: colors.primary, fontSize: 14, fontWeight: '700' },
  demoBtn: { alignItems: 'center', paddingVertical: 16 },
  demoBtnText: { color: colors.textSecondary, fontSize: 13 },
});
