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

type Nav = StackNavigationProp<AuthStackParams, 'Register'>;

export default function RegisterScreen() {
  const nav = useNavigation<Nav>();
  const { register, isLoading } = useAuthStore();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const colors = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const handleRegister = async () => {
    if (!name || !email || !password) {
      Alert.alert('알림', '모든 항목을 입력해주세요.');
      return;
    }
    if (password !== confirm) {
      Alert.alert('알림', '비밀번호가 일치하지 않습니다.');
      return;
    }
    if (password.length < 8) {
      Alert.alert('알림', '비밀번호는 8자 이상이어야 합니다.');
      return;
    }
    try {
      await register(email.trim(), password, name.trim());
    } catch (e: any) {
      Alert.alert('회원가입 실패', e.response?.data?.detail ?? '오류가 발생했습니다.');
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.inner} keyboardShouldPersistTaps="handled">
        <TouchableOpacity onPress={() => nav.goBack()} style={styles.back}>
          <Text style={styles.backText}>← 로그인으로</Text>
        </TouchableOpacity>

        <Text style={styles.title}>회원가입</Text>
        <Text style={styles.subtitle}>반려동물과 함께 시작해요</Text>

        <View style={styles.form}>
          {[
            { label: '이름', value: name, onChange: setName, placeholder: '이름을 입력하세요' },
            { label: '이메일', value: email, onChange: setEmail, placeholder: '이메일을 입력하세요', keyboard: 'email-address' as const },
            { label: '비밀번호', value: password, onChange: setPassword, placeholder: '8자 이상 입력하세요', secure: true },
            { label: '비밀번호 확인', value: confirm, onChange: setConfirm, placeholder: '비밀번호를 다시 입력하세요', secure: true },
          ].map(({ label, value, onChange, placeholder, keyboard, secure }) => (
            <View key={label}>
              <Text style={styles.label}>{label}</Text>
              <TextInput
                style={styles.input}
                placeholder={placeholder}
                placeholderTextColor={colors.textLight}
                value={value}
                onChangeText={onChange}
                keyboardType={keyboard}
                autoCapitalize="none"
                secureTextEntry={secure}
              />
            </View>
          ))}

          <TouchableOpacity
            style={[styles.btn, isLoading && styles.btnDisabled]}
            onPress={handleRegister}
            disabled={isLoading}
          >
            <Text style={styles.btnText}>{isLoading ? '가입 중...' : '가입하기'}</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const createStyles = (colors: ReturnType<typeof useTheme>) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  inner: { flexGrow: 1, padding: 28, paddingTop: 56 },
  back: { marginBottom: 24 },
  backText: { color: colors.primary, fontSize: 15, fontWeight: '600' },
  title: { fontSize: 28, fontWeight: '800', color: colors.text },
  subtitle: { fontSize: 15, color: colors.textSecondary, marginTop: 6, marginBottom: 28 },
  form: { gap: 4 },
  label: { fontSize: 14, fontWeight: '600', color: colors.text, marginTop: 12, marginBottom: 4 },
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
    marginTop: 24,
  },
  btnDisabled: { opacity: 0.6 },
  btnText: { color: colors.white, fontSize: 17, fontWeight: '700' },
});
