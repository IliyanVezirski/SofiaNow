import { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Easing, Linking } from 'react-native';

import type { MapExperienceMode } from '../components/MapModeSwitcher';

type Params = {
    mapExperienceMode: MapExperienceMode;
    supportUrl: string;
};

export const useMapFloatingControls = ({ mapExperienceMode, supportUrl }: Params) => {
    const [settingsVisible, setSettingsVisible] = useState(false);
    const [supportVisible, setSupportVisible] = useState(false);
    const [settingsExpanded, setSettingsExpanded] = useState(false);
    const [googleShowTraffic, setGoogleShowTraffic] = useState(mapExperienceMode === 'parking');
    const [mapLayerPillExpanded, setMapLayerPillExpanded] = useState(false);
    const mapLayerPillAnim = useRef(new Animated.Value(0)).current;
    const mapLayerPillAutoHideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const settingsSlideAnim = useRef(new Animated.Value(0)).current;
    const settingsAutoHideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    const clearSettingsAutoHideTimer = useCallback(() => {
        if (!settingsAutoHideTimer.current) {
            return;
        }

        clearTimeout(settingsAutoHideTimer.current);
        settingsAutoHideTimer.current = null;
    }, []);

    const collapseSettingsPill = useCallback(() => {
        clearSettingsAutoHideTimer();
        setSettingsExpanded(false);
        Animated.timing(settingsSlideAnim, { toValue: 0, duration: 200, useNativeDriver: true }).start();
    }, [clearSettingsAutoHideTimer, settingsSlideAnim]);

    const expandSettingsPill = useCallback(() => {
        clearSettingsAutoHideTimer();
        setSettingsExpanded(true);
        Animated.timing(settingsSlideAnim, {
            toValue: 1,
            duration: 250,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
        }).start();
        settingsAutoHideTimer.current = setTimeout(() => {
            setSettingsExpanded(false);
            Animated.timing(settingsSlideAnim, { toValue: 0, duration: 200, useNativeDriver: true }).start();
            settingsAutoHideTimer.current = null;
        }, 2000);
    }, [clearSettingsAutoHideTimer, settingsSlideAnim]);

    const clearMapLayerAutoHideTimer = useCallback(() => {
        if (!mapLayerPillAutoHideTimer.current) {
            return;
        }

        clearTimeout(mapLayerPillAutoHideTimer.current);
        mapLayerPillAutoHideTimer.current = null;
    }, []);

    const collapseMapLayerPill = useCallback(() => {
        clearMapLayerAutoHideTimer();
        setMapLayerPillExpanded(false);
        Animated.timing(mapLayerPillAnim, { toValue: 0, duration: 220, useNativeDriver: true }).start();
    }, [clearMapLayerAutoHideTimer, mapLayerPillAnim]);

    const expandMapLayerPill = useCallback(() => {
        clearMapLayerAutoHideTimer();
        setMapLayerPillExpanded(true);
        Animated.timing(mapLayerPillAnim, {
            toValue: 1,
            duration: 290,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
        }).start();
        mapLayerPillAutoHideTimer.current = setTimeout(() => {
            setMapLayerPillExpanded(false);
            Animated.timing(mapLayerPillAnim, { toValue: 0, duration: 220, useNativeDriver: true }).start();
            mapLayerPillAutoHideTimer.current = null;
        }, 2000);
    }, [clearMapLayerAutoHideTimer, mapLayerPillAnim]);

    const handleMapLayerToggle = useCallback(() => {
        if (mapLayerPillExpanded) {
            collapseMapLayerPill();
            return;
        }

        expandMapLayerPill();
    }, [collapseMapLayerPill, expandMapLayerPill, mapLayerPillExpanded]);

    const handleGoogleTrafficPress = useCallback(() => {
        setGoogleShowTraffic((previous) => !previous);
        expandMapLayerPill();
    }, [expandMapLayerPill]);

    const handleOpenSettings = useCallback(() => {
        collapseSettingsPill();
        setSettingsVisible(true);
    }, [collapseSettingsPill]);

    const handleSettingsToggle = useCallback(() => {
        if (settingsExpanded) {
            handleOpenSettings();
            return;
        }

        expandSettingsPill();
    }, [expandSettingsPill, handleOpenSettings, settingsExpanded]);

    const handleSupportProject = useCallback(() => {
        collapseSettingsPill();
        setSupportVisible(true);
    }, [collapseSettingsPill]);

    const handleOpenSupportLink = useCallback(() => {
        if (!supportUrl) {
            return;
        }

        void (async () => {
            try {
                const canOpen = await Linking.canOpenURL(supportUrl);
                if (!canOpen) {
                    return;
                }

                await Linking.openURL(supportUrl);
                setSupportVisible(false);
            } catch {
                return;
            }
        })();
    }, [supportUrl]);

    useEffect(() => {
        setGoogleShowTraffic(mapExperienceMode === 'parking');
    }, [mapExperienceMode]);

    useEffect(() => () => clearSettingsAutoHideTimer(), [clearSettingsAutoHideTimer]);
    useEffect(() => () => clearMapLayerAutoHideTimer(), [clearMapLayerAutoHideTimer]);

    return {
        googleShowTraffic,
        handleGoogleTrafficPress,
        handleMapLayerToggle,
        handleOpenSupportLink,
        handleSettingsToggle,
        handleSupportProject,
        mapLayerPillAnim,
        mapLayerPillExpanded,
        setSettingsVisible,
        setSupportVisible,
        settingsExpanded,
        settingsSlideAnim,
        settingsVisible,
        supportVisible,
    };
};
