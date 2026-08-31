import { useMemo } from 'react';
import { useThemeStore } from '@/store/useThemeStore';
import { baseColors, themes, AppColors } from './colors';

/**
 * 현재 활성 테마의 컬러 객체를 반환합니다.
 * 테마가 바뀌면 새 객체 참조가 반환되어 useMemo 의존성으로 사용할 수 있습니다.
 */
export function useTheme(): AppColors {
  const themeName = useThemeStore((s) => s.themeName);
  return useMemo(
    () => ({ ...baseColors, ...themes[themeName] }) as AppColors,
    [themeName],
  );
}
