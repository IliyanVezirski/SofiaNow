import React from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface Props {
    visible: boolean;
    onClose: () => void;
}

export const SettingsModal: React.FC<Props> = ({ visible, onClose }) => (
    <Modal animationType="fade" transparent visible={visible} onRequestClose={onClose} statusBarTranslucent>
        <View style={styles.overlay}>
            <Pressable style={styles.backdrop} onPress={onClose} />
            <View style={styles.card}>
                <View style={styles.header}>
                    <Text style={styles.title}>Настройки</Text>
                    <Pressable onPress={onClose} style={styles.closeButton}>
                        <Ionicons name="close" size={16} color="#334155" />
                    </Pressable>
                </View>

                <Text style={styles.placeholder}>Скоро тук ще има настройки.</Text>
            </View>
        </View>
    </Modal>
);

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        justifyContent: 'flex-end',
    },
    backdrop: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(15,23,42,0.18)',
    },
    card: {
        marginBottom: 188,
        marginHorizontal: 12,
        backgroundColor: '#FFFFFF',
        borderRadius: 22,
        padding: 14,
        shadowColor: '#0F172A',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.08,
        shadowRadius: 24,
        elevation: 12,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 14,
    },
    title: {
        fontSize: 16,
        fontWeight: '700',
        color: '#0F172A',
    },
    closeButton: {
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: 'rgba(248,250,252,0.72)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    placeholder: {
        fontSize: 13,
        color: '#94A3B8',
        textAlign: 'center',
        paddingVertical: 24,
    },
});
