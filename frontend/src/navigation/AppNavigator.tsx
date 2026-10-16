import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuthStore } from '@/store/useAuthStore';
import { useTheme } from '@/theme/useTheme';

// Auth screens
import SplashScreen from '@/screens/SplashScreen';
import OnboardingScreen from '@/screens/OnboardingScreen';
import LoginScreen from '@/screens/LoginScreen';
import RegisterScreen from '@/screens/RegisterScreen';

// Main screens
import HomeScreen from '@/screens/HomeScreen';
import BrushConnectScreen from '@/screens/BrushConnectScreen';
import ScanningScreen from '@/screens/ScanningScreen';
import ReportScreen from '@/screens/ReportScreen';
import HistoryScreen from '@/screens/HistoryScreen';
import PetProfileScreen from '@/screens/PetProfileScreen';
import PetListScreen from '@/screens/PetListScreen';
import SettingsScreen from '@/screens/SettingsScreen';

export type AuthStackParams = {
  Splash: undefined;
  Onboarding: undefined;
  Login: undefined;
  Register: undefined;
};

export type RootStackParams = {
  MainTabs: undefined;
  BrushConnect: undefined;
  // demo: 브러쉬 없이 사진 첨부로 진단 (실제 연결이 있어도 쓰지 않음)
  Scanning: { demo?: boolean } | undefined;
  Report: { scanId: string };
  PetProfile: { petId?: string };
  Settings: undefined;
};

export type TabParams = {
  Home: undefined;
  History: undefined;
  Profile: undefined;
};

const AuthStack = createStackNavigator<AuthStackParams>();
const RootStack = createStackNavigator<RootStackParams>();
const Tab = createBottomTabNavigator<TabParams>();

function MainTabs() {
  const colors = useTheme();
  // 안드로이드 edge-to-edge라 탭바가 시스템 하단바 밑으로 들어가므로 그만큼 띄운다.
  const insets = useSafeAreaInsets();
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textLight,
        tabBarStyle: {
          backgroundColor: colors.card,
          borderTopColor: colors.border,
          paddingBottom: 6 + insets.bottom,
          height: 60 + insets.bottom,
        },
        tabBarIcon: ({ color, size }) => {
          const icons: Record<string, string> = {
            Home: 'home',
            History: 'time',
            Profile: 'paw',
          };
          return <Ionicons name={`${icons[route.name]}-outline` as any} size={size} color={color} />;
        },
        tabBarLabel:
          route.name === 'Home' ? '홈' :
          route.name === 'History' ? '히스토리' : '내 반려동물',
      })}
    >
      <Tab.Screen name="Home" component={HomeScreen} />
      <Tab.Screen name="History" component={HistoryScreen} />
      <Tab.Screen name="Profile" component={PetListScreen} />
    </Tab.Navigator>
  );
}

// 스택 화면 하단 버튼이 시스템 하단바에 가려지지 않게 하단 여백을 준다.
function useStackScreenOptions() {
  const colors = useTheme();
  const insets = useSafeAreaInsets();
  return {
    headerShown: false,
    cardStyle: { backgroundColor: colors.background, paddingBottom: insets.bottom },
  };
}

function AuthNavigator() {
  const screenOptions = useStackScreenOptions();
  return (
    <AuthStack.Navigator screenOptions={screenOptions}>
      <AuthStack.Screen name="Splash" component={SplashScreen} />
      <AuthStack.Screen name="Onboarding" component={OnboardingScreen} />
      <AuthStack.Screen name="Login" component={LoginScreen} />
      <AuthStack.Screen name="Register" component={RegisterScreen} />
    </AuthStack.Navigator>
  );
}

function MainNavigator() {
  const screenOptions = useStackScreenOptions();
  return (
    <RootStack.Navigator screenOptions={screenOptions}>
      {/* 탭바가 직접 하단 여백을 처리하므로 여기선 빼야 두 번 띄워지지 않는다. */}
      <RootStack.Screen
        name="MainTabs"
        component={MainTabs}
        options={{ cardStyle: { ...screenOptions.cardStyle, paddingBottom: 0 } }}
      />
      <RootStack.Screen name="BrushConnect" component={BrushConnectScreen} />
      <RootStack.Screen name="Scanning" component={ScanningScreen} />
      <RootStack.Screen name="Report" component={ReportScreen} />
      <RootStack.Screen name="PetProfile" component={PetProfileScreen} />
      <RootStack.Screen name="Settings" component={SettingsScreen} />
    </RootStack.Navigator>
  );
}

export default function AppNavigator() {
  const { user, isInitialized } = useAuthStore();

  if (!isInitialized) return null;

  return (
    <NavigationContainer>
      {user ? <MainNavigator /> : <AuthNavigator />}
    </NavigationContainer>
  );
}
