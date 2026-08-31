import 'react-native-gesture-handler';
import React, { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import * as Notifications from 'expo-notifications';
import * as SplashScreen from 'expo-splash-screen';
import { useAuthStore } from '@/store/useAuthStore';
import { useThemeStore } from '@/store/useThemeStore';
import { authAPI } from '@/services/api';
import AppNavigator from '@/navigation/AppNavigator';

SplashScreen.preventAutoHideAsync();

Notifications.setNotificationHandler({
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
    if (!user) return;
    // Register push token after login
    Notifications.getExpoPushTokenAsync()
      .then(({ data }) => {
        const platform = require('react-native').Platform.OS;
        authAPI.updateDeviceToken(data, platform).catch(() => {});
      })
      .catch(() => {});
  }, [user?.id]);

  if (!isThemeLoaded) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <AppNavigator />
    </GestureHandlerRootView>
  );
}
