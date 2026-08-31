import React, { useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { useAuthStore } from '@/store/useAuthStore';
import { useTheme } from '@/theme/useTheme';
import { AuthStackParams } from '@/navigation/AppNavigator';

type Nav = StackNavigationProp<AuthStackParams, 'Splash'>;

export default function SplashScreen() {
  const nav = useNavigation<Nav>();
  const { initialize, user } = useAuthStore();
  const opacity = React.useRef(new Animated.Value(0)).current;
  const scale = React.useRef(new Animated.Value(0.8)).current;
  const colors = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 800, useNativeDriver: true }),
      Animated.spring(scale, { toValue: 1, friction: 5, useNativeDriver: true }),
    ]).start();

    initialize().then(() => {
      setTimeout(() => {
        if (user) return; // AppNavigator handles redirect
        nav.replace('Onboarding');
      }, 1800);
    });
  }, []);

  return (
    <View style={styles.container}>
      <Animated.View style={[styles.logoWrap, { opacity, transform: [{ scale }] }]}>
        <View style={styles.logoBall}>
          <Text style={styles.logoEmoji}>🐾</Text>
        </View>
        <Text style={styles.logoText}>Petfit</Text>
        <Text style={styles.tagline}>빗질 한 번으로 진단부터 케어까지</Text>
      </Animated.View>
    </View>
  );
}

const createStyles = (colors: ReturnType<typeof useTheme>) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    justifyContent: 'center',
    alignItems: 'center',
  },
  logoWrap: { alignItems: 'center', gap: 12 },
  logoBall: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 16,
    elevation: 10,
  },
  logoEmoji: { fontSize: 44 },
  logoText: {
    fontSize: 36,
    fontWeight: '800',
    color: colors.primary,
    letterSpacing: -0.5,
  },
  tagline: { fontSize: 14, color: colors.textSecondary, marginTop: 4 },
});
