import React, { useMemo } from 'react';
import { Text, View } from 'react-native';
import { Circle as GoogleCircle, Marker, Polyline } from 'react-native-maps';

import type { LineRouteGeometry, Stop } from '../../../services/stopsApi';
import { formatUnixTime } from '../../../services/transitUtils';
import type { TripRouteGeoJSON, TripRouteStop } from '../../tripPlanner/utils/routeGeoJson';
import { VehicleMarkerContent } from '../../vehicles/components/VehicleMarker';
import { StopDot } from '../../stops/components/StopDot';
import { getDirectionAccentColor } from '../constants';
import { getLiveVehicleRouteCoordinates } from '../utils/liveVehicleRoute';
import { toMapCoordinate } from '../utils/mapScreen';
import { mapLayerStyles } from './mapLayerStyles';
import type { TripStopInfo, Vehicle } from '../../../types/vehicles';

interface RenderedVehicle extends Vehicle {
    renderId: string;
}

interface GoogleWalkingRadiusLabel {
    key: string;
    label: string;
    coordinate: { latitude: number; longitude: number };
}

interface RouteStopPreview {
    id: string;
    name: string;
    latitude: number;
    longitude: number;
}

interface GoogleTransitLayersProps {
    currentLocation: { latitude: number; longitude: number } | null;
    droppedPin: { latitude: number; longitude: number } | null;
    googleStopPool: Array<Stop | null>;
    googleVehiclePool: Array<RenderedVehicle | null>;
    googleWalkingRadiusLabels: GoogleWalkingRadiusLabel[];
    hasActiveRouteOverlay: boolean;
    hasTripRoute: boolean;
    isTransitMode: boolean;
    renderedDisplayVehicles: RenderedVehicle[];
    routeGeometry: LineRouteGeometry | null;
    routeGeometryVersion: number;
    selectedStopAnnotationId: string | null;
    shouldRenderTransitViewportData: boolean;
    tripPlannerRoute?: TripRouteGeoJSON | null;
    vehicleRouteCoords: [number, number][];
    vehicleRouteHasRoute: boolean;
    vehicleRouteStops: TripStopInfo[];
    vehicleRouteVehicleId: string | null;
    onRouteStopPress: (stop: RouteStopPreview, directionName: string, annotationId: string) => void | Promise<void>;
    onStopPress: (stop: Stop) => void | Promise<void>;
    onTrackedVehiclePress: (vehicle: RenderedVehicle) => void;
    onTripPlannerStopPress: (stop: TripRouteStop, index: number) => void | Promise<void>;
    onVehiclePress: (vehicle: RenderedVehicle) => void;
    onVehicleRouteStopPress: (stop: TripStopInfo, annotationId: string) => void | Promise<void>;
}

export const GoogleTransitLayers: React.FC<GoogleTransitLayersProps> = ({
    currentLocation,
    droppedPin,
    googleStopPool,
    googleVehiclePool,
    googleWalkingRadiusLabels,
    hasActiveRouteOverlay,
    hasTripRoute,
    isTransitMode,
    renderedDisplayVehicles,
    routeGeometry,
    routeGeometryVersion,
    selectedStopAnnotationId,
    shouldRenderTransitViewportData,
    tripPlannerRoute,
    vehicleRouteCoords,
    vehicleRouteHasRoute,
    vehicleRouteStops,
    vehicleRouteVehicleId,
    onRouteStopPress,
    onStopPress,
    onTrackedVehiclePress,
    onTripPlannerStopPress,
    onVehiclePress,
    onVehicleRouteStopPress,
}) => {
    const trackedVehicle = useMemo(
        () => renderedDisplayVehicles.find((vehicle) => vehicle.id === vehicleRouteVehicleId) ?? null,
        [renderedDisplayVehicles, vehicleRouteVehicleId],
    );
    const liveVehicleRouteCoordinates = useMemo(
        () => getLiveVehicleRouteCoordinates(vehicleRouteCoords, trackedVehicle),
        [trackedVehicle, vehicleRouteCoords],
    );

    if (!isTransitMode) {
        return (
            <>
                {!hasActiveRouteOverlay && droppedPin ? (
                    <Marker
                        key="dropped-pin"
                        coordinate={{ latitude: droppedPin.latitude, longitude: droppedPin.longitude }}
                        anchor={{ x: 0.5, y: 0.5 }}
                    >
                        <View style={mapLayerStyles.droppedPinDot} />
                    </Marker>
                ) : null}
            </>
        );
    }

    return (
        <>
            {!hasActiveRouteOverlay && shouldRenderTransitViewportData && currentLocation && [208, 416, 625].map((radiusMeters, index) => (
                <GoogleCircle
                    key={`walk-radius-${radiusMeters}`}
                    center={currentLocation}
                    radius={radiusMeters}
                    strokeColor="#9CA3AF"
                    strokeWidth={1.5}
                    fillColor={index === 0 ? 'rgba(156,163,175,0.08)' : 'rgba(156,163,175,0.04)'}
                />
            ))}

            {!hasActiveRouteOverlay && shouldRenderTransitViewportData && googleWalkingRadiusLabels.map((item) => (
                <Marker
                    key={item.key}
                    coordinate={item.coordinate}
                    anchor={{ x: 0.5, y: 0.5 }}
                    zIndex={3}
                >
                    <View collapsable={false} pointerEvents="none" style={mapLayerStyles.googleWalkingRadiusLabel}>
                        <Text style={mapLayerStyles.googleWalkingRadiusLabelText}>{item.label}</Text>
                    </View>
                </Marker>
            ))}

            {!hasActiveRouteOverlay && shouldRenderTransitViewportData && googleStopPool.map((stop, slotIndex) => (
                <Marker
                    key={`spool-${slotIndex}`}
                    identifier={`spool-${slotIndex}`}
                    coordinate={stop
                        ? { latitude: stop.latitude, longitude: stop.longitude }
                        : { latitude: 0, longitude: 0 }}
                    anchor={{ x: 0.5, y: 0.5 }}
                    opacity={stop ? 1 : 0}
                    tracksViewChanges
                    onPress={stop ? () => { void onStopPress(stop); } : undefined}
                >
                    {stop ? (
                        <StopDot stop={stop} selected={selectedStopAnnotationId === `stop-${stop.id}`} />
                    ) : (
                        <View style={{ width: 1, height: 1 }} />
                    )}
                </Marker>
            ))}

            {!hasTripRoute && routeGeometry?.directions.map((direction, index) => (
                <React.Fragment key={`route-google-${routeGeometry.line}-${index}`}>
                    <Polyline coordinates={direction.coordinates.map(toMapCoordinate)} strokeColor="#FFFFFF" strokeWidth={7} />
                    <Polyline coordinates={direction.coordinates.map(toMapCoordinate)} strokeColor={getDirectionAccentColor(index)} strokeWidth={4} />
                </React.Fragment>
            ))}

            {!hasTripRoute && routeGeometry?.directions.map((direction, directionIndex) =>
                direction.stops.map((stop, stopIndex) => {
                    const annotationId = `route-stop-v${routeGeometryVersion}-${directionIndex}-${stop.id}-${stopIndex}`;
                    const isSelected = selectedStopAnnotationId === annotationId;

                    return (
                        <Marker
                            key={annotationId}
                            coordinate={{ latitude: stop.latitude, longitude: stop.longitude }}
                            anchor={{ x: 0.5, y: 0.5 }}
                            onPress={() => {
                                void onRouteStopPress(stop, direction.name || `Посока ${directionIndex + 1}`, annotationId);
                            }}
                        >
                            <View style={{ alignItems: 'center' }}>
                                <View style={[mapLayerStyles.routeStopDot, { borderColor: getDirectionAccentColor(directionIndex) }, isSelected && mapLayerStyles.routeStopDotSelected]} />
                                {isSelected ? (
                                    <View style={mapLayerStyles.routeStopLabel}>
                                        <Text style={mapLayerStyles.routeStopName} numberOfLines={2}>{stop.name}</Text>
                                    </View>
                                ) : null}
                            </View>
                        </Marker>
                    );
                }),
            )}

            {!hasTripRoute && vehicleRouteStops.length > 0 ? (
                <>
                    {liveVehicleRouteCoordinates.length >= 2 ? (
                        <>
                            <Polyline coordinates={liveVehicleRouteCoordinates.map(toMapCoordinate)} strokeColor="#FFFFFF" strokeWidth={7} />
                            <Polyline coordinates={liveVehicleRouteCoordinates.map(toMapCoordinate)} strokeColor="#059669" strokeWidth={4} />
                        </>
                    ) : null}

                    {vehicleRouteStops.map((stop, index) => {
                        const annotationId = `vr-stop-${stop.stopId}-${index}`;
                        const isSelected = selectedStopAnnotationId === annotationId;

                        return (
                            <Marker
                                key={annotationId}
                                coordinate={{ latitude: stop.latitude, longitude: stop.longitude }}
                                anchor={{ x: 0.5, y: 0.5 }}
                                onPress={() => {
                                    void onVehicleRouteStopPress(stop, annotationId);
                                }}
                            >
                                <View style={{ alignItems: 'center' }}>
                                    <View style={[mapLayerStyles.vehicleRouteStopDot, isSelected && mapLayerStyles.vehicleRouteStopDotSelected]} />
                                    {isSelected ? (
                                        <View style={mapLayerStyles.vehicleRouteStopLabel}>
                                            <Text style={mapLayerStyles.vehicleRouteStopName} numberOfLines={2}>{stop.stopName}</Text>
                                            {stop.arrivalTimestamp ? <Text style={mapLayerStyles.vehicleRouteStopTime}>{formatUnixTime(stop.arrivalTimestamp)}</Text> : null}
                                        </View>
                                    ) : null}
                                </View>
                            </Marker>
                        );
                    })}
                </>
            ) : null}

            {!hasTripRoute && vehicleRouteHasRoute && trackedVehicle ? (
                <Marker
                    key={`tracked-${trackedVehicle.renderId}`}
                    identifier={`tracked-${trackedVehicle.id}`}
                    coordinate={{ latitude: trackedVehicle.latitude, longitude: trackedVehicle.longitude }}
                    anchor={{ x: 0.5, y: 0.5 }}
                    tracksViewChanges={false}
                    onPress={() => {
                        onTrackedVehiclePress(trackedVehicle);
                    }}
                >
                    <View collapsable={false} style={mapLayerStyles.vehicleMarkerWrap}><VehicleMarkerContent vehicle={trackedVehicle} /></View>
                </Marker>
            ) : null}

            {!hasActiveRouteOverlay && shouldRenderTransitViewportData && googleVehiclePool.map((vehicle, slotIndex) => (
                <Marker
                    key={`vpool-${slotIndex}`}
                    identifier={`vpool-${slotIndex}`}
                    coordinate={vehicle
                        ? { latitude: vehicle.latitude, longitude: vehicle.longitude }
                        : { latitude: 0, longitude: 0 }}
                    anchor={{ x: 0.5, y: 0.5 }}
                    opacity={vehicle ? 1 : 0}
                    tracksViewChanges
                    onPress={vehicle ? () => { onVehiclePress(vehicle); } : undefined}
                >
                    {vehicle ? (
                        <View collapsable={false} style={mapLayerStyles.vehicleMarkerWrap}><VehicleMarkerContent vehicle={vehicle} /></View>
                    ) : (
                        <View style={{ width: 1, height: 1 }} />
                    )}
                </Marker>
            ))}

            {!hasActiveRouteOverlay && droppedPin ? (
                <Marker
                    key="dropped-pin"
                    coordinate={{ latitude: droppedPin.latitude, longitude: droppedPin.longitude }}
                    anchor={{ x: 0.5, y: 0.5 }}
                >
                    <View style={mapLayerStyles.droppedPinDot} />
                </Marker>
            ) : null}

            {tripPlannerRoute?.features.map((feature, index) => (
                <React.Fragment key={`trip-leg-google-${index}`}>
                    <Polyline
                        coordinates={feature.geometry.coordinates.map(toMapCoordinate)}
                        strokeColor="#FFFFFF"
                        strokeWidth={feature.properties.mode === 'WALK' ? 7 : 8}
                    />
                    <Polyline
                        coordinates={feature.geometry.coordinates.map(toMapCoordinate)}
                        strokeColor={feature.properties.color}
                        strokeWidth={feature.properties.mode === 'WALK' ? 4 : 5}
                        lineDashPattern={feature.properties.mode === 'WALK' ? [8, 8] : undefined}
                    />
                </React.Fragment>
            ))}

            {tripPlannerRoute?.transitStops.map((stop, index) => (
                <Marker
                    key={`trip-stop-${index}-${stop.stopCode ?? stop.lat}`}
                    coordinate={{ latitude: stop.lat, longitude: stop.lon }}
                    anchor={{ x: 0.5, y: 0.5 }}
                    onPress={() => {
                        void onTripPlannerStopPress(stop, index);
                    }}
                >
                    <View style={[mapLayerStyles.tripStopDot, selectedStopAnnotationId === `trip-stop-${index}` && mapLayerStyles.tripStopDotSelected]} />
                </Marker>
            ))}

            {tripPlannerRoute ? (
                <>
                    <Marker key="trip-start" coordinate={{ latitude: tripPlannerRoute.endpoints.from.lat, longitude: tripPlannerRoute.endpoints.from.lon }} anchor={{ x: 0.5, y: 0.5 }}>
                        <View style={mapLayerStyles.tripEndpointMarker}><Text style={mapLayerStyles.tripEndpointText}>А</Text></View>
                    </Marker>
                    <Marker key="trip-end" coordinate={{ latitude: tripPlannerRoute.endpoints.to.lat, longitude: tripPlannerRoute.endpoints.to.lon }} anchor={{ x: 0.5, y: 0.5 }}>
                        <View style={[mapLayerStyles.tripEndpointMarker, mapLayerStyles.tripEndpointMarkerEnd]}><Text style={mapLayerStyles.tripEndpointText}>Б</Text></View>
                    </Marker>
                </>
            ) : null}
        </>
    );
};
