import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import type { BottomTab, HomeActionButton } from '../types';

type Props = {
    buttons: HomeActionButton[];
    activeTab: BottomTab;
    searchVisible: boolean;
    favoritesVisible: boolean;
};

export function HomeActionBar({ buttons, activeTab, searchVisible, favoritesVisible }: Props) {
    return (
        <View style={styles.homeActionBarWrap}>
            <View style={styles.homeActionBar}>
                {buttons.map((button) => {
                    const isActive = typeof button.active === 'boolean'
                        ? button.active
                        : button.key === activeTab
                            || (button.key === 'search' && searchVisible)
                            || (button.key === 'favorites' && favoritesVisible);

                    return (
                        <TouchableOpacity
                            key={button.key}
                            style={styles.homeActionButton}
                            onPress={button.onPress}
                            activeOpacity={0.8}
                        >
                            <View style={[styles.homeActionIconWrap, isActive && styles.homeActionIconWrapActive]}>
                                <Ionicons name={button.icon} size={20} color={isActive ? '#FFFFFF' : '#0F172A'} />
                            </View>
                            <Text style={[styles.homeActionLabel, isActive && styles.homeActionLabelActive]}>{button.label}</Text>
                        </TouchableOpacity>
                    );
                })}
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    homeActionBarWrap: {
        position: 'absolute',
        left: 14,
        right: 14,
        bottom: 18,
        zIndex: 5000,
        elevation: 5000,
    },
    homeActionBar: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 10,
        paddingVertical: 10,
        borderRadius: 24,
        backgroundColor: 'rgba(255,255,255,0.78)',
        borderWidth: 1,
        borderColor: 'rgba(226,232,240,0.72)',
        shadowColor: '#0F172A',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.08,
        shadowRadius: 24,
    },
    homeActionButton: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 4,
    },
    homeActionIconWrap: {
        width: 30,
        height: 30,
        borderRadius: 15,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(248,250,252,0.42)',
    },
    homeActionIconWrapActive: {
        backgroundColor: '#1D4ED8',
    },
    homeActionLabel: {
        marginTop: 5,
        fontSize: 10,
        fontWeight: '600',
        color: '#475569',
    },
    homeActionLabelActive: {
        color: '#1D4ED8',
        fontWeight: '700',
    },
});
