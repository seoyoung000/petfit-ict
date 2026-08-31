import React, { useMemo, useState, useRef } from 'react';
import { View, Text, StyleSheet, FlatList, Dimensions, TouchableOpacity, Animated } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { useTheme } from '@/theme/useTheme';
import { AuthStackParams } from '@/navigation/AppNavigator';

const { width } = Dimensions.get('window');
type Nav = StackNavigationProp<AuthStackParams, 'Onboarding'>;

const SLIDES = [
  {
    emoji: '🪮',
    title: '빗질 한 번으로\n피부 상태 스캔',
    desc: '내장 카메라가 털 속 피부를\n실시간으로 촬영하고 분석해요.',
    bg: '#EDF7EA',
  },
  {
    emoji: '🧠',
    title: 'AI가 진단하고\n리포트로 알려드려요',
    desc: '아토피, 세균성 피부염 등\n8가지 피부 질환을 조기에 발견해요.',
    bg: '#F0EBFA',
  },
  {
    emoji: '💊',
    title: '처방약을 직접\n환부에 분사해요',
    desc: '브러쉬 모 사이로 약물이\n질환 부위에 정밀하게 투약돼요.',
    bg: '#FEF3E9',
  },
  {
    emoji: '🐛',
    title: '진드기도\n스트레스 없이 제거',
    desc: '이물질 발견 시 저소음 흡입으로\n반려동물이 놀라지 않게 처리해요.',
    bg: '#E8F4FD',
  },
];

export default function OnboardingScreen() {
  const nav = useNavigation<Nav>();
  const [index, setIndex] = useState(0);
  const listRef = useRef<FlatList>(null);
  const colors = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const next = () => {
    if (index < SLIDES.length - 1) {
      listRef.current?.scrollToIndex({ index: index + 1 });
      setIndex(index + 1);
    } else {
      nav.replace('Login');
    }
  };

  return (
    <View style={styles.container}>
      <FlatList
        ref={listRef}
        data={SLIDES}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        scrollEnabled={false}
        keyExtractor={(_, i) => String(i)}
        renderItem={({ item }) => (
          <View style={[styles.slide, { backgroundColor: item.bg }]}>
            <Text style={styles.emoji}>{item.emoji}</Text>
            <Text style={styles.title}>{item.title}</Text>
            <Text style={styles.desc}>{item.desc}</Text>
          </View>
        )}
      />
      <View style={styles.footer}>
        <View style={styles.dots}>
          {SLIDES.map((_, i) => (
            <View key={i} style={[styles.dot, i === index && styles.dotActive]} />
          ))}
        </View>
        <TouchableOpacity style={styles.btn} onPress={next}>
          <Text style={styles.btnText}>
            {index < SLIDES.length - 1 ? '다음' : '시작하기'}
          </Text>
        </TouchableOpacity>
        {index < SLIDES.length - 1 && (
          <TouchableOpacity onPress={() => nav.replace('Login')} style={styles.skip}>
            <Text style={styles.skipText}>건너뛰기</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const createStyles = (colors: ReturnType<typeof useTheme>) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  slide: {
    width,
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
    gap: 20,
  },
  emoji: { fontSize: 80 },
  title: { fontSize: 26, fontWeight: '700', color: colors.text, textAlign: 'center', lineHeight: 36 },
  desc: { fontSize: 16, color: colors.textSecondary, textAlign: 'center', lineHeight: 24 },
  footer: {
    padding: 32,
    alignItems: 'center',
    gap: 16,
    backgroundColor: colors.background,
  },
  dots: { flexDirection: 'row', gap: 8 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.border },
  dotActive: { backgroundColor: colors.primary, width: 24 },
  btn: {
    backgroundColor: colors.primary,
    paddingVertical: 16,
    paddingHorizontal: 48,
    borderRadius: 28,
    width: '100%',
    alignItems: 'center',
  },
  btnText: { color: colors.white, fontSize: 17, fontWeight: '700' },
  skip: { paddingVertical: 4 },
  skipText: { color: colors.textSecondary, fontSize: 14 },
});
