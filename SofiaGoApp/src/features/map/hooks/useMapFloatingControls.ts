import { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Easing } from 'react-native';

import { buyOneTime, buySubscription, type OneTimeId, type SubscriptionId } from '../../../services/billing';
import type { MapExperienceMode } from '../components/MapModeSwitcher';

type Params = {
    mapExperienceMode: MapExperienceMode;
};

export const useMapFloatingControls = ({ mapExperienceMode }: Params) => {
    const [settingsVisible, setSettingsVisible] = useState(false);
    const [supportVisible, setSupportVisible] = useState(false);
    const [settingsExpanded, setSettingsExpanded] = useState(false);
    const [googleShowTraffic, setGoogleShowTraffic] = useState(mapExperienceMode === 'parking');
    const [showVehicles, setShowVehicles] = useState(true);
    const [showStops, setShowStops] = useState(true);
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

    const handleToggleVehicles = useCallback(() => {
        setShowVehicles((previous) => !previous);
        expandMapLayerPill();
    }, [expandMapLayerPill]);

    const handleToggleStops = useCallback(() => {
        setShowStops((previous) => !previous);
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
        // legacy – no longer used
    }, []);

    const handleBuyOneTime = useCallback(async (productId: OneTimeId) => {
        return buyOneTime(productId);
    }, []);

    const handleBuySubscription = useCallback(async (subscriptionId: SubscriptionId) => {
        return buySubscription(subscriptionId);
    }, []);

    useEffect(() => {
        setGoogleShowTraffic(mapExperienceMode === 'parking');
    }, [mapExperienceMode]);

    useEffect(() => () => clearSettingsAutoHideTimer(), [clearSettingsAutoHideTimer]);
    useEffect(() => () => clearMapLayerAutoHideTimer(), [clearMapLayerAutoHideTimer]);

    return {
        googleShowTraffic,
        handleBuyOneTime,
        handleBuySubscription,
        handleGoogleTrafficPress,
        handleMapLayerToggle,
        handleOpenSupportLink,
        handleSettingsToggle,
        handleSupportProject,
        handleToggleStops,
        handleToggleVehicles,
        mapLayerPillAnim,
        mapLayerPillExpanded,
        setSettingsVisible,
        setSupportVisible,
        settingsExpanded,
        settingsSlideAnim,
        settingsVisible,
        showStops,
        showVehicles,
        supportVisible,
    };
};
