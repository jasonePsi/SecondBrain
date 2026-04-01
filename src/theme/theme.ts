import { Appearance, ColorSchemeName, useColorScheme } from 'react-native';

export type AppThemeScheme = 'light' | 'dark';

export type AppThemeColors = {
    background: {
        base: string;
        grouped: string;
        surface: string;
        elevated: string;
    };
    text: {
        primary: string;
        secondary: string;
        tertiary: string;
        inverse: string;
    };
    separator: {
        subtle: string;
        strong: string;
    };
    tint: {
        primary: string;
        secondary: string;
    };
    status: {
        info: string;
        success: string;
        warning: string;
        error: string;
    };
    destructive: {
        primary: string;
        softBackground: string;
    };
    overlay: {
        scrim: string;
        material: string;
    };
    interactive: {
        disabled: string;
        pressed: string;
    };
};

export type AppTheme = {
    scheme: AppThemeScheme;
    isDark: boolean;
    colors: AppThemeColors;
};

export type LegacyColors = {
    primary: string;
    background: string;
    card: string;
    text: string;
    secondaryText: string;
    textSecondary: string;
    border: string;
    notification: string;
    tint: string;
    tabIconDefault: string;
    tabIconSelected: string;
};

const LIGHT_COLORS: AppThemeColors = {
    background: {
        base: '#F2F2F7',
        grouped: '#EFEFF4',
        surface: '#FFFFFF',
        elevated: '#FFFFFF'
    },
    text: {
        primary: '#111827',
        secondary: '#4B5563',
        tertiary: '#6B7280',
        inverse: '#FFFFFF'
    },
    separator: {
        subtle: '#D1D5DB',
        strong: '#9CA3AF'
    },
    tint: {
        primary: '#0A84FF',
        secondary: '#5AC8FA'
    },
    status: {
        info: '#0A84FF',
        success: '#16A34A',
        warning: '#B45309',
        error: '#DC2626'
    },
    destructive: {
        primary: '#DC2626',
        softBackground: '#FEE2E2'
    },
    overlay: {
        scrim: 'rgba(17, 24, 39, 0.32)',
        material: 'rgba(255, 255, 255, 0.85)'
    },
    interactive: {
        disabled: '#9CA3AF',
        pressed: 'rgba(17, 24, 39, 0.08)'
    }
};

const DARK_COLORS: AppThemeColors = {
    background: {
        base: '#000000',
        grouped: '#0A0A0A',
        surface: '#111827',
        elevated: '#1F2937'
    },
    text: {
        primary: '#F9FAFB',
        secondary: '#D1D5DB',
        tertiary: '#9CA3AF',
        inverse: '#111827'
    },
    separator: {
        subtle: '#374151',
        strong: '#4B5563'
    },
    tint: {
        primary: '#60A5FA',
        secondary: '#93C5FD'
    },
    status: {
        info: '#60A5FA',
        success: '#4ADE80',
        warning: '#F59E0B',
        error: '#F87171'
    },
    destructive: {
        primary: '#F87171',
        softBackground: 'rgba(248, 113, 113, 0.2)'
    },
    overlay: {
        scrim: 'rgba(0, 0, 0, 0.5)',
        material: 'rgba(17, 24, 39, 0.84)'
    },
    interactive: {
        disabled: '#6B7280',
        pressed: 'rgba(255, 255, 255, 0.1)'
    }
};

const normalizeScheme = (scheme?: ColorSchemeName | null): AppThemeScheme => {
    return scheme === 'dark' ? 'dark' : 'light';
};

export const getTheme = (scheme?: ColorSchemeName | null): AppTheme => {
    const normalized = normalizeScheme(scheme);
    return {
        scheme: normalized,
        isDark: normalized === 'dark',
        colors: normalized === 'dark' ? DARK_COLORS : LIGHT_COLORS
    };
};

export const getSystemTheme = (): AppTheme => {
    return getTheme(Appearance.getColorScheme());
};

export const useAppTheme = (): AppTheme => {
    const scheme = useColorScheme();
    return getTheme(scheme);
};

export const toLegacyColors = (theme: AppTheme): LegacyColors => {
    return {
        primary: theme.colors.tint.primary,
        background: theme.colors.background.base,
        card: theme.colors.background.surface,
        text: theme.colors.text.primary,
        secondaryText: theme.colors.text.tertiary,
        textSecondary: theme.colors.text.tertiary,
        border: theme.colors.separator.subtle,
        notification: theme.colors.status.error,
        tint: theme.colors.tint.primary,
        tabIconDefault: theme.colors.text.tertiary,
        tabIconSelected: theme.colors.tint.primary
    };
};
