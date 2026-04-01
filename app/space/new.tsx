import React, { useState } from 'react';
import {
    KeyboardAvoidingView,
    Platform,
    StyleSheet,
    Text,
    TextInput,
    View
} from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { FeedRepo } from '../../src/repositories/feed_repo';
import { SpaceRepo } from '../../src/repositories/space_repo';
import { useAppTheme } from '../../src/theme/theme';
import { triggerHaptic, useReducedMotion } from '../../src/services/interaction_feedback';
import { AppButton, GroupedSection, InlineBanner, ScreenScaffold, SectionHeader } from '../../src/components/ui';

export default function NewSpaceScreen() {
    const theme = useAppTheme();
    const reducedMotion = useReducedMotion();
    const [name, setName] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const router = useRouter();

    const handleCreate = async () => {
        if (!name.trim()) return;
        setIsSubmitting(true);
        setError(null);
        try {
            const id = await SpaceRepo.create(name.trim());
            await FeedRepo.create(id, 'space_created', id);
            triggerHaptic('success', reducedMotion);
            router.replace(`/space/${id}`);
        } catch (createError) {
            console.error(createError);
            setError('Could not create this space. Please try again.');
            triggerHaptic('error', reducedMotion);
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <ScreenScaffold edges={['left', 'right', 'bottom']}>
            <Stack.Screen options={{ title: 'New Space', presentation: 'modal' }} />
            <KeyboardAvoidingView
                style={styles.container}
                behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            >
                <SectionHeader
                    title="Create Space"
                    subtitle="Create a calm home for related threads."
                />

                <GroupedSection style={styles.formCard}>
                    <Text style={[styles.label, { color: theme.colors.text.secondary }]}>Space Name</Text>
                    <TextInput
                        style={[
                            styles.input,
                            {
                                backgroundColor: theme.colors.background.base,
                                borderColor: theme.colors.separator.subtle,
                                color: theme.colors.text.primary
                            }
                        ]}
                        value={name}
                        onChangeText={setName}
                        placeholder="e.g. Work, Personal, Project X"
                        placeholderTextColor={theme.colors.text.tertiary}
                        autoFocus
                        returnKeyType="done"
                        onSubmitEditing={handleCreate}
                    />
                    <Text style={[styles.helperText, { color: theme.colors.text.tertiary }]}>
                        You can rename this later.
                    </Text>
                    {!!error && (
                        <InlineBanner tone="error" message={error} />
                    )}
                </GroupedSection>

                <View style={styles.actionsRow}>
                    <AppButton
                        label="Cancel"
                        variant="secondary"
                        onPress={() => {
                            triggerHaptic('selection', reducedMotion);
                            router.back();
                        }}
                        disabled={isSubmitting}
                    />
                    <AppButton
                        label={isSubmitting ? 'Creating space…' : 'Create Space'}
                        onPress={handleCreate}
                        disabled={!name.trim() || isSubmitting}
                        loading={isSubmitting}
                    />
                </View>
            </KeyboardAvoidingView>
        </ScreenScaffold>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        paddingHorizontal: 16,
        paddingTop: 16
    },
    formCard: {
        padding: 14,
        marginBottom: 18
    },
    label: {
        fontSize: 14,
        fontWeight: '600',
        marginBottom: 8
    },
    input: {
        borderWidth: 1,
        borderRadius: 12,
        paddingHorizontal: 12,
        paddingVertical: 12,
        fontSize: 17
    },
    helperText: {
        marginTop: 8,
        fontSize: 12
    },
    actionsRow: {
        flexDirection: 'row',
        gap: 8
    }
});
