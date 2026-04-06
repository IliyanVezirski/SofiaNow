import { Ionicons } from '@expo/vector-icons';
import { Animated, StyleSheet, TouchableOpacity, View } from 'react-native';

import { ReminderCenterButton } from '../../notifications/components/ReminderCenterButton';
import { MapModeSwitcher, type MapExperienceMode } from './MapModeSwitcher';

type Props = {
    bottomOffset: number;
    filterPanelOpaque: boolean;
    googleShowTraffic: boolean;
    isActive: boolean;
    isEcoMode: boolean;
    isParkingMode: boolean;
    isTransitMode: boolean;
    mapExperienceMode: MapExperienceMode;
    mapLayerPillAnim: Animated.Value;
    mapLayerPillExpanded: boolean;
    onMapExperienceModeChange: (mode: MapExperienceMode) => void;
    onMapLayerToggle: () => void;
    onOpenSavedTripRoute?: (routeId: string) => void | Promise<void>;
    onRecenterLongPress: () => void;
    onRecenterPress: () => void;
    onSupportProject: () => void;
    onToggleGoogleTraffic: () => void;
    onToggleSettings: () => void;
    onToggleStops: () => void;
    onToggleVehicles: () => void;
    settingsExpanded: boolean;
    settingsSlideAnim: Animated.Value;
    showMapLayerToggle: boolean;
    showReminderButton: boolean;
    showRecenterButton: boolean;
    showStops: boolean;
    showVehicles: boolean;
    userFollowLocked: boolean;
};

export function MapFloatingControls({
    bottomOffset,
    filterPanelOpaque,
    googleShowTraffic,
    isActive,
    isEcoMode,
    isParkingMode,
    isTransitMode,
    mapExperienceMode,
    mapLayerPillAnim,
    mapLayerPillExpanded,
    onMapExperienceModeChange,
    onMapLayerToggle,
    onOpenSavedTripRoute,
    onRecenterLongPress,
    onRecenterPress,
    onSupportProject,
    onToggleGoogleTraffic,
    onToggleSettings,
    onToggleStops,
    onToggleVehicles,
    settingsExpanded,
    settingsSlideAnim,
    showMapLayerToggle,
    showReminderButton,
    showRecenterButton,
    showStops,
    showVehicles,
    userFollowLocked,
}: Props) {
    const mapLayerOptionCount = isTransitMode ? 3 : 1;
    const mapLayerPillWidth = 36 + (mapLayerOptionCount * 34);
    const mapLayerHiddenOffset = -(mapLayerPillWidth - 18);
    const mapLayerTouchAreaWidth = 42;

    return (
        <>
            <MapModeSwitcher activeMode={mapExperienceMode} onSelectMode={onMapExperienceModeChange} />

            {showMapLayerToggle ? (
                <View style={[styles.mapLayerPillWrap, { bottom: bottomOffset + 58, width: mapLayerPillWidth }]}>
                    <View
                        pointerEvents={mapLayerPillExpanded ? 'none' : 'auto'}
                        style={[styles.mapLayerCollapsedTouchAreaWrap, { width: mapLayerTouchAreaWidth }]}
                    >
                        <TouchableOpacity
                            activeOpacity={1}
                            onPress={onMapLayerToggle}
                            style={styles.mapLayerCollapsedTouchArea}
                        />
                    </View>

                    <Animated.View
                        style={[
                            styles.mapLayerCombinedPill,
                            { width: mapLayerPillWidth },
                            {
                                transform: [{ translateX: mapLayerPillAnim.interpolate({ inputRange: [0, 1], outputRange: [mapLayerHiddenOffset, 0] }) }],
                            },
                        ]}
                    >
                        <Animated.View
                            pointerEvents={mapLayerPillExpanded ? 'auto' : 'none'}
                            style={[
                                styles.mapLayerOptionsRow,
                                {
                                    opacity: mapLayerPillAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 1] }),
                                },
                            ]}
                        >
                            {isTransitMode ? (
                                <TouchableOpacity
                                    activeOpacity={0.82}
                                    disabled={!mapLayerPillExpanded}
                                    onPress={onToggleStops}
                                    style={styles.mapLayerSlotButton}
                                >
                                    <View style={[styles.mapLayerOptionIconBadge, showStops && styles.mapLayerOptionIconBadgeActive]}>
                                        <Ionicons name="flag-outline" size={17} color={showStops ? '#FFFFFF' : '#0F172A'} />
                                    </View>
                                </TouchableOpacity>
                            ) : null}
                            {isTransitMode ? (
                                <TouchableOpacity
                                    activeOpacity={0.82}
                                    disabled={!mapLayerPillExpanded}
                                    onPress={onToggleVehicles}
                                    style={styles.mapLayerSlotButton}
                                >
                                    <View style={[styles.mapLayerOptionIconBadge, showVehicles && styles.mapLayerOptionIconBadgeActive]}>
                                        <Ionicons name="bus-outline" size={17} color={showVehicles ? '#FFFFFF' : '#0F172A'} />
                                    </View>
                                </TouchableOpacity>
                            ) : null}
                            <TouchableOpacity
                                activeOpacity={0.82}
                                disabled={!mapLayerPillExpanded}
                                onPress={onToggleGoogleTraffic}
                                style={styles.mapLayerSlotButton}
                            >
                                <View style={[styles.mapLayerOptionIconBadge, googleShowTraffic && styles.mapLayerOptionIconBadgeActive]}>
                                    <Ionicons name="car-sport-outline" size={17} color={googleShowTraffic ? '#FFFFFF' : '#0F172A'} />
                                </View>
                            </TouchableOpacity>
                        </Animated.View>

                        <TouchableOpacity
                            activeOpacity={0.82}
                            onPress={onMapLayerToggle}
                            style={styles.mapLayerTriggerSlot}
                            hitSlop={{ top: 14, bottom: 14, left: 0, right: 20 }}
                        >
                            <Animated.View
                                style={[
                                    styles.mapLayerOptionLineWrap,
                                    {
                                        opacity: mapLayerPillAnim.interpolate({ inputRange: [0, 0.4], outputRange: [1, 0], extrapolate: 'clamp' }),
                                    },
                                ]}
                            >
                                <View style={styles.mapLayerOptionLine} />
                            </Animated.View>
                        </TouchableOpacity>
                    </Animated.View>
                </View>
            ) : null}

            <View style={[styles.settingsPillWrap, { bottom: bottomOffset }]}>
                <View
                    pointerEvents={settingsExpanded ? 'none' : 'auto'}
                    style={styles.settingsCollapsedTouchAreaWrap}
                >
                    <TouchableOpacity
                        activeOpacity={1}
                        onPress={onToggleSettings}
                        style={styles.settingsCollapsedTouchArea}
                    />
                </View>

                <Animated.View
                    style={[
                        styles.settingsCombinedPill,
                        {
                            transform: [{ translateX: settingsSlideAnim.interpolate({ inputRange: [0, 1], outputRange: [-42, 0] }) }],
                        },
                    ]}
                >
                    {/* TODO: временно скрит бутон за подкрепа
                    <Animated.View
                        pointerEvents={settingsExpanded ? 'auto' : 'none'}
                        style={[
                            styles.settingsSupportSlot,
                            {
                                opacity: settingsSlideAnim.interpolate({ inputRange: [0, 0.2, 1], outputRange: [0, 0, 1], extrapolate: 'clamp' }),
                                transform: [{ translateX: settingsSlideAnim.interpolate({ inputRange: [0, 1], outputRange: [-10, 0] }) }],
                            },
                        ]}
                    >
                        <TouchableOpacity
                            activeOpacity={0.82}
                            disabled={!settingsExpanded}
                            onPress={onSupportProject}
                            style={styles.settingsSlotButton}
                        >
                            <View style={styles.settingsOptionIconBadge}>
                                <Ionicons name="heart-outline" size={20} color="#0F172A" />
                            </View>
                        </TouchableOpacity>
                    </Animated.View>
                    */}

                    <TouchableOpacity
                        activeOpacity={0.82}
                        onPress={onToggleSettings}
                        style={styles.settingsTriggerSlot}
                        hitSlop={{ top: 14, bottom: 14, left: 16, right: 28 }}
                        pressRetentionOffset={{ top: 16, bottom: 16, left: 16, right: 30 }}
                    >
                        <Animated.View
                            style={[
                                styles.settingsOptionLineWrap,
                                {
                                    opacity: settingsSlideAnim.interpolate({ inputRange: [0, 0.25], outputRange: [1, 0], extrapolate: 'clamp' }),
                                },
                            ]}
                        >
                            <View style={styles.settingsOptionLine} />
                        </Animated.View>
                        <Animated.View
                            style={[
                                styles.settingsOptionIconWrap,
                                {
                                    opacity: settingsSlideAnim.interpolate({ inputRange: [0.25, 0.8], outputRange: [0, 1], extrapolate: 'clamp' }),
                                },
                            ]}
                        >
                            <View style={styles.settingsOptionIconBadge}>
                                <Ionicons name="settings-outline" size={20} color="#0F172A" />
                            </View>
                        </Animated.View>
                    </TouchableOpacity>
                </Animated.View>
            </View>

            <View style={[styles.floatingRowWrap, { bottom: bottomOffset }]}>
                {isTransitMode && showReminderButton && !isEcoMode ? (
                    <ReminderCenterButton inline transparent opaque={filterPanelOpaque} onOpenSavedTripRoute={onOpenSavedTripRoute} />
                ) : null}
                {isActive && showRecenterButton ? (
                    <TouchableOpacity
                        style={[styles.recenterFloatingButton, userFollowLocked && styles.recenterFloatingButtonLocked]}
                        onPress={onRecenterPress}
                        onLongPress={onRecenterLongPress}
                        delayLongPress={280}
                    >
                        <View style={styles.recenterFloatingIconWrap}>
                            <Ionicons name={userFollowLocked ? 'locate' : 'locate-outline'} size={18} color={userFollowLocked ? '#1D4ED8' : '#0F172A'} />
                        </View>
                    </TouchableOpacity>
                ) : null}
            </View>
        </>
    );
}

const styles = StyleSheet.create({
    settingsPillWrap: {
        position: 'absolute',
        left: 0,
        width: 60,
        height: 48,
        zIndex: 2,
        elevation: 2,
    },
    settingsCollapsedTouchAreaWrap: {
        position: 'absolute',
        left: 0,
        top: -10,
        width: 128,
        height: 68,
        zIndex: 3,
        elevation: 3,
    },
    settingsCollapsedTouchArea: {
        width: '100%',
        height: '100%',
    },
    settingsCombinedPill: {
        width: 60,
        height: 48,
        borderTopRightRadius: 24,
        borderBottomRightRadius: 24,
        backgroundColor: 'rgba(255,255,255,0.88)',
        borderWidth: 1,
        borderColor: 'rgba(226,232,240,0.78)',
        shadowColor: '#0F172A',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.06,
        shadowRadius: 8,
        elevation: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingLeft: 8,
        paddingRight: 8,
        overflow: 'hidden',
    },
    floatingRowWrap: {
        position: 'absolute',
        right: 16,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        zIndex: 0,
        elevation: 0,
    },
    settingsSupportSlot: {
        width: 34,
        height: 48,
        alignItems: 'center',
        justifyContent: 'center',
    },
    settingsTriggerSlot: {
        width: 52,
        height: 48,
        alignItems: 'center',
        justifyContent: 'center',
    },
    settingsSlotButton: {
        width: 34,
        height: 34,
        alignItems: 'center',
        justifyContent: 'center',
    },
    settingsOptionLineWrap: {
        position: 'absolute',
        right: 7,
        alignItems: 'center',
        justifyContent: 'center',
    },
    settingsOptionLine: {
        width: 3.5,
        height: 18,
        borderRadius: 2,
        backgroundColor: 'rgba(15,23,42,0.18)',
    },
    settingsOptionIconWrap: {
        position: 'absolute',
    },
    settingsOptionIconBadge: {
        width: 30,
        height: 30,
        borderRadius: 15,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(248,250,252,0.42)',
    },
    recenterFloatingButton: {
        height: 48,
        borderRadius: 24,
        paddingHorizontal: 8,
        backgroundColor: 'rgba(255,255,255,0.78)',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: 'rgba(226,232,240,0.72)',
        shadowColor: '#0F172A',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.08,
        shadowRadius: 24,
        elevation: 1,
        zIndex: 1,
    },
    recenterFloatingButtonLocked: {
        borderColor: 'rgba(59,130,246,0.7)',
        backgroundColor: 'rgba(239,246,255,0.96)',
    },
    recenterFloatingIconWrap: {
        width: 28,
        height: 28,
        borderRadius: 14,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(248,250,252,0.42)',
    },
    mapLayerPillWrap: {
        position: 'absolute',
        left: 0,
        height: 48,
        zIndex: 2,
        elevation: 2,
    },
    mapLayerCollapsedTouchAreaWrap: {
        position: 'absolute',
        left: 0,
        top: -10,
        height: 68,
        zIndex: 3,
        elevation: 3,
    },
    mapLayerCollapsedTouchArea: {
        width: '100%',
        height: '100%',
    },
    mapLayerCombinedPill: {
        height: 48,
        borderTopRightRadius: 24,
        borderBottomRightRadius: 24,
        backgroundColor: 'rgba(255,255,255,0.88)',
        borderWidth: 1,
        borderColor: 'rgba(226,232,240,0.78)',
        shadowColor: '#0F172A',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.06,
        shadowRadius: 8,
        elevation: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'flex-start',
        paddingLeft: 6,
        paddingRight: 6,
        overflow: 'hidden',
    },
    mapLayerOptionsRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 0,
    },
    mapLayerTriggerSlot: {
        width: 24,
        height: 48,
        alignItems: 'center',
        justifyContent: 'center',
    },
    mapLayerOptionLineWrap: {
        position: 'absolute',
        right: 4,
        alignItems: 'center',
        justifyContent: 'center',
    },
    mapLayerOptionLine: {
        width: 3.5,
        height: 18,
        borderRadius: 2,
        backgroundColor: 'rgba(15,23,42,0.18)',
    },
    mapLayerSlotButton: {
        width: 34,
        height: 34,
        alignItems: 'center',
        justifyContent: 'center',
    },
    mapLayerOptionIconBadge: {
        width: 30,
        height: 30,
        borderRadius: 15,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(248,250,252,0.42)',
    },
    mapLayerOptionIconBadgeActive: {
        backgroundColor: '#3B82F6',
    },
});
