// 테마 무관 고정 색상 (배경, 텍스트, 보더, 시스템 색)
export const baseColors = {
  // Severity — 정상→경미→주의→심각 순서가 구분돼야 함. 메인 컬러와 톤을 맞춘 저채도 색.
  normal: '#A9CC7A',
  minor: '#D4C77E',
  warning: '#D9A877',
  critical: '#CF8A7A',

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
  success: '#A9CC7A',
  error: '#CF8A7A',
  info: '#8FB3A8',

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
    primary: '#A9CC7A',
    primaryLight: '#CBE0AF',
    primaryDark: '#7F995C',
    lavender: '#BFD1A6',
    lavenderLight: '#E6EEDA',
    warm: '#D9A877',
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
