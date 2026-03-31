import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { loadScheduledParkingSmsEntries, subscribeToScheduledParkingSmsChanges, type ScheduledParkingSmsEntry } from '../../../services/parking';

interface Props {
    transparent?: boolean;
    onPress: () => void;
}

export const ScheduledSmsBadge: React.FC<Props> = ({ transparent = false, onPress }) => {
    const [entries, setEntries] = useState<ScheduledParkingSmsEntry[]>([]);

    useEffect(() => {
        let active = true;

        const load = async () => {
            const loaded = await loadScheduledParkingSmsEntries();
            if (active) {
                setEntries(loaded);
            }
        };

        void load();

        const unsubscribe = subscribeToScheduledParkingSmsChanges(() => {
            void load();
        });

        return () => {
            active = false;
            unsubscribe();
        };
    }, []);

    if (entries.length === 0) {
        return null;
    }

    const countLabel = entries.length <= 9 ? String(entries.length) : '9+';

    return (
        <View style={styles.inlineWrap}>
            <TouchableOpacity
                style={[styles.fab, transparent && styles.fabTransparent]}
                onPress={onPress}
                activeOpacity={0.88}
            >
                <View style={styles.fabIcon}>
                    <Ionicons name="mail-outline" size={18} color="#0F172A" />
                </View>
                <View style={styles.badge}>
                    <Text style={styles.badgeText}>{countLabel}</Text>
                </View>
            </TouchableOpacity>
        </View>
    );
};

const styles = StyleSheet.create({
    inlineWrap: {
        alignItems: 'center',
        justifyContent: 'center',
    },
    fab: {
        height: 44,
        borderRadius: 22,
        paddingHorizontal: 10,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 5,
        backgroundColor: 'rgba(255,255,255,0.92)',
        shadowColor: '#0F172A',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.06,
        shadowRadius: 12,
        elevation: 1,
    },
    fabTransparent: {
        backgroundColor: 'rgba(255,255,255,0.88)',
        borderWidth: 1,
        borderColor: 'rgba(226,232,240,0.78)',
        shadowOpacity: 0.06,
        shadowRadius: 8,
        elevation: 1,
        paddingHorizontal: 8,
    },
    fabIcon: {
        width: 26,
        height: 26,
        borderRadius: 13,
        alignItems: 'center',
        justifyContent: 'center',
    },
    badge: {
        minWidth: 18,
        height: 18,
        borderRadius: 9,
        backgroundColor: '#0F766E',
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 4,
    },
    badgeText: {
        color: '#FFFFFF',
        fontSize: 10,
        fontWeight: '700',
    },
});
