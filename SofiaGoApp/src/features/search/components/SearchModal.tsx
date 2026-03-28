import React from 'react';
import { View, Text, Pressable, TextInput, ScrollView, TouchableOpacity, StyleSheet, Platform, StatusBar, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { CentralSearchResult } from '../hooks/useSearch';

interface Props {
    visible: boolean;
    query: string;
    loading: boolean;
    results: CentralSearchResult[];
    placeholder?: string;
    allowSaveFavorite?: boolean;
    onChangeQuery: (q: string) => void;
    onClose: () => void;
    onSelectPlace: (result: CentralSearchResult & { kind: 'place' }) => void;
    onSelectLine: (result: CentralSearchResult & { kind: 'line' }) => void;
    onSelectStop: (result: CentralSearchResult & { kind: 'stop' }) => void;
    onSaveFavorite: (name: string, lat: number, lon: number) => void | Promise<void>;
}

const kindIcon = (kind: string): keyof typeof Ionicons.glyphMap => {
    switch (kind) {
        case 'place': return 'location-outline';
        case 'line': return 'bus-outline';
        case 'stop': return 'flag-outline';
        default: return 'search-outline';
    }
};

export const SearchModal: React.FC<Props> = ({
    visible, query, loading, results, placeholder, allowSaveFavorite = true, onChangeQuery, onClose,
    onSelectPlace, onSelectLine, onSelectStop, onSaveFavorite,
}) => {
    const { height } = useWindowDimensions();

    if (!visible) return null;
    return (
        <View style={[styles.overlay, { paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight ?? 56) + 22 : 78 }]}>
            <Pressable style={styles.backdrop} onPress={onClose} />
            <View style={styles.card}>
                <View style={styles.header}>
                    <Text style={styles.headerTitle}>Търсене</Text>
                    <Pressable onPress={onClose} style={styles.closeButton}>
                        <Ionicons name="close" size={18} color="#334155" />
                    </Pressable>
                </View>
                <TextInput style={styles.input} placeholder={placeholder ?? 'Търси адрес, линия или спирка...'} placeholderTextColor="#94A3B8" value={query} onChangeText={onChangeQuery} />
                {(loading || results.length > 0) && (
                    <ScrollView style={[styles.results, { maxHeight: Math.min(height * 0.42, 360) }]} showsVerticalScrollIndicator nestedScrollEnabled keyboardShouldPersistTaps="handled">
                        {loading && <Text style={styles.status}>Търсене...</Text>}
                        {!loading && results.map((result, idx) => {
                            if (result.kind === 'place') {
                                return (
                                    <View key={`s-${result.kind}-${result.id}-${idx}`} style={styles.resultRow}>
                                        <Ionicons name={kindIcon(result.kind)} size={16} color="#64748B" style={styles.resultIcon} />
                                        <TouchableOpacity style={styles.resultPress} onPress={() => onSelectPlace(result)}>
                                            <Text style={styles.resultTitle} numberOfLines={2}>{result.name}</Text>
                                            <Text style={styles.resultSubtitle} numberOfLines={2}>{result.subtitle}</Text>
                                        </TouchableOpacity>
                                        {allowSaveFavorite && (
                                            <TouchableOpacity hitSlop={8} style={styles.favBtn} onPress={() => { void onSaveFavorite(result.name, result.latitude, result.longitude); }}>
                                                <Ionicons name="star-outline" size={16} color="#1D4ED8" />
                                            </TouchableOpacity>
                                        )}
                                    </View>
                                );
                            }
                            if (result.kind === 'line') {
                                return (
                                    <View key={`s-${result.kind}-${result.id}-${idx}`} style={styles.resultRow}>
                                        <Ionicons name={kindIcon(result.kind)} size={16} color="#64748B" style={styles.resultIcon} />
                                        <TouchableOpacity style={styles.resultPress} onPress={() => onSelectLine(result)}>
                                            <Text style={styles.resultTitle} numberOfLines={2}>{result.name}</Text>
                                            <Text style={styles.resultSubtitle} numberOfLines={2}>{result.subtitle}</Text>
                                        </TouchableOpacity>
                                    </View>
                                );
                            }
                            return (
                                <View key={`s-${result.kind}-${result.id}-${idx}`} style={styles.resultRow}>
                                    <Ionicons name={kindIcon(result.kind)} size={16} color="#64748B" style={styles.resultIcon} />
                                    <TouchableOpacity style={styles.resultPress} onPress={() => onSelectStop(result)}>
                                        <Text style={styles.resultTitle} numberOfLines={2}>{result.name}</Text>
                                        <Text style={styles.resultSubtitle} numberOfLines={2}>{result.subtitle}</Text>
                                    </TouchableOpacity>
                                </View>
                            );
                        })}
                    </ScrollView>
                )}
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    overlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(15,23,42,0.18)', justifyContent: 'flex-start', paddingHorizontal: 12, zIndex: 50 },
    backdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
    card: { backgroundColor: 'rgba(255,255,255,0.82)', borderRadius: 24, borderWidth: 1, borderColor: 'rgba(226,232,240,0.72)', padding: 14, shadowColor: '#0F172A', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.12, shadowRadius: 28, elevation: 10 },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, gap: 10 },
    headerTitle: { color: '#0F172A', fontSize: 16, fontWeight: '700', flex: 1, minWidth: 0 },
    closeButton: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(248,250,252,0.72)', borderWidth: 1, borderColor: 'rgba(226,232,240,0.72)', flexShrink: 0 },
    input: { backgroundColor: 'rgba(248,250,252,0.72)', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: '#0F172A', borderWidth: 1, borderColor: 'rgba(226,232,240,0.72)' },
    results: { marginTop: 8, backgroundColor: 'rgba(248,250,252,0.72)', borderRadius: 12, borderWidth: 1, borderColor: 'rgba(226,232,240,0.72)', paddingVertical: 6, paddingHorizontal: 8 },
    status: { color: '#475569', fontSize: 13, paddingVertical: 8, textAlign: 'center' },
    resultRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, paddingVertical: 7, paddingHorizontal: 4 },
    resultIcon: { width: 20 },
    resultPress: { flex: 1, minWidth: 0 },
    resultTitle: { color: '#0F172A', fontSize: 13, fontWeight: '700' },
    resultSubtitle: { color: '#64748B', fontSize: 11, marginTop: 2, lineHeight: 15 },
    favBtn: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(219,234,254,0.72)', borderWidth: 1, borderColor: 'rgba(191,219,254,0.72)', flexShrink: 0 },
});
