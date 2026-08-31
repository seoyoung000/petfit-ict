import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';
import { User } from '@/types';
import { authAPI } from '@/services/api';

interface AuthState {
  user: User | null;
  isLoading: boolean;
  isInitialized: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name: string) => Promise<void>;
  loginAsGuest: () => void;
  logout: () => Promise<void>;
  initialize: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isLoading: false,
  isInitialized: false,

  initialize: async () => {
    const token = await SecureStore.getItemAsync('access_token');
    if (token) {
      try {
        const { data } = await authAPI.me();
        set({ user: data });
      } catch {
        await SecureStore.deleteItemAsync('access_token');
      }
    }
    set({ isInitialized: true });
  },

  login: async (email, password) => {
    set({ isLoading: true });
    try {
      const { data } = await authAPI.login(email, password);
      await SecureStore.setItemAsync('access_token', data.access_token);
      set({ user: data.user });
    } finally {
      set({ isLoading: false });
    }
  },

  register: async (email, password, name) => {
    set({ isLoading: true });
    try {
      const { data } = await authAPI.register(email, password, name);
      await SecureStore.setItemAsync('access_token', data.access_token);
      set({ user: data.user });
    } finally {
      set({ isLoading: false });
    }
  },

  loginAsGuest: () => {
    set({
      user: {
        id: 'guest',
        email: 'guest@petfit.local',
        name: '게스트',
        is_active: true,
        created_at: new Date().toISOString(),
      },
    });
  },

  logout: async () => {
    await SecureStore.deleteItemAsync('access_token');
    set({ user: null });
  },
}));
