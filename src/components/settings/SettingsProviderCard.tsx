import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { AIProviderStatus, AIProviderType } from '../../services/ai/types';
import { useAppTheme } from '../../theme/theme';
import { AppButton, GroupedSection, InlineBanner, StatusChip } from '../ui';

type SettingsProviderCardProps = {
    provider: AIProviderType;
    name: string;
    description: string;
    privacyHint?: string;
    status?: AIProviderStatus;
    badgeLabel: string;
    badgeTone: 'success' | 'warning' | 'error' | 'neutral';
    statusMessage?: string | null;
    statusMessageTone?: 'info' | 'warning';
    checkedAtLabel?: string | null;
    showSwitchAction: boolean;
    switchLabel: string;
    switchDisabled: boolean;
    switchLoading: boolean;
    onSwitch: () => void;
    onRefresh: () => void;
};

const providerIconName = (
    provider: AIProviderType
): React.ComponentProps<typeof Ionicons>['name'] => {
    return provider === 'cloud' ? 'cloud-outline' : 'phone-portrait-outline';
};

export function SettingsProviderCard({
    provider,
    name,
    description,
    privacyHint,
    status,
    badgeLabel,
    badgeTone,
    statusMessage,
    statusMessageTone = 'warning',
    checkedAtLabel,
    showSwitchAction,
    switchLabel,
    switchDisabled,
    switchLoading,
    onSwitch,
    onRefresh
}: SettingsProviderCardProps) {
    const theme = useAppTheme();

    return (
        <GroupedSection style={styles.providerCard}>
            <View style={styles.providerTopRow}>
                <View style={styles.providerTitleRow}>
                    <Ionicons
                        name={providerIconName(provider)}
                        size={18}
                        color={theme.colors.tint.primary}
                    />
                    <Text style={[styles.providerName, { color: theme.colors.text.primary }]}>
                        {name}
                    </Text>
                </View>
                <StatusChip
                    label={badgeLabel}
                    tone={badgeTone}
                />
            </View>

            <Text style={[styles.providerDescription, { color: theme.colors.text.secondary }]}>
                {description}
            </Text>

            {!!privacyHint && (
                <Text style={[styles.providerHint, { color: theme.colors.text.tertiary }]}>
                    {privacyHint}
                </Text>
            )}

            {!status && (
                <InlineBanner
                    tone="warning"
                    message="Provider status unavailable. Refresh to re-check."
                    actionLabel="Refresh"
                    onActionPress={onRefresh}
                />
            )}

            {!!status && !!statusMessage && (
                <InlineBanner
                    tone={statusMessageTone}
                    message={statusMessage}
                />
            )}

            {!!checkedAtLabel && (
                <Text style={[styles.checkedText, { color: theme.colors.text.tertiary }]}>
                    Last checked {checkedAtLabel}
                </Text>
            )}

            {showSwitchAction && (
                <View style={styles.providerActions}>
                    <AppButton
                        label={switchLabel}
                        onPress={onSwitch}
                        disabled={switchDisabled}
                        loading={switchLoading}
                    />
                </View>
            )}
        </GroupedSection>
    );
}

const styles = StyleSheet.create({
    providerCard: {
        paddingHorizontal: 12,
        paddingVertical: 12,
        marginBottom: 10
    },
    providerTopRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 10
    },
    providerTitleRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        flex: 1
    },
    providerName: {
        fontSize: 16,
        fontWeight: '700'
    },
    providerDescription: {
        marginTop: 6,
        fontSize: 13
    },
    providerHint: {
        marginTop: 4,
        fontSize: 12
    },
    checkedText: {
        marginTop: 8,
        fontSize: 11
    },
    providerActions: {
        marginTop: 10
    }
});
