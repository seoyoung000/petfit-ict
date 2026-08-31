import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';
import { ThemeName } from '@/theme/colors';

const STORAGE_KEY = 'theme_name';

interface ThemeState {
  themeName: ThemeName;
  isLoaded: boolean;
  setTheme: (name: ThemeName) => Promise<void>;
  loadTheme: () => Promise<void>;
}

export const useThemeStore = create<ThemeState>((set) => ({
  themeName: 'green',
  isLoaded: false,

  setTheme: async (name) => {
    set({ themeName: name });
    try {
      await SecureStore.setItemAsync(STORAGE_KEY, name);
    } catch {
      // ignore storage errors
    }
  },

  loadTheme: async () => {
    try {
      const saved = await SecureStore.getItemAsync(STORAGE_KEY);
      if (saved === 'green' || saved === 'pink' || saved === 'yellow') {
        set({ themeName: saved, isLoaded: true });
        return;
      }
    } catch {
      // ignore
    }
    set({ isLoaded: true });
  },
}));
