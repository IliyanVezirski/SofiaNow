import React from 'react';
import { Modal, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface Props {
    visible: boolean;
    onClose: () => void;
    onOpenSupport: () => void;
}

export const SupportModal: React.FC<Props> = ({
    visible,
    onClose,
    onOpenSupport,
}) => (
    <Modal animationType="fade" transparent visible={visible} onRequestClose={onClose} statusBarTranslucent>
        <View style={styles.overlay}>
            <Pressable style={styles.backdrop} onPress={onClose} />
            <View style={styles.card}>
                <View style={styles.header}>
                    <Text style={styles.title}>Подкрепа</Text>
                    <Pressable onPress={onClose} style={styles.closeButton}>
                        <Ionicons name="close" size={16} color="#334155" />
                    </Pressable>
                </View>

                <View style={styles.section}>
                    <View style={styles.supportCard}>
                        <View style={styles.supportTitleRow}>
                            <Ionicons name="heart-outline" size={14} color="#1D4ED8" />
                            <Text style={styles.supportTitle}>Подкрепи Sofia Go</Text>
                        </View>
                        <Text style={styles.supportSubtitle}>Твоята подкрепа помага да подобрим приложението и транспортните функции.</Text>
                    </View>

                    <TouchableOpacity
                        activeOpacity={0.88}
                        onPress={onOpenSupport}
                        style={styles.primaryButton}
                    >
                        
                        <Text style={styles.primaryButtonText}>Подкрепи</Text>
                    </TouchableOpacity>
                </View>
            </View>
        </View>
    </Modal>
);

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        justifyContent: 'flex-start',
        paddingTop: 78,
        paddingHorizontal: 12,
        paddingBottom: 80,
    },
    backdrop: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(15,23,42,0.18)',
    },
    card: {
        width: '100%',
        alignSelf: 'center',
        borderRadius: 24,
        overflow: 'hidden',
        backgroundColor: 'rgba(255,255,255,0.82)',
        borderWidth: 1,
        borderColor: 'rgba(226,232,240,0.72)',
        padding: 16,
        shadowColor: '#0F172A',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.12,
        shadowRadius: 28,
        elevation: 10,
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
        backgroundColor: 'rgba(248,250,252,0.68)',
        borderWidth: 1,
        borderColor: 'rgba(226,232,240,0.72)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    section: {
        gap: 12,
    },
    supportCard: {
        backgroundColor: 'rgba(248,250,252,0.72)',
        borderRadius: 16,
        paddingHorizontal: 12,
        paddingVertical: 10,
        borderWidth: 1,
        borderColor: 'rgba(226,232,240,0.72)',
    },
    supportTitleRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    supportTitle: {
        fontSize: 14,
        fontWeight: '700',
        color: '#0F172A',
    },
    supportSubtitle: {
        marginTop: 4,
        fontSize: 12,
        lineHeight: 18,
        color: '#475569',
        fontWeight: '600',
    },
    primaryButton: {
        height: 42,
        borderRadius: 12,
        backgroundColor: '#1D4ED8',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
    },
    primaryButtonText: {
        color: '#FFFFFF',
        fontSize: 13,
        fontWeight: '800',
    },
});
