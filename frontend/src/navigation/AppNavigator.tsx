import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
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
  Scanning: undefined;
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
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textLight,
        tabBarStyle: {
          backgroundColor: colors.card,
          borderTopColor: colors.border,
          paddingBottom: 6,
          height: 60,
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

function AuthNavigator() {
  return (
    <AuthStack.Navigator screenOptions={{ headerShown: false }}>
      <AuthStack.Screen name="Splash" component={SplashScreen} />
      <AuthStack.Screen name="Onboarding" component={OnboardingScreen} />
      <AuthStack.Screen name="Login" component={LoginScreen} />
      <AuthStack.Screen name="Register" component={RegisterScreen} />
    </AuthStack.Navigator>
  );
}

function MainNavigator() {
  return (
    <RootStack.Navigator screenOptions={{ headerShown: false }}>
      <RootStack.Screen name="MainTabs" component={MainTabs} />
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
