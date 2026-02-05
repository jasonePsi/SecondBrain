import React, { useState } from 'react';
import { View, Text, StyleSheet, Button, ProgressBarAndroid, ActivityIndicator } from 'react-native';
import { Colors } from '../../src/constants/Colors';
import { ModelManager } from '../../src/services/ModelManager';

const MODEL_URL = 'https://huggingface.co/bartowski/Llama-3.2-1B-Instruct-GGUF/resolve/main/Llama-3.2-1B-Instruct-Q4_K_M.gguf';
const MODEL_FILENAME = 'Llama-3.2-1B-Instruct-Q4_K_M.gguf';

export default function SettingsScreen() {
    const [downloading, setDownloading] = useState(false);
    const [progress, setProgress] = useState(0);
    const [message, setMessage] = useState('');

    const handleDownload = async () => {
        try {
            if (await ModelManager.exists(MODEL_FILENAME)) {
                setMessage('Model already exists!');
                return;
            }

            setDownloading(true);
            await ModelManager.download(MODEL_URL, MODEL_FILENAME, (p) => {
                setProgress(p);
            });
            setMessage('Download Complete!');
        } catch (e) {
            setMessage('Download Failed: ' + e);
        } finally {
            setDownloading(false);
        }
    };

    return (
        <View style={styles.container}>
            <Text style={styles.header}>Settings</Text>
            <View style={styles.section}>
                <Text style={styles.sectionHeader}>Model Management</Text>
                <Text style={styles.text}>Model: Llama 3.2 1B (Default)</Text>

                <View style={{ marginTop: 10 }}>
                    {downloading ? (
                        <View>
                            <Text>Downloading... {(progress * 100).toFixed(1)}%</Text>
                            {/* ProgressBarAndroid is android only, use simple text for MVP cross plat support or ActivityIndicator */}
                            <ActivityIndicator size="small" color={Colors.primary} />
                        </View>
                    ) : (
                        <Button title="Download Model" onPress={handleDownload} />
                    )}
                </View>
                {message ? <Text style={{ marginTop: 10, color: 'blue' }}>{message}</Text> : null}
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: Colors.background,
        padding: 16
    },
    header: {
        fontSize: 24,
        fontWeight: 'bold',
        marginBottom: 20
    },
    section: {
        backgroundColor: Colors.card,
        padding: 16,
        borderRadius: 8
    },
    sectionHeader: {
        fontSize: 16,
        fontWeight: '600',
        marginBottom: 8
    },
    text: {
        marginBottom: 10
    }
});
