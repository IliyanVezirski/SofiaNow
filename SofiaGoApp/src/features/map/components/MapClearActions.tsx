import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, TouchableOpacity } from 'react-native';

type Props = {
    isParkingMode: boolean;
    isTransitMode: boolean;
    onClearFocusedParkingZone?: () => void;
    onClearHighlightedRoute?: () => void;
    onClearShownTripRoute: () => void;
    onClearVehicleRoute: () => void;
    showFocusedParkingZoneClear: boolean;
    showHighlightedRouteClear: boolean;
    showTripRouteClear: boolean;
    showVehicleRouteClear: boolean;
    stackedTopOffset: number;
    topOffset: number;
};

export function MapClearActions({
    isParkingMode,
    isTransitMode,
    onClearFocusedParkingZone,
    onClearHighlightedRoute,
    onClearShownTripRoute,
    onClearVehicleRoute,
    showFocusedParkingZoneClear,
    showHighlightedRouteClear,
    showTripRouteClear,
    showVehicleRouteClear,
    stackedTopOffset,
    topOffset,
}: Props) {
    return (
        <>
            {isTransitMode && showVehicleRouteClear ? (
                <TouchableOpacity style={[styles.clearRouteButton, { top: topOffset }]} onPress={onClearVehicleRoute}>
                    <Ionicons name="close" size={18} color="#334155" />
                </TouchableOpacity>
            ) : null}
            {isTransitMode && showTripRouteClear ? (
                <TouchableOpacity
                    style={[styles.clearRouteButton, { top: showVehicleRouteClear ? stackedTopOffset : topOffset }]}
                    onPress={onClearShownTripRoute}
                >
                    <Ionicons name="close" size={18} color="#334155" />
                </TouchableOpacity>
            ) : null}
            {isTransitMode && showHighlightedRouteClear ? (
                <TouchableOpacity
                    style={[styles.clearRouteButton, { top: showVehicleRouteClear ? stackedTopOffset : topOffset }]}
                    onPress={onClearHighlightedRoute}
                >
                    <Ionicons name="close" size={18} color="#334155" />
                </TouchableOpacity>
            ) : null}
            {isParkingMode && showFocusedParkingZoneClear ? (
                <TouchableOpacity style={[styles.clearRouteButton, { top: topOffset }]} onPress={onClearFocusedParkingZone}>
                    <Ionicons name="close" size={18} color="#334155" />
                </TouchableOpacity>
            ) : null}
        </>
    );
}

const styles = StyleSheet.create({
    clearRouteButton: {
        position: 'absolute',
        left: 16,
        backgroundColor: 'rgba(255,255,255,0.92)',
        width: 36,
        height: 36,
        borderRadius: 18,
        justifyContent: 'center',
        alignItems: 'center',
        shadowColor: '#0F172A',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.08,
        shadowRadius: 4,
        elevation: 4,
        zIndex: 30,
    },
});
