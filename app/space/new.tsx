import React, { useState } from 'react';
import { View, Text, TextInput, StyleSheet, TouchableOpacity, KeyboardAvoidingView, Platform } from 'react-native';
import { useRouter, Stack } from 'expo-router';
import { SpaceRepo } from '../../src/repositories/space_repo';
import { FeedRepo } from '../../src/repositories/feed_repo';
import { Colors } from '../../src/constants/Colors';

export default function NewSpaceScreen() {
    const [name, setName] = useState('');
    const router = useRouter();
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleCreate = async () => {
        if (!name.trim()) return;
        setIsSubmitting(true);
        setError(null);
        try {
            const id = await SpaceRepo.create(name.trim());
            await FeedRepo.create(id, 'space_created', id);
            router.back();
        } catch (e) {
            console.error(e);
            setError('Could not create this space. Please try again.');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <KeyboardAvoidingView
            style={styles.container}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
            <Stack.Screen options={{ title: 'New Space', presentation: 'modal' }} />

            <View style={styles.content}>
                <Text style={styles.label}>Space Name</Text>
                <TextInput
                    style={styles.input}
                    value={name}
                    onChangeText={setName}
                    placeholder="e.g., Work, Personal, Project X"
                    autoFocus
                />
                {!!error && <Text style={styles.errorText}>{error}</Text>}

                <TouchableOpacity
                    style={[styles.button, !name.trim() && styles.buttonDisabled]}
                    onPress={handleCreate}
                    disabled={!name.trim() || isSubmitting}
                >
                    <Text style={styles.buttonText}>{isSubmitting ? 'Creating…' : 'Create Space'}</Text>
                </TouchableOpacity>
            </View>
        </KeyboardAvoidingView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: Colors.background,
    },
    content: {
        padding: 20,
    },
    label: {
        fontSize: 16,
        fontWeight: '600',
        marginBottom: 8,
        color: Colors.text
    },
    input: {
        backgroundColor: Colors.card,
        padding: 16,
        borderRadius: 12,
        fontSize: 18,
        borderWidth: 1,
        borderColor: Colors.border,
        marginBottom: 24
    },
    button: {
        backgroundColor: Colors.primary,
        padding: 16,
        borderRadius: 12,
        alignItems: 'center',
    },
    buttonDisabled: {
        opacity: 0.5
    },
    buttonText: {
        color: 'white',
        fontSize: 16,
        fontWeight: '600'
    },
    errorText: {
        marginBottom: 12,
        color: Colors.notification,
        fontSize: 13
    }
});
