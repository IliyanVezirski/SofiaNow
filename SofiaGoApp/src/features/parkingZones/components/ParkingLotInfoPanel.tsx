import React from 'react';
import { Linking, Modal, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { ParkingLot, ParkingLotCategory } from '../types/parkingLots';
import type { LiveParkingLot } from '../../../services/parkingApi';
import { openExternalDrivingNavigation } from '../../../services/externalNavigation';

const CATEGORY_META: Record<ParkingLotCategory, { label: string; icon: string; color: string }> = {
    buffer:         { label: 'Буферен паркинг',     icon: 'train-outline',               color: '#0D9488' },
    underground:    { label: 'Подземен паркинг',     icon: 'arrow-down-circle-outline',   color: '#6366F1' },
    'multi-storey': { label: 'Многоетажен паркинг',  icon: 'business-outline',            color: '#8B5CF6' },
    airport:        { label: 'Летищен паркинг',      icon: 'airplane-outline',            color: '#0EA5E9' },
    surface:        { label: 'Открит паркинг',       icon: 'car-outline',                 color: '#F59E0B' },
    commercial:     { label: 'Търговски паркинг',    icon: 'storefront-outline',          color: '#EC4899' },
    impound:        { label: 'Наказателен паркинг',  icon: 'warning-outline',             color: '#EF4444' },
    private:        { label: 'Частен паркинг',       icon: 'lock-closed-outline',         color: '#6B7280' },
};

interface Props {
    lot: ParkingLot;
    liveData?: LiveParkingLot | null;
    onClose: () => void;
}

export const ParkingLotInfoPanel: React.FC<Props> = ({ lot, liveData, onClose }) => {
    const meta = CATEGORY_META[lot.category];
    const hasLive = liveData != null && liveData.spaces != null;

    const openDirections = () => {
        void openExternalDrivingNavigation(lot.latitude, lot.longitude);
    };

    return (
        <Modal transparent animationType="fade" visible onRequestClose={onClose} statusBarTranslucent>
            <View style={styles.modalRoot}>
                <Pressable style={styles.backdrop} onPress={onClose} />
                <View style={styles.panel}>
                    {/* Header */}
                    <View style={styles.header}>
                        <View style={[styles.categoryBadge, { backgroundColor: meta.color }]}>
                            <Ionicons name={meta.icon as any} size={15} color="#FFF" />
                        </View>
                        <Text allowFontScaling={false} maxFontSizeMultiplier={1} style={styles.title} numberOfLines={1}>{lot.name}</Text>
                        <Pressable style={styles.closeBtn} onPress={onClose}>
                            <Ionicons name="close" size={18} color="#334155" />
                        </Pressable>
                    </View>

                    <ScrollView style={styles.scroll} nestedScrollEnabled>
                        {/* Category subtitle */}
                        <Text allowFontScaling={false} maxFontSizeMultiplier={1} style={styles.info}>{meta.label}</Text>

                        {/* Live availability */}
                        {hasLive && (
                            <View style={styles.liveCard}>
                                <View style={styles.liveRow}>
                                    <View style={styles.liveDot} />
                                    <Text allowFontScaling={false} maxFontSizeMultiplier={1} style={styles.liveLabel}>Свободни места</Text>
                                </View>
                                <Text allowFontScaling={false} maxFontSizeMultiplier={1} style={styles.liveCount}>{liveData!.spaces}</Text>
                            </View>
                        )}

                        {/* Details chips */}
                        {(lot.capacity != null || lot.fee || lot.parkRide || lot.maxheight != null || lot.surface) && (
                            <View style={styles.detailCard}>
                                {lot.capacity != null && (
                                    <View style={styles.detailRow}>
                                        <Ionicons name="car-outline" size={13} color="#475569" />
                                        <Text allowFontScaling={false} maxFontSizeMultiplier={1} style={styles.detailText}>Капацитет: {lot.capacity}</Text>
                                    </View>
                                )}
                                {lot.fee && (
                                    <View style={styles.detailRow}>
                                        <Ionicons name="card-outline" size={13} color="#475569" />
                                        <Text allowFontScaling={false} maxFontSizeMultiplier={1} style={styles.detailText}>Платен</Text>
                                    </View>
                                )}
                                {lot.parkRide && (
                                    <View style={styles.detailRow}>
                                        <Ionicons name="train-outline" size={13} color="#0D9488" />
                                        <Text allowFontScaling={false} maxFontSizeMultiplier={1} style={[styles.detailText, { color: '#0D9488' }]}>Park & Ride</Text>
                                    </View>
                                )}
                                {lot.maxheight != null && (
                                    <View style={styles.detailRow}>
                                        <Ionicons name="resize-outline" size={13} color="#475569" />
                                        <Text allowFontScaling={false} maxFontSizeMultiplier={1} style={styles.detailText}>Макс. височ.: {lot.maxheight} м</Text>
                                    </View>
                                )}
                                {lot.surface && (
                                    <View style={styles.detailRow}>
                                        <Ionicons name="layers-outline" size={13} color="#475569" />
                                        <Text allowFontScaling={false} maxFontSizeMultiplier={1} style={styles.detailText}>{lot.surface}</Text>
                                    </View>
                                )}
                            </View>
                        )}

                        {/* Meta: operator, hours */}
                        {(lot.operator || lot.openingHours) && (
                            <View style={styles.detailCard}>
                                {lot.operator && (
                                    <View style={styles.detailRow}>
                                        <Ionicons name="business-outline" size={13} color="#64748B" />
                                        <Text allowFontScaling={false} maxFontSizeMultiplier={1} style={styles.detailText}>{lot.operator}</Text>
                                    </View>
                                )}
                                {lot.openingHours && (
                                    <View style={styles.detailRow}>
                                        <Ionicons name="time-outline" size={13} color="#64748B" />
                                        <Text allowFontScaling={false} maxFontSizeMultiplier={1} style={styles.detailText}>{lot.openingHours}</Text>
                                    </View>
                                )}
                            </View>
                        )}
                    </ScrollView>

                    {/* Footer actions – same style as stop panel */}
                    <View style={styles.footerActions}>
                        <TouchableOpacity style={styles.navBtn} onPress={openDirections}>
                            <Ionicons name="navigate-outline" size={14} color="#FFFFFF" style={{ marginRight: 4 }} />
                            <Text allowFontScaling={false} maxFontSizeMultiplier={1} style={styles.navBtnText}>Навигирай</Text>
                        </TouchableOpacity>
                        {lot.phone && (
                            <TouchableOpacity
                                style={styles.secondaryBtn}
                                onPress={() => Linking.openURL(`tel:${lot.phone}`).catch(() => {})}
                            >
                                <Ionicons name="call-outline" size={14} color="#1D4ED8" />
                            </TouchableOpacity>
                        )}
                        {lot.website && (
                            <TouchableOpacity
                                style={styles.secondaryBtn}
                                onPress={() => Linking.openURL(lot.website!).catch(() => {})}
                            >
                                <Ionicons name="globe-outline" size={14} color="#1D4ED8" />
                            </TouchableOpacity>
                        )}
                    </View>
                </View>
            </View>
        </Modal>
    );
};

const styles = StyleSheet.create({
    modalRoot: {
        flex: 1,
        justifyContent: 'flex-end',
    },
    backdrop: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(15,23,42,0.18)',
    },
    panel: {
        marginBottom: 188,
        marginHorizontal: 16,
        maxHeight: 280,
        backgroundColor: 'rgba(255,255,255,0.82)',
        borderRadius: 24,
        padding: 14,
        zIndex: 25,
        elevation: 25,
        shadowColor: '#0F172A',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.12,
        shadowRadius: 28,
        borderWidth: 1,
        borderColor: 'rgba(226,232,240,0.72)',
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 6,
        gap: 4,
    },
    categoryBadge: {
        width: 28,
        height: 28,
        borderRadius: 14,
        alignItems: 'center',
        justifyContent: 'center',
    },
    title: {
        flex: 1,
        minWidth: 0,
        fontSize: 16,
        fontWeight: '700',
        color: '#0F172A',
    },
    closeBtn: {
        width: 34,
        height: 34,
        borderRadius: 17,
        backgroundColor: 'rgba(248,250,252,0.72)',
        borderWidth: 1,
        borderColor: 'rgba(226,232,240,0.72)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    scroll: {
        maxHeight: 150,
    },
    info: {
        fontSize: 12,
        color: '#475569',
        marginBottom: 8,
        lineHeight: 18,
    },
    liveCard: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(248,250,252,0.72)',
        borderRadius: 12,
        paddingHorizontal: 10,
        paddingVertical: 8,
        marginBottom: 8,
        borderWidth: 1,
        borderColor: 'rgba(16,185,129,0.24)',
    },
    liveRow: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    liveDot: {
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: '#10B981',
    },
    liveLabel: {
        fontSize: 13,
        fontWeight: '600',
        color: '#064E3B',
    },
    liveCount: {
        fontSize: 15,
        fontWeight: '800',
        color: '#059669',
    },
    detailCard: {
        backgroundColor: 'rgba(248,250,252,0.72)',
        borderRadius: 12,
        paddingHorizontal: 10,
        paddingVertical: 8,
        marginBottom: 8,
        borderWidth: 1,
        borderColor: 'rgba(226,232,240,0.72)',
        gap: 4,
    },
    detailRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    detailText: {
        fontSize: 12,
        color: '#475569',
        fontWeight: '600',
        lineHeight: 17,
    },
    footerActions: {
        marginTop: 8,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
    },
    navBtn: {
        flex: 1,
        flexDirection: 'row',
        backgroundColor: '#1D4ED8',
        borderRadius: 12,
        paddingVertical: 8,
        alignItems: 'center',
        justifyContent: 'center',
    },
    navBtnText: {
        color: '#FFFFFF',
        fontSize: 13,
        fontWeight: '700',
    },
    secondaryBtn: {
        width: 36,
        height: 36,
        borderRadius: 12,
        backgroundColor: 'rgba(239,246,255,0.82)',
        borderWidth: 1,
        borderColor: 'rgba(191,219,254,0.72)',
        alignItems: 'center',
        justifyContent: 'center',
    },
});
