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
import { AppButton, InlineBanner, ScreenScaffold, SectionHeader } from '../../src/components/ui';

export default function NewSpaceScreen() {
    const theme = useAppTheme();
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
            router.replace(`/space/${id}`);
        } catch (createError) {
            console.error(createError);
            setError('Could not create this space. Please try again.');
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
                    subtitle="Name a workspace for a domain of conversations."
                />

                <View
                    style={[
                        styles.formCard,
                        {
                            backgroundColor: theme.colors.background.surface,
                            borderColor: theme.colors.separator.subtle
                        }
                    ]}
                >
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
                </View>

                <AppButton
                    label={isSubmitting ? 'Creating space…' : 'Create Space'}
                    onPress={handleCreate}
                    disabled={!name.trim() || isSubmitting}
                    loading={isSubmitting}
                />
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
        borderWidth: 1,
        borderRadius: 14,
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
    }
});
