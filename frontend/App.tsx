import 'react-native-gesture-handler';
import React, { useEffect } from 'react';
import { Platform } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import * as SplashScreen from 'expo-splash-screen';
import { useAuthStore } from '@/store/useAuthStore';
import { useThemeStore } from '@/store/useThemeStore';
import { authAPI } from '@/services/api';
import AppNavigator from '@/navigation/AppNavigator';

SplashScreen.preventAutoHideAsync();

// Expo Go(SDK 53+)는 푸시 알림을 지원하지 않고, 모듈을 불러오기만 해도 에러를 띄운다.
// 그래서 Expo Go에서는 expo-notifications를 아예 로드하지 않는다.
const isExpoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;
const Notifications: typeof import('expo-notifications') | null = isExpoGo
  ? null
  : require('expo-notifications');

Notifications?.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

export default function App() {
  const { initialize, user } = useAuthStore();
  const loadTheme = useThemeStore((s) => s.loadTheme);
  const isThemeLoaded = useThemeStore((s) => s.isLoaded);

  useEffect(() => {
    Promise.all([initialize(), loadTheme()]).then(() => SplashScreen.hideAsync());
  }, []);

  useEffect(() => {
    if (!user || !Notifications) return;
    // Register push token after login
    Notifications.getExpoPushTokenAsync()
      .then(({ data }) => {
        authAPI.updateDeviceToken(data, Platform.OS).catch(() => {});
      })
      .catch(() => {});
  }, [user?.id]);

  if (!isThemeLoaded) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <AppNavigator />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
