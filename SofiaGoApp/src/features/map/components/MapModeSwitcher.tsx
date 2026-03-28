import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export type MapExperienceMode = 'transit' | 'parking';

interface Props {
    activeMode: MapExperienceMode;
    onSelectMode: (mode: MapExperienceMode) => void;
}

const MODE_ITEMS: Array<{ mode: MapExperienceMode; icon: string }> = [
    { mode: 'transit', icon: 'bus-outline' },
    { mode: 'parking', icon: 'car-outline' },
];

const MODE_SLOT_TOP: Record<MapExperienceMode, number> = {
    transit: 0,
    parking: 58,
};

export const MapModeSwitcher: React.FC<Props> = ({ activeMode, onSelectMode }) => {
    const [expanded, setExpanded] = useState(false);
    const slideAnim = useRef(new Animated.Value(0)).current;
    const autoHideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const clearAutoHideTimer = () => {
        if (!autoHideTimerRef.current) return;
        clearTimeout(autoHideTimerRef.current);
        autoHideTimerRef.current = null;
    };

    const collapse = () => {
        clearAutoHideTimer();
        setExpanded(false);
        Animated.timing(slideAnim, {
            toValue: 0,
            duration: 200,
            useNativeDriver: true,
        }).start();
    };

    const expand = () => {
        clearAutoHideTimer();
        setExpanded(true);
        Animated.timing(slideAnim, {
            toValue: 1,
            duration: 250,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
        }).start();
        autoHideTimerRef.current = setTimeout(() => {
            collapse();
        }, 2200);
    };

    useEffect(() => () => clearAutoHideTimer(), []);

    return (
        <View style={styles.container}>
            <View style={styles.optionsWrap}>
                {MODE_ITEMS.map((item) => {
                    const isActive = item.mode === activeMode;
                    const slotTop = MODE_SLOT_TOP[item.mode];
                    const collapsedTranslateX = isActive ? 0 : 34;
                    const translateX = slideAnim.interpolate({ inputRange: [0, 1], outputRange: [collapsedTranslateX, 0] });
                    const iconOpacity = isActive
                        ? slideAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 1] })
                        : slideAnim.interpolate({ inputRange: [0, 0.3, 1], outputRange: [0, 0, 1], extrapolate: 'clamp' });

                    return (
                        <TouchableOpacity
                            key={item.mode}
                            activeOpacity={0.82}
                            style={[styles.optionSlot, { top: slotTop }]}
                            onPress={() => {
                                if (isActive) {
                                    expanded ? collapse() : expand();
                                    return;
                                }

                                onSelectMode(item.mode);
                                expand();
                            }}
                        >
                            <Animated.View
                                style={[
                                    styles.optionNub,
                                    isActive && styles.optionNubActive,
                                    isActive && styles.optionNubPinned,
                                    {
                                        transform: [{ translateX }],
                                    },
                                ]}
                            >
                                {!expanded && !isActive ? (
                                    <View style={styles.optionLineWrap}>
                                        <View style={styles.optionLine} />
                                    </View>
                                ) : null}
                                <Animated.View style={[styles.optionIconWrap, { opacity: iconOpacity }]}>
                                    <View style={[styles.optionIconBadge, isActive && styles.optionIconBadgeActive]}>
                                        <Ionicons name={item.icon as any} size={20} color={isActive ? '#FFFFFF' : '#0F172A'} />
                                    </View>
                                </Animated.View>
                            </Animated.View>
                        </TouchableOpacity>
                    );
                })}
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        position: 'absolute',
        top: 50,
        right: 0,
        zIndex: 0,
        elevation: 0,
    },
    optionsWrap: {
        position: 'relative',
        width: 52,
        height: 106,
    },
    optionSlot: {
        position: 'absolute',
        left: 0,
    },
    optionNub: {
        width: 52,
        height: 48,
        borderTopLeftRadius: 24,
        borderBottomLeftRadius: 24,
        backgroundColor: 'rgba(255,255,255,0.82)',
        justifyContent: 'center',
        alignItems: 'center',
        shadowColor: '#0F172A',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.06,
        shadowRadius: 8,
        elevation: 0,
    },
    optionNubActive: {
        backgroundColor: 'rgba(255,255,255,0.96)',
    },
    optionNubPinned: {
        shadowOpacity: 0.1,
        shadowRadius: 10,
        elevation: 0,
    },
    optionLineWrap: {
        position: 'absolute',
        left: 7,
    },
    optionLine: {
        width: 3.5,
        height: 18,
        borderRadius: 2,
        backgroundColor: 'rgba(15,23,42,0.18)',
    },
    optionIconWrap: {
        position: 'absolute',
    },
    optionIconBadge: {
        width: 30,
        height: 30,
        borderRadius: 15,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(248,250,252,0.42)',
    },
    optionIconBadgeActive: {
        backgroundColor: '#1D4ED8',
    },
});
