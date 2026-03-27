import React from 'react';
import { View, Text, Pressable, TextInput, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { CentralSearchResult } from '../hooks/useSearch';

interface Props {
    visible: boolean;
    query: string;
    loading: boolean;
    results: CentralSearchResult[];
    onChangeQuery: (q: string) => void;
    onClose: () => void;
    onSelectPlace: (result: CentralSearchResult & { kind: 'place' }) => void;
    onSelectLine: (result: CentralSearchResult & { kind: 'line' }) => void;
    onSelectStop: (result: CentralSearchResult & { kind: 'stop' }) => void;
    onSaveFavorite: (name: string, lat: number, lon: number) => void;
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
    visible, query, loading, results, onChangeQuery, onClose,
    onSelectPlace, onSelectLine, onSelectStop, onSaveFavorite,
}) => {
    if (!visible) return null;
    return (
        <Pressable style={styles.overlay} onPress={onClose}>
            <View style={styles.card} onStartShouldSetResponder={() => true}>
                <View style={styles.header}>
                    <Text style={styles.headerTitle}>Търсене</Text>
                    <Pressable onPress={onClose} style={styles.closeButton}>
                        <Ionicons name="close" size={18} color="#334155" />
                    </Pressable>
                </View>
                <TextInput style={styles.input} placeholder="Търси адрес, линия или спирка..." placeholderTextColor="#94A3B8" value={query} onChangeText={onChangeQuery} />
                {(loading || results.length > 0) && (
                    <ScrollView style={styles.results} showsVerticalScrollIndicator nestedScrollEnabled>
                        {loading && <Text style={styles.status}>Търсене...</Text>}
                        {!loading && results.map((result, idx) => {
                            if (result.kind === 'place') {
                                return (
                                    <View key={`s-${result.kind}-${result.id}-${idx}`} style={styles.resultRow}>
                                        <Ionicons name={kindIcon(result.kind)} size={16} color="#64748B" style={styles.resultIcon} />
                                        <TouchableOpacity style={styles.resultPress} onPress={() => onSelectPlace(result)}>
                                            <Text style={styles.resultTitle} numberOfLines={1}>{result.name}</Text>
                                            <Text style={styles.resultSubtitle} numberOfLines={1}>{result.subtitle}</Text>
                                        </TouchableOpacity>
                                        <TouchableOpacity style={styles.favBtn} onPress={() => onSaveFavorite(result.name, result.latitude, result.longitude)}>
                                            <Ionicons name="star-outline" size={16} color="#1D4ED8" />
                                        </TouchableOpacity>
                                    </View>
                                );
                            }
                            if (result.kind === 'line') {
                                return (
                                    <View key={`s-${result.kind}-${result.id}-${idx}`} style={styles.resultRow}>
                                        <Ionicons name={kindIcon(result.kind)} size={16} color="#64748B" style={styles.resultIcon} />
                                        <TouchableOpacity style={styles.resultPress} onPress={() => onSelectLine(result)}>
                                            <Text style={styles.resultTitle} numberOfLines={1}>{result.name}</Text>
                                            <Text style={styles.resultSubtitle} numberOfLines={1}>{result.subtitle}</Text>
                                        </TouchableOpacity>
                                    </View>
                                );
                            }
                            return (
                                <View key={`s-${result.kind}-${result.id}-${idx}`} style={styles.resultRow}>
                                    <Ionicons name={kindIcon(result.kind)} size={16} color="#64748B" style={styles.resultIcon} />
                                    <TouchableOpacity style={styles.resultPress} onPress={() => onSelectStop(result)}>
                                        <Text style={styles.resultTitle} numberOfLines={1}>{result.name}</Text>
                                        <Text style={styles.resultSubtitle} numberOfLines={1}>{result.subtitle}</Text>
                                    </TouchableOpacity>
                                </View>
                            );
                        })}
                    </ScrollView>
                )}
            </View>
        </Pressable>
    );
};

const styles = StyleSheet.create({
    overlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(15,23,42,0.18)', justifyContent: 'flex-start', paddingTop: 78, paddingHorizontal: 12, zIndex: 50 },
    card: { backgroundColor: 'rgba(255,255,255,0.82)', borderRadius: 24, borderWidth: 1, borderColor: 'rgba(226,232,240,0.72)', padding: 14, shadowColor: '#0F172A', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.12, shadowRadius: 28, elevation: 10 },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
    headerTitle: { color: '#0F172A', fontSize: 16, fontWeight: '700' },
    closeButton: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(248,250,252,0.72)', borderWidth: 1, borderColor: 'rgba(226,232,240,0.72)' },
    input: { backgroundColor: 'rgba(248,250,252,0.72)', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: '#0F172A', borderWidth: 1, borderColor: 'rgba(226,232,240,0.72)' },
    results: { marginTop: 8, maxHeight: 320, backgroundColor: 'rgba(248,250,252,0.72)', borderRadius: 12, borderWidth: 1, borderColor: 'rgba(226,232,240,0.72)', paddingVertical: 6, paddingHorizontal: 8 },
    status: { color: '#475569', fontSize: 13, paddingVertical: 8, textAlign: 'center' },
    resultRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 7, paddingHorizontal: 4 },
    resultIcon: { width: 20 },
    resultPress: { flex: 1 },
    resultTitle: { color: '#0F172A', fontSize: 13, fontWeight: '700' },
    resultSubtitle: { color: '#64748B', fontSize: 11, marginTop: 2 },
    favBtn: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(219,234,254,0.72)', borderWidth: 1, borderColor: 'rgba(191,219,254,0.72)' },
});
