import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors } from '../../src/constants/Colors';

export default function BrainScreen() {
    return (
        <View style={styles.container}>
            <Text style={styles.text}>Brain View</Text>
            <Text style={styles.subtext}>Structured facts and entities will appear here.</Text>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: Colors.background,
        justifyContent: 'center',
        alignItems: 'center'
    },
    text: {
        fontSize: 24,
        fontWeight: 'bold'
    },
    subtext: {
        marginTop: 8,
        color: Colors.secondaryText
    }
});
