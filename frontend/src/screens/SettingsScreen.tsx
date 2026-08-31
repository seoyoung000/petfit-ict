import React, { useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '@/store/useAuthStore';
import { useThemeStore } from '@/store/useThemeStore';
import { useTheme } from '@/theme/useTheme';
import { themes, themeLabels, ThemeName } from '@/theme/colors';

export default function SettingsScreen() {
  const nav = useNavigation();
  const { user, logout } = useAuthStore();
  const { themeName, setTheme } = useThemeStore();
  const colors = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const handleLogout = () => {
    Alert.alert('로그아웃', '정말 로그아웃 하시겠어요?', [
      { text: '취소', style: 'cancel' },
      { text: '로그아웃', style: 'destructive', onPress: logout },
    ]);
  };

  const themeOptions: ThemeName[] = ['green', 'pink', 'yellow'];

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => nav.goBack()}>
          <Ionicons name="chevron-back" size={28} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.title}>설정</Text>
        <View style={{ width: 28 }} />
      </View>

      {/* Profile info */}
      <View style={styles.profileCard}>
        <View style={styles.profileAvatar}>
          <Text style={styles.profileEmoji}>👤</Text>
        </View>
        <View>
          <Text style={styles.profileName}>{user?.name}</Text>
          <Text style={styles.profileEmail}>{user?.email}</Text>
        </View>
      </View>

      {/* Theme picker */}
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>테마</Text>
        <View style={styles.themeRow}>
          {themeOptions.map((name) => {
            const palette = themes[name];
            const isActive = themeName === name;
            return (
              <TouchableOpacity
                key={name}
                onPress={() => setTheme(name)}
                style={styles.themeItem}
                activeOpacity={0.7}
              >
                <View style={[
                  styles.themeCircleOuter,
                  isActive && { borderColor: palette.primary, borderWidth: 3 },
                ]}>
                  <View style={[styles.themeCircleInner, { backgroundColor: palette.primary }]}>
                    {isActive && (
                      <Ionicons name="checkmark" size={22} color={colors.white} />
                    )}
                  </View>
                </View>
                <Text style={[
                  styles.themeLabel,
                  isActive && { color: palette.primary, fontWeight: '700' },
                ]}>
                  {themeLabels[name]}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* Menu */}
      <View style={styles.section}>
        {[
          { icon: 'notifications-outline', label: '알림 설정' },
          { icon: 'shield-outline', label: '개인정보 처리방침' },
          { icon: 'document-text-outline', label: '서비스 이용약관' },
          { icon: 'information-circle-outline', label: `앱 버전 1.0.0` },
        ].map(({ icon, label }) => (
          <TouchableOpacity key={label} style={styles.menuItem}>
            <Ionicons name={icon as any} size={20} color={colors.textSecondary} />
            <Text style={styles.menuLabel}>{label}</Text>
            <Ionicons name="chevron-forward" size={16} color={colors.textLight} />
          </TouchableOpacity>
        ))}
      </View>

      <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
        <Ionicons name="log-out-outline" size={18} color={colors.error} />
        <Text style={styles.logoutText}>로그아웃</Text>
      </TouchableOpacity>
    </View>
  );
}

const createStyles = (colors: ReturnType<typeof useTheme>) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 56, paddingBottom: 16 },
  title: { fontSize: 18, fontWeight: '700', color: colors.text },
  profileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    margin: 16,
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: colors.border,
  },
  profileAvatar: { width: 52, height: 52, borderRadius: 26, backgroundColor: colors.primaryLight, justifyContent: 'center', alignItems: 'center' },
  profileEmoji: { fontSize: 26 },
  profileName: { fontSize: 17, fontWeight: '700', color: colors.text },
  profileEmail: { fontSize: 13, color: colors.textSecondary, marginTop: 2 },
  section: { paddingHorizontal: 16, marginTop: 4 },
  sectionLabel: { fontSize: 13, fontWeight: '700', color: colors.textSecondary, marginBottom: 10, marginLeft: 4, textTransform: 'uppercase', letterSpacing: 0.5 },
  themeRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    backgroundColor: colors.card,
    borderRadius: 16,
    paddingVertical: 18,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 16,
  },
  themeItem: { alignItems: 'center', gap: 8 },
  themeCircleOuter: {
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 2,
    borderColor: 'transparent',
    justifyContent: 'center',
    alignItems: 'center',
  },
  themeCircleInner: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
  themeLabel: { fontSize: 13, color: colors.textSecondary },
  menuItem: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.card, borderRadius: 12, padding: 16, marginBottom: 8, borderWidth: 1, borderColor: colors.border },
  menuLabel: { flex: 1, fontSize: 15, color: colors.text },
  logoutBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, margin: 24, padding: 16, borderRadius: 14, borderWidth: 1.5, borderColor: colors.error },
  logoutText: { color: colors.error, fontSize: 16, fontWeight: '600' },
});
