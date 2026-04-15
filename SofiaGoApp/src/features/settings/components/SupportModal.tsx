import React, { useState } from 'react';
import { ActivityIndicator, Modal, Platform, Pressable, ScrollView, StatusBar, StyleSheet, Text, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import type { OneTimeId, SubscriptionId } from '../../../services/billing';

interface Props {
    visible: boolean;
    onClose: () => void;
    onBuyOneTime: (productId: OneTimeId) => Promise<boolean>;
    onBuySubscription: (subscriptionId: SubscriptionId) => Promise<boolean>;
}

const SUBSCRIPTIONS: Array<{ id: SubscriptionId; price: string; label: string }> = [
    { id: 'monthly_399', price: '3.99 Eur', label: 'Месечна подкрепа' },
    { id: 'monthly_799', price: '7.99 Eur', label: 'Месечна подкрепа+' },
];

const ONE_TIME: Array<{ id: OneTimeId; price: string; label: string }> = [
    { id: 'support_once_599', price: '5.99 Eur', label: 'Еднократна подкрепа' },
    { id: 'support_once_1099', price: '10.99 Eur', label: 'Голяма подкрепа' },
];

export const SupportModal: React.FC<Props> = ({
    visible,
    onClose,
    onBuyOneTime,
    onBuySubscription,
}) => {
    const { height } = useWindowDimensions();
    const overlayTopPadding = Platform.OS === 'android' ? (StatusBar.currentHeight ?? 56) + 22 : 78;
    const overlayBottomPadding = Math.min(Math.max(height * 0.08, 32), 80);
    const cardMaxHeight = Math.min(Math.max(height * 0.65, 380), 520);

    const [loadingId, setLoadingId] = useState<string | null>(null);

    const handleSubscription = async (id: SubscriptionId) => {
        setLoadingId(id);
        try {
            await onBuySubscription(id);
        } finally {
            setLoadingId(null);
        }
    };

    const handleOneTime = async (id: OneTimeId) => {
        setLoadingId(id);
        try {
            await onBuyOneTime(id);
        } finally {
            setLoadingId(null);
        }
    };

    return (
        <Modal animationType="fade" transparent visible={visible} onRequestClose={onClose} statusBarTranslucent>
            <View style={[styles.overlay, { paddingTop: overlayTopPadding, paddingBottom: overlayBottomPadding }]}>
                <Pressable style={styles.backdrop} onPress={onClose} />
                <View style={[styles.card, { maxHeight: cardMaxHeight }]}>
                    <View style={styles.header}>
                        <Text style={styles.title}>Подкрепи SofiaNow</Text>
                        <Pressable onPress={onClose} style={styles.closeButton}>
                            <Ionicons name="close" size={16} color="#334155" />
                        </Pressable>
                    </View>

                    <ScrollView style={styles.scrollArea} showsVerticalScrollIndicator={false}>
                        <Text style={styles.sectionLabel}>Стани поддръжник</Text>
                        <Text style={styles.sectionHint}>Месечна подкрепа чрез Google Play</Text>
                        {SUBSCRIPTIONS.map((item) => (
                            <TouchableOpacity
                                key={item.id}
                                activeOpacity={0.8}
                                disabled={loadingId !== null}
                                onPress={() => handleSubscription(item.id)}
                                style={[styles.optionRow, loadingId === item.id && styles.optionRowActive]}
                            >
                                <View style={styles.optionInfo}>
                                    <Ionicons name="heart-outline" size={16} color="#1D4ED8" />
                                    <View style={styles.optionText}>
                                        <Text style={styles.optionLabel}>{item.label}</Text>
                                        <Text style={styles.optionPrice}>{item.price}/месец</Text>
                                    </View>
                                </View>
                                {loadingId === item.id ? (
                                    <ActivityIndicator size="small" color="#1D4ED8" />
                                ) : (
                                    <Ionicons name="chevron-forward" size={16} color="#94A3B8" />
                                )}
                            </TouchableOpacity>
                        ))}

                        <Text style={[styles.sectionLabel, { marginTop: 16 }]}>Еднократно</Text>
                        <Text style={styles.sectionHint}>Еднократна подкрепа чрез Google Play</Text>
                        {ONE_TIME.map((item) => (
                            <TouchableOpacity
                                key={item.id}
                                activeOpacity={0.8}
                                disabled={loadingId !== null}
                                onPress={() => handleOneTime(item.id)}
                                style={[styles.optionRow, loadingId === item.id && styles.optionRowActive]}
                            >
                                <View style={styles.optionInfo}>
                                    <Ionicons name="heart-outline" size={16} color="#059669" />
                                    <View style={styles.optionText}>
                                        <Text style={styles.optionLabel}>{item.label}</Text>
                                        <Text style={styles.optionPrice}>{item.price}</Text>
                                    </View>
                                </View>
                                {loadingId === item.id ? (
                                    <ActivityIndicator size="small" color="#059669" />
                                ) : (
                                    <Ionicons name="chevron-forward" size={16} color="#94A3B8" />
                                )}
                            </TouchableOpacity>
                        ))}
                    </ScrollView>
                </View>
            </View>
        </Modal>
    );
};

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        justifyContent: 'flex-start',
        paddingHorizontal: 12,
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
        gap: 10,
    },
    title: {
        fontSize: 16,
        fontWeight: '700',
        color: '#0F172A',
        flex: 1,
        minWidth: 0,
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
        flexShrink: 0,
    },
    scrollArea: {
        flexGrow: 0,
    },
    sectionLabel: {
        fontSize: 13,
        fontWeight: '700',
        color: '#0F172A',
        marginBottom: 2,
    },
    sectionHint: {
        fontSize: 11,
        color: '#64748B',
        fontWeight: '600',
        marginBottom: 8,
    },
    optionRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: 'rgba(248,250,252,0.72)',
        borderRadius: 14,
        paddingHorizontal: 12,
        paddingVertical: 12,
        borderWidth: 1,
        borderColor: 'rgba(226,232,240,0.72)',
        marginBottom: 8,
    },
    optionRowActive: {
        borderColor: '#1D4ED8',
        backgroundColor: 'rgba(29,78,216,0.06)',
    },
    optionInfo: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        flex: 1,
    },
    optionText: {
        flex: 1,
    },
    optionLabel: {
        fontSize: 13,
        fontWeight: '700',
        color: '#0F172A',
    },
    optionPrice: {
        marginTop: 2,
        fontSize: 12,
        color: '#475569',
        fontWeight: '600',
    },
});
