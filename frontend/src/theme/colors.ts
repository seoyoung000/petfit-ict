// 테마 무관 고정 색상 (배경, 텍스트, 보더, 시스템 색)
export const baseColors = {
  // Severity (고정 — 의료적 의미 변하면 안 됨)
  normal: '#5BAD4E',
  minor: '#F7C948',
  warning: '#F2A65A',
  critical: '#EF5350',

  // Neutral
  background: '#F5F7F2',
  card: '#FFFFFF',
  border: '#E8EDDF',
  divider: '#F0F0F0',

  // Text
  text: '#2C3E25',
  textSecondary: '#7A8C72',
  textLight: '#AABBA3',
  textWhite: '#FFFFFF',

  // State
  success: '#5BAD4E',
  error: '#EF5350',
  info: '#42A5F5',

  // Misc
  black: '#000000',
  white: '#FFFFFF',
  transparent: 'transparent',
} as const;

// 테마별 브랜드 컬러
export type ThemeName = 'green' | 'pink' | 'yellow';

export const themes: Record<ThemeName, {
  primary: string;
  primaryLight: string;
  primaryDark: string;
  lavender: string;
  lavenderLight: string;
  warm: string;
}> = {
  green: {
    primary: '#5BAD4E',
    primaryLight: '#A8D5A2',
    primaryDark: '#3D8A33',
    lavender: '#C8B8E8',
    lavenderLight: '#E8E0F5',
    warm: '#F2A65A',
  },
  pink: {
    primary: '#F2A5B8',
    primaryLight: '#FBD3DE',
    primaryDark: '#D17A93',
    lavender: '#E8B8C8',
    lavenderLight: '#F5E0E8',
    warm: '#F2C5A5',
  },
  yellow: {
    primary: '#F2D24E',
    primaryLight: '#FBE89A',
    primaryDark: '#D1AE2D',
    lavender: '#E8DCB8',
    lavenderLight: '#F5EFE0',
    warm: '#F2A65A',
  },
};

export const themeLabels: Record<ThemeName, string> = {
  green: '초록',
  pink: '핑크',
  yellow: '노랑',
};

// 기본 colors (테마 = green) — 호환성 유지용
// 새 코드는 useTheme()을 사용하세요
export const colors = {
  ...baseColors,
  ...themes.green,
} as const;

export type Color = keyof typeof colors;
export type AppColors = typeof colors;
