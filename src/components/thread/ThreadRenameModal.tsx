import React from 'react';
import {
    KeyboardAvoidingView,
    Modal,
    Platform,
    StyleSheet,
    Text,
    TextInput,
    View
} from 'react-native';
import { useAppTheme } from '../../theme/theme';
import { AppButton, GroupedSection } from '../ui';

type ThreadRenameModalProps = {
    visible: boolean;
    reducedMotion: boolean;
    value: string;
    saving: boolean;
    onChangeText: (value: string) => void;
    onClose: () => void;
    onSave: () => void;
};

export function ThreadRenameModal({
    visible,
    reducedMotion,
    value,
    saving,
    onChangeText,
    onClose,
    onSave
}: ThreadRenameModalProps) {
    const theme = useAppTheme();

    return (
        <Modal
            transparent
            visible={visible}
            animationType={reducedMotion ? 'none' : 'fade'}
            onRequestClose={onClose}
        >
            <View style={[styles.overlay, { backgroundColor: theme.colors.overlay.scrim }]}> 
                <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
                    <GroupedSection style={[styles.card, { backgroundColor: theme.colors.background.surface }]}> 
                        <Text style={[styles.title, { color: theme.colors.text.primary }]}>Rename Thread</Text>
                        <Text style={[styles.subtitle, { color: theme.colors.text.secondary }]}> 
                            Choose a name that is easy to find later in search.
                        </Text>
                        <TextInput
                            style={[
                                styles.input,
                                {
                                    borderColor: theme.colors.separator.subtle,
                                    backgroundColor: theme.colors.background.base,
                                    color: theme.colors.text.primary
                                }
                            ]}
                            value={value}
                            onChangeText={onChangeText}
                            placeholder="Thread name"
                            placeholderTextColor={theme.colors.text.tertiary}
                            autoFocus
                            returnKeyType="done"
                            onSubmitEditing={onSave}
                        />
                        <View style={styles.actions}>
                            <AppButton label="Cancel" variant="secondary" onPress={onClose} />
                            <AppButton
                                label={saving ? 'Saving…' : 'Save'}
                                onPress={onSave}
                                disabled={!value.trim() || saving}
                                loading={saving}
                            />
                        </View>
                    </GroupedSection>
                </KeyboardAvoidingView>
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 24
    },
    card: {
        width: '100%',
        borderRadius: 14,
        padding: 16
    },
    title: {
        fontSize: 17,
        fontWeight: '700',
        marginBottom: 4
    },
    subtitle: {
        fontSize: 13,
        marginBottom: 10
    },
    input: {
        borderWidth: 1,
        borderRadius: 10,
        padding: 12,
        fontSize: 16,
        marginBottom: 16
    },
    actions: {
        flexDirection: 'row',
        justifyContent: 'flex-end',
        gap: 8
    }
});
