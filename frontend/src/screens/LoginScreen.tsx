import React, { useMemo, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, Alert, ScrollView,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { useAuthStore } from '@/store/useAuthStore';
import { useTheme } from '@/theme/useTheme';
import { AuthStackParams } from '@/navigation/AppNavigator';

type Nav = StackNavigationProp<AuthStackParams, 'Login'>;

export default function LoginScreen() {
  const nav = useNavigation<Nav>();
  const { login, isLoading, loginAsGuest } = useAuthStore();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const colors = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const handleLogin = async () => {
    if (!email || !password) {
      Alert.alert('알림', '이메일과 비밀번호를 입력해주세요.');
      return;
    }
    try {
      await login(email.trim(), password);
    } catch (e: any) {
      Alert.alert('로그인 실패', e.response?.data?.detail ?? '이메일 또는 비밀번호를 확인해주세요.');
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.inner} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <Text style={styles.logoText}>Petfit</Text>
          <Text style={styles.subtitle}>반려동물 피부 케어 파트너</Text>
        </View>

        <View style={styles.form}>
          <Text style={styles.label}>이메일</Text>
          <TextInput
            style={styles.input}
            placeholder="이메일을 입력하세요"
            placeholderTextColor={colors.textLight}
            keyboardType="email-address"
            autoCapitalize="none"
            value={email}
            onChangeText={setEmail}
          />
          <Text style={styles.label}>비밀번호</Text>
          <TextInput
            style={styles.input}
            placeholder="비밀번호를 입력하세요"
            placeholderTextColor={colors.textLight}
            secureTextEntry
            value={password}
            onChangeText={setPassword}
          />

          <TouchableOpacity
            style={[styles.btn, isLoading && styles.btnDisabled]}
            onPress={handleLogin}
            disabled={isLoading}
          >
            <Text style={styles.btnText}>{isLoading ? '로그인 중...' : '로그인'}</Text>
          </TouchableOpacity>

          <TouchableOpacity onPress={() => nav.navigate('Register')} style={styles.linkRow}>
            <Text style={styles.linkText}>
              계정이 없으신가요? <Text style={styles.link}>회원가입</Text>
            </Text>
          </TouchableOpacity>

          <TouchableOpacity onPress={loginAsGuest} style={styles.guestBtn}>
            <Text style={styles.guestBtnText}>로그인 없이 둘러보기</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const createStyles = (colors: ReturnType<typeof useTheme>) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  inner: { flexGrow: 1, justifyContent: 'center', padding: 28 },
  header: { alignItems: 'center', marginBottom: 48, gap: 8 },
  logoText: { fontSize: 38, fontWeight: '800', color: colors.primary },
  subtitle: { fontSize: 15, color: colors.textSecondary },
  form: { gap: 8 },
  label: { fontSize: 14, fontWeight: '600', color: colors.text, marginTop: 8, marginBottom: 4 },
  input: {
    backgroundColor: colors.card,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: colors.border,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 15,
    color: colors.text,
  },
  btn: {
    backgroundColor: colors.primary,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 20,
  },
  btnDisabled: { opacity: 0.6 },
  btnText: { color: colors.white, fontSize: 17, fontWeight: '700' },
  linkRow: { alignItems: 'center', marginTop: 16 },
  linkText: { fontSize: 14, color: colors.textSecondary },
  link: { color: colors.primary, fontWeight: '600' },
  guestBtn: {
    marginTop: 28,
    paddingVertical: 14,
    alignItems: 'center',
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: 'transparent',
  },
  guestBtnText: { color: colors.textSecondary, fontSize: 15, fontWeight: '600' },
});
