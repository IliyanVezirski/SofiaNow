import React from 'react';
import { View, Text, Pressable, TextInput, ScrollView, TouchableOpacity, Modal, StyleSheet } from 'react-native';
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

export const SearchModal: React.FC<Props> = ({
    visible, query, loading, results, onChangeQuery, onClose,
    onSelectPlace, onSelectLine, onSelectStop, onSaveFavorite,
}) => (
    <Modal animationType="fade" transparent visible={visible} onRequestClose={onClose}>
        <View style={styles.overlay}>
            <View style={styles.card}>
                <View style={styles.header}>
                    <Text style={styles.headerTitle}>Търсене: места, линии, спирки</Text>
                    <Pressable onPress={onClose} style={styles.headerClose}>
                        <Text style={styles.headerCloseText}>{'\u00D7'}</Text>
                    </Pressable>
                </View>
                <TextInput style={styles.input} placeholder="Търси адрес, линия или спирка..." placeholderTextColor="#6B7280" value={query} onChangeText={onChangeQuery} />
                {(loading || results.length > 0) && (
                    <ScrollView style={styles.results} showsVerticalScrollIndicator nestedScrollEnabled>
                        {loading && <Text style={styles.status}>Търсене...</Text>}
                        {!loading && results.map((result, idx) => {
                            if (result.kind === 'place') {
                                return (
                                    <View key={`s-${result.kind}-${result.id}-${idx}`} style={styles.resultRow}>
                                        <TouchableOpacity style={styles.resultPress} onPress={() => onSelectPlace(result)}>
                                            <Text style={styles.resultTitle} numberOfLines={1}>{`\uD83D\uDCCD ${result.name}`}</Text>
                                            <Text style={styles.resultSubtitle} numberOfLines={1}>{result.subtitle}</Text>
                                        </TouchableOpacity>
                                        <TouchableOpacity style={styles.favBtn} onPress={() => onSaveFavorite(result.name, result.latitude, result.longitude)}>
                                            <Text style={styles.favBtnText}>{'\u2606'}</Text>
                                        </TouchableOpacity>
                                    </View>
                                );
                            }
                            if (result.kind === 'line') {
                                return (
                                    <View key={`s-${result.kind}-${result.id}-${idx}`} style={styles.resultRow}>
                                        <TouchableOpacity style={styles.resultPress} onPress={() => onSelectLine(result)}>
                                            <Text style={styles.resultTitle} numberOfLines={1}>{`\uD83D\uDE8C ${result.name}`}</Text>
                                            <Text style={styles.resultSubtitle} numberOfLines={1}>{result.subtitle}</Text>
                                        </TouchableOpacity>
                                    </View>
                                );
                            }
                            return (
                                <View key={`s-${result.kind}-${result.id}-${idx}`} style={styles.resultRow}>
                                    <TouchableOpacity style={styles.resultPress} onPress={() => onSelectStop(result)}>
                                        <Text style={styles.resultTitle} numberOfLines={1}>{`\uD83D\uDE8F ${result.name}`}</Text>
                                        <Text style={styles.resultSubtitle} numberOfLines={1}>{result.subtitle}</Text>
                                    </TouchableOpacity>
                                </View>
                            );
                        })}
                    </ScrollView>
                )}
            </View>
        </View>
    </Modal>
);

const styles = StyleSheet.create({
    overlay: { flex: 1, backgroundColor: 'rgba(17,24,39,0.35)', justifyContent: 'flex-start', paddingTop: 28, paddingHorizontal: 12 },
    card: { backgroundColor: 'rgba(255,255,255,0.98)', borderRadius: 16, borderWidth: 1, borderColor: '#E5E7EB', padding: 12 },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
    headerTitle: { color: '#111827', fontSize: 15, fontWeight: '700' },
    headerClose: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F3F4F6' },
    headerCloseText: { color: '#374151', fontSize: 14, fontWeight: '700' },
    input: { backgroundColor: 'rgba(255,255,255,0.96)', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 9, fontSize: 14, color: '#111827', borderWidth: 1, borderColor: '#D1D5DB' },
    results: { marginTop: 6, maxHeight: 220, backgroundColor: 'rgba(255,255,255,0.97)', borderRadius: 12, borderWidth: 1, borderColor: '#E5E7EB', paddingVertical: 6, paddingHorizontal: 8 },
    status: { color: '#4B5563', fontSize: 13, paddingVertical: 8, textAlign: 'center' },
    resultRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6 },
    resultPress: { flex: 1 },
    resultTitle: { color: '#111827', fontSize: 13, fontWeight: '700' },
    resultSubtitle: { color: '#6B7280', fontSize: 11, marginTop: 1 },
    favBtn: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: '#EEF2FF', borderWidth: 1, borderColor: '#C7D2FE' },
    favBtnText: { color: '#1D4ED8', fontSize: 16, fontWeight: '700' },
});
