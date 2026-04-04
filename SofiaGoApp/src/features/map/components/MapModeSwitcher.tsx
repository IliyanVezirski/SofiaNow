import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export type MapExperienceMode = 'transit' | 'parking' | 'eco';

interface Props {
    activeMode: MapExperienceMode;
    onSelectMode: (mode: MapExperienceMode) => void;
}

const MODE_ITEMS: Array<{ mode: MapExperienceMode; icon: string }> = [
    { mode: 'transit', icon: 'bus-outline' },
    { mode: 'parking', icon: 'car-outline' },
    { mode: 'eco', icon: 'leaf-outline' },
];

export const MapModeSwitcher: React.FC<Props> = ({ activeMode, onSelectMode }) => {
    const [expanded, setExpanded] = useState(false);
    const [showMiniIcons, setShowMiniIcons] = useState(true);
    const [transitionMode, setTransitionMode] = useState<MapExperienceMode | null>(null);
    const [previousActiveMode, setPreviousActiveMode] = useState<MapExperienceMode | null>(null);
    const slideAnim = useRef(new Animated.Value(0)).current;
    const autoHideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const miniIconOpacityByModeRef = useRef<Record<MapExperienceMode, Animated.Value>>({
        transit: new Animated.Value(1),
        parking: new Animated.Value(1),
        eco: new Animated.Value(1),
    });
    const visualActiveMode = transitionMode ?? activeMode;
    const visibleModeItems = MODE_ITEMS.filter((item) => activeMode === 'eco' || item.mode !== 'eco');

    const resetMiniIcons = () => {
        miniIconOpacityByModeRef.current.transit.setValue(1);
        miniIconOpacityByModeRef.current.parking.setValue(1);
        miniIconOpacityByModeRef.current.eco.setValue(1);
    };

    const clearAutoHideTimer = () => {
        if (!autoHideTimerRef.current) return;
        clearTimeout(autoHideTimerRef.current);
        autoHideTimerRef.current = null;
    };

    const collapse = () => {
        clearAutoHideTimer();
        setExpanded(false);
        slideAnim.stopAnimation();
        Animated.timing(slideAnim, {
            toValue: 0,
            duration: 220,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
        }).start(({ finished }) => {
            if (finished) {
                setShowMiniIcons(true);
                resetMiniIcons();
                setPreviousActiveMode(null);
                if (transitionMode === activeMode) {
                    setTransitionMode(null);
                }
            }
        });
    };

    const expand = () => {
        clearAutoHideTimer();
        setShowMiniIcons(false);
        resetMiniIcons();
        setPreviousActiveMode(null);
        setTransitionMode(null);
        setExpanded(true);
        slideAnim.stopAnimation();
        Animated.timing(slideAnim, {
            toValue: 1,
            duration: 280,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
        }).start();
        autoHideTimerRef.current = setTimeout(() => {
            collapse();
        }, 2200);
    };

    useEffect(() => {
        if (transitionMode && transitionMode === activeMode) {
            setTransitionMode(null);
        }
    }, [activeMode, transitionMode]);

    useEffect(() => () => clearAutoHideTimer(), []);

    return (
        <View style={styles.container}>
            <View style={[styles.optionsWrap, { height: visibleModeItems.length * 58 - 10 }]}>
                {visibleModeItems.map((item, index) => {
                    const isActive = item.mode === visualActiveMode;
                    const shouldForceMiniIcon = showMiniIcons && previousActiveMode === item.mode && transitionMode !== null;
                    const slotTop = index * 58;
                    const collapsedTranslateX = isActive ? 0 : -30;
                    const translateX = slideAnim.interpolate({ inputRange: [0, 1], outputRange: [collapsedTranslateX, 0] });
                    const iconOpacity = isActive
                        ? slideAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 1] })
                        : slideAnim.interpolate({ inputRange: [0, 0.2, 1], outputRange: [0, 1, 1], extrapolate: 'clamp' });
                    const nubOpacity = 1;

                    return (
                        <TouchableOpacity
                            key={item.mode}
                            activeOpacity={0.82}
                            style={[styles.optionSlot, { top: slotTop }]}
                            onPressIn={() => {
                                if (item.mode !== activeMode) {
                                    setPreviousActiveMode(activeMode);
                                    setTransitionMode(item.mode);
                                    miniIconOpacityByModeRef.current[activeMode].setValue(1);
                                    miniIconOpacityByModeRef.current[item.mode].setValue(0);
                                }
                            }}
                            onPress={() => {
                                if (item.mode === activeMode) {
                                    expanded ? collapse() : expand();
                                    return;
                                }

                                if (expanded) {
                                    setShowMiniIcons(true);
                                }
                                onSelectMode(item.mode);
                                collapse();
                            }}
                        >
                            <Animated.View
                                style={[
                                    styles.optionNub,
                                    isActive && styles.optionNubActive,
                                    isActive && styles.optionNubPinned,
                                    {
                                        opacity: nubOpacity,
                                        transform: [{ translateX }],
                                    },
                                ]}
                            >
                                {((!isActive && showMiniIcons) || shouldForceMiniIcon) ? (
                                    <Animated.View
                                        pointerEvents="none"
                                        style={[
                                            styles.optionMiniIconHitless,
                                            { opacity: miniIconOpacityByModeRef.current[item.mode] },
                                        ]}
                                    >
                                        <Ionicons name={item.icon as any} size={12} color="#0F172A" />
                                    </Animated.View>
                                ) : null}
                                <Animated.View style={[styles.optionIconWrap, { opacity: iconOpacity }]}>
                                    <View style={styles.optionIconBadge}>
                                        <Ionicons name={item.icon as any} size={20} color={isActive ? '#1D4ED8' : '#0F172A'} />
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
        left: 0,
        zIndex: 0,
        elevation: 0,
    },
    optionsWrap: {
        position: 'relative',
        width: 56,
        height: 164,
    },
    optionSlot: {
        position: 'absolute',
        left: 0,
        width: 56,
        height: 48,
    },
    optionNub: {
        width: 52,
        height: 48,
        borderTopRightRadius: 24,
        borderBottomRightRadius: 24,
        backgroundColor: '#FFFFFF',
        justifyContent: 'center',
        alignItems: 'center',
        shadowColor: '#0F172A',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.02,
        shadowRadius: 4,
        elevation: 0,
        borderWidth: 1,
        borderColor: 'rgba(226,232,240,0.9)',
    },
    optionNubActive: {
        backgroundColor: '#FFFFFF',
    },
    optionNubPinned: {
        shadowOpacity: 0.1,
        shadowRadius: 10,
        elevation: 0,
    },
    optionMiniIconHitless: {
        position: 'absolute',
        right: 8,
        top: 17,
        zIndex: 3,
        elevation: 3,
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
    },
});
