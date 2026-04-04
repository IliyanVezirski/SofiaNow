import React, { useMemo } from 'react';
import { Text, View } from 'react-native';
import MapboxGL from '@maplibre/maplibre-react-native';
import { Ionicons } from '@expo/vector-icons';

import type { LineRouteGeometry, Stop } from '../../../services/stopsApi';
import { formatUnixTime } from '../../../services/transitUtils';
import type { TripRouteGeoJSON, TripRouteStop } from '../../tripPlanner/utils/routeGeoJson';
import { StopDot } from '../../stops/components/StopDot';
import { VehicleMarkerContent } from '../../vehicles/components/VehicleMarker';
import { getDirectionAccentColor, getDirectionArrowSamples } from '../constants';
import { getLiveVehicleRouteCoordinates } from '../utils/liveVehicleRoute';
import { mapLayerStyles } from './mapLayerStyles';
import type { TripStopInfo, Vehicle } from '../../../types/vehicles';
import type { RenderedStopMarker } from '../utils/derived';

interface RenderedVehicle extends Vehicle {
    renderId: string;
}

interface RouteStopPreview {
    id: string;
    name: string;
    latitude: number;
    longitude: number;
}

interface MapboxTransitLayersProps {
    droppedPin: { latitude: number; longitude: number } | null;
    hasActiveRouteOverlay: boolean;
    hasTripRoute: boolean;
    isTransitMode: boolean;
    renderedDisplayVehicles: RenderedVehicle[];
    routeGeometry: LineRouteGeometry | null;
    routeGeometryVersion: number;
    selectedStopAnnotationId: string | null;
    selectedStopIdRef: React.MutableRefObject<string | null>;
    shouldRenderTransitViewportData: boolean;
    showStops: boolean;
    showVehicles: boolean;
    stopAnnotationRefs: React.MutableRefObject<Record<string, { refresh: () => void } | null>>;
    stops: RenderedStopMarker[];
    tripPlannerRoute?: TripRouteGeoJSON | null;
    vehicleRouteCoords: [number, number][];
    vehicleRouteHasRoute: boolean;
    vehicleRouteStops: TripStopInfo[];
    vehicleRouteVehicleId: string | null;
    walkingRadiiGeoJSON: object | null;
    onRouteStopPress: (stop: RouteStopPreview, directionName: string, annotationId: string) => void | Promise<void>;
    onCloseSelectedStop: () => void;
    onStopPress: (stop: RenderedStopMarker) => void | Promise<void>;
    onTrackedVehiclePress: (vehicle: RenderedVehicle) => void;
    onTripPlannerStopPress: (stop: TripRouteStop, index: number) => void | Promise<void>;
    onVehicleDeselect: (vehicleId: string) => void;
    onVehiclePress: (vehicle: RenderedVehicle) => void;
    onVehicleRouteStopPress: (stop: TripStopInfo, annotationId: string) => void | Promise<void>;
}

export const MapboxTransitLayers: React.FC<MapboxTransitLayersProps> = ({
    droppedPin,
    hasActiveRouteOverlay,
    hasTripRoute,
    isTransitMode,
    renderedDisplayVehicles,
    routeGeometry,
    routeGeometryVersion,
    selectedStopAnnotationId,
    selectedStopIdRef,
    shouldRenderTransitViewportData,
    showStops,
    showVehicles,
    stopAnnotationRefs,
    stops,
    tripPlannerRoute,
    vehicleRouteCoords,
    vehicleRouteHasRoute,
    vehicleRouteStops,
    vehicleRouteVehicleId,
    walkingRadiiGeoJSON,
    onCloseSelectedStop,
    onRouteStopPress,
    onStopPress,
    onTrackedVehiclePress,
    onTripPlannerStopPress,
    onVehicleDeselect,
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
    const shouldShowLineRouteVehicles = showVehicles
        && shouldRenderTransitViewportData
        && (
            !hasActiveRouteOverlay
            || (!!routeGeometry && !hasTripRoute && !vehicleRouteHasRoute && vehicleRouteStops.length === 0)
        );

    if (!isTransitMode) {
        return (
            <>
                {!hasActiveRouteOverlay && droppedPin ? (
                    <MapboxGL.PointAnnotation key="dropped-pin" id="dropped-pin" coordinate={[droppedPin.longitude, droppedPin.latitude]}>
                        <View style={mapLayerStyles.droppedPinDot} />
                    </MapboxGL.PointAnnotation>
                ) : null}
            </>
        );
    }

    return (
        <>
            {!hasActiveRouteOverlay && showStops && shouldRenderTransitViewportData && walkingRadiiGeoJSON ? (
                <MapboxGL.ShapeSource id="walking-radii" shape={walkingRadiiGeoJSON as any}>
                    <MapboxGL.LineLayer id="walking-radii-line" filter={['==', ['get', 'customType'], 'circle_line']} style={{ lineColor: '#9CA3AF', lineWidth: 1.5, lineOpacity: 0.8 }} />
                    <MapboxGL.SymbolLayer id="walking-radii-label" filter={['==', ['get', 'customType'], 'circle_label']} style={{
                        textField: ['get', 'label'],
                        textSize: 10,
                        textColor: '#4B5563',
                        textHaloColor: 'rgba(255,255,255,0.85)',
                        textHaloWidth: 1.5,
                        textAnchor: 'center',
                    }} />
                </MapboxGL.ShapeSource>
            ) : null}

            {!hasActiveRouteOverlay && showStops && shouldRenderTransitViewportData && stops.map((stop) => {
                const isSelected = selectedStopAnnotationId === stop.id || selectedStopAnnotationId === `stop-${stop.sourceStop.id}`;

                return (
                    <MapboxGL.PointAnnotation
                        key={stop.id}
                        id={stop.id}
                        ref={(ref) => { stopAnnotationRefs.current[stop.id] = ref as { refresh: () => void } | null; }}
                        coordinate={[stop.longitude, stop.latitude]}
                        selected={isSelected}
                        onSelected={() => {
                            void onStopPress(stop);
                        }}
                        onDeselected={() => {
                            if (selectedStopIdRef.current === stop.sourceStop.id) {
                                onCloseSelectedStop();
                            }
                        }}
                    >
                        <StopDot stop={stop.sourceStop} markerKinds={stop.markerKinds} selected={isSelected} />
                    </MapboxGL.PointAnnotation>
                );
            })}

            {!hasTripRoute && routeGeometry?.directions.map((direction, index) => (
                <React.Fragment key={`route-group-${routeGeometry.line}-${index}`}>
                    <MapboxGL.ShapeSource
                        id={`route-outline-${routeGeometry.line}-${index}`}
                        shape={{ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: direction.coordinates } }}
                    >
                        <MapboxGL.LineLayer
                            id={`route-outline-layer-${routeGeometry.line}-${index}`}
                            style={{ lineColor: '#FFFFFF', lineWidth: 7, lineOpacity: 0.85, lineCap: 'round', lineJoin: 'round' }}
                        />
                    </MapboxGL.ShapeSource>
                    <MapboxGL.ShapeSource
                        id={`route-source-${routeGeometry.line}-${index}`}
                        shape={{ type: 'Feature', properties: { routeColor: getDirectionAccentColor(index) }, geometry: { type: 'LineString', coordinates: direction.coordinates } }}
                    >
                        <MapboxGL.LineLayer
                            id={`route-layer-${routeGeometry.line}-${index}`}
                            style={{ lineColor: ['get', 'routeColor'], lineWidth: 4, lineOpacity: 0.9, lineCap: 'round', lineJoin: 'round' }}
                        />
                    </MapboxGL.ShapeSource>
                </React.Fragment>
            ))}

            {!hasTripRoute && routeGeometry?.directions.map((direction, directionIndex) =>
                getDirectionArrowSamples(direction.coordinates).map((arrow, arrowIndex) => (
                    <MapboxGL.PointAnnotation key={`route-arrow-${directionIndex}-${arrowIndex}`} id={`route-arrow-${directionIndex}-${arrowIndex}`} coordinate={arrow.coordinate}>
                        <Text style={[mapLayerStyles.routeDirectionArrow, { color: getDirectionAccentColor(directionIndex), transform: [{ rotate: `${arrow.headingDegrees}deg` }] }]}>{'\u25B2'}</Text>
                    </MapboxGL.PointAnnotation>
                )),
            )}

            {!hasTripRoute && routeGeometry?.directions.map((direction, directionIndex) =>
                direction.stops.map((stop, stopIndex) => {
                    const annotationId = `route-stop-v${routeGeometryVersion}-${directionIndex}-${stop.id}-${stopIndex}`;
                    const isSelected = selectedStopAnnotationId === annotationId;

                    return (
                        <MapboxGL.PointAnnotation
                            key={`${annotationId}-${isSelected ? 'selected' : 'idle'}`}
                            id={annotationId}
                            coordinate={[stop.longitude, stop.latitude]}
                            ref={(ref) => { stopAnnotationRefs.current[annotationId] = ref as { refresh: () => void } | null; }}
                            selected={isSelected}
                            onSelected={() => {
                                void onRouteStopPress(stop, direction.name || `Посока ${directionIndex + 1}`, annotationId);
                            }}
                            onDeselected={() => {
                                if (selectedStopIdRef.current === stop.id) {
                                    onCloseSelectedStop();
                                }
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
                        </MapboxGL.PointAnnotation>
                    );
                }),
            )}

            {!hasTripRoute && vehicleRouteStops.length > 0 ? (
                <>
                    {liveVehicleRouteCoordinates.length >= 2 ? (
                        <>
                            <MapboxGL.ShapeSource
                                id="vehicle-route-outline"
                                shape={{
                                    type: 'Feature',
                                    properties: {},
                                    geometry: { type: 'LineString', coordinates: liveVehicleRouteCoordinates },
                                }}
                            >
                                <MapboxGL.LineLayer
                                    id="vehicle-route-outline-layer"
                                    style={{ lineColor: '#FFFFFF', lineWidth: 7, lineOpacity: 0.85, lineCap: 'round', lineJoin: 'round' }}
                                />
                            </MapboxGL.ShapeSource>
                            <MapboxGL.ShapeSource
                                id="vehicle-route-line"
                                shape={{
                                    type: 'Feature',
                                    properties: {},
                                    geometry: { type: 'LineString', coordinates: liveVehicleRouteCoordinates },
                                }}
                            >
                                <MapboxGL.LineLayer
                                    id="vehicle-route-layer"
                                    style={{ lineColor: '#059669', lineWidth: 4, lineOpacity: 0.9, lineCap: 'round', lineJoin: 'round' }}
                                />
                            </MapboxGL.ShapeSource>
                        </>
                    ) : null}

                    {vehicleRouteStops.map((stop, index) => {
                        const annotationId = `vr-stop-${stop.stopId}-${index}`;
                        const isSelected = selectedStopAnnotationId === annotationId;

                        return (
                            <MapboxGL.PointAnnotation
                                key={`${annotationId}-${isSelected ? 'selected' : 'idle'}`}
                                id={annotationId}
                                ref={(ref) => { stopAnnotationRefs.current[annotationId] = ref as { refresh: () => void } | null; }}
                                coordinate={[stop.longitude, stop.latitude]}
                                selected={isSelected}
                                onSelected={() => {
                                    void onVehicleRouteStopPress(stop, annotationId);
                                }}
                                onDeselected={() => {
                                    if (selectedStopIdRef.current === stop.stopId) {
                                        onCloseSelectedStop();
                                    }
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
                            </MapboxGL.PointAnnotation>
                        );
                    })}
                </>
            ) : null}

            {!hasTripRoute && vehicleRouteHasRoute && trackedVehicle ? (
                <MapboxGL.PointAnnotation
                    key={`tracked-${trackedVehicle.renderId}`}
                    id={`tracked-${trackedVehicle.renderId}`}
                    coordinate={[trackedVehicle.longitude, trackedVehicle.latitude]}
                    onSelected={() => {
                        onTrackedVehiclePress(trackedVehicle);
                    }}
                >
                    <View style={mapLayerStyles.vehicleMarkerWrap}><VehicleMarkerContent vehicle={trackedVehicle} /></View>
                </MapboxGL.PointAnnotation>
            ) : null}

            {shouldShowLineRouteVehicles && renderedDisplayVehicles.map((vehicle) => (
                <MapboxGL.PointAnnotation
                    key={vehicle.renderId}
                    id={vehicle.renderId}
                    coordinate={[vehicle.longitude, vehicle.latitude]}
                    onSelected={() => {
                        onVehiclePress(vehicle);
                    }}
                    onDeselected={() => { onVehicleDeselect(vehicle.id); }}
                >
                    <View style={mapLayerStyles.vehicleMarkerWrap}><VehicleMarkerContent vehicle={vehicle} /></View>
                </MapboxGL.PointAnnotation>
            ))}

            {!hasActiveRouteOverlay && droppedPin ? (
                <MapboxGL.PointAnnotation key="dropped-pin" id="dropped-pin" coordinate={[droppedPin.longitude, droppedPin.latitude]}>
                    <View style={mapLayerStyles.droppedPinDot} />
                </MapboxGL.PointAnnotation>
            ) : null}

            {tripPlannerRoute?.features.map((feature, index) => (
                <React.Fragment key={`trip-leg-group-${index}`}>
                    <MapboxGL.ShapeSource key={`trip-leg-outline-${index}`} id={`trip-leg-outline-${index}`} shape={{ type: 'Feature', properties: {}, geometry: feature.geometry }}>
                        <MapboxGL.LineLayer id={`trip-leg-outline-layer-${index}`} style={{
                            lineColor: '#FFFFFF',
                            lineWidth: feature.properties.mode === 'WALK' ? 7 : 8,
                            lineOpacity: 0.85,
                            lineCap: 'round',
                            lineJoin: 'round',
                        }} />
                    </MapboxGL.ShapeSource>
                    <MapboxGL.ShapeSource key={`trip-leg-${index}`} id={`trip-leg-${index}`} shape={{ type: 'Feature', properties: {}, geometry: feature.geometry }}>
                        <MapboxGL.LineLayer id={`trip-leg-layer-${index}`} style={{
                            lineColor: feature.properties.color,
                            lineWidth: feature.properties.mode === 'WALK' ? 4 : 5,
                            lineOpacity: 1,
                            lineCap: feature.properties.mode === 'WALK' ? 'butt' : 'round',
                            lineJoin: 'round',
                            lineDasharray: feature.properties.mode === 'WALK' ? [0.8, 1.8] : [],
                        }} />
                    </MapboxGL.ShapeSource>
                </React.Fragment>
            ))}

            {tripPlannerRoute?.features.map((feature, index) =>
                getDirectionArrowSamples(feature.geometry.coordinates, feature.properties.mode === 'WALK' ? 6 : 10).map((arrow, arrowIndex) => (
                    <MapboxGL.PointAnnotation key={`trip-arrow-${index}-${arrowIndex}`} id={`trip-arrow-${index}-${arrowIndex}`} coordinate={arrow.coordinate}>
                        <Text style={[mapLayerStyles.tripDirectionArrow, { color: feature.properties.mode === 'WALK' ? '#64748B' : feature.properties.color, transform: [{ rotate: `${arrow.headingDegrees}deg` }] }]}>{'\u25B2'}</Text>
                    </MapboxGL.PointAnnotation>
                )),
            )}

            {tripPlannerRoute?.features.map((feature, index) => {
                if (index === 0) {
                    return null;
                }

                const previousMode = tripPlannerRoute.features[index - 1].properties.mode;
                const currentMode = feature.properties.mode;
                if (previousMode === currentMode) {
                    return null;
                }

                const coordinate = feature.geometry.coordinates[0];
                const modeIcon = currentMode === 'WALK' ? 'walk-outline' : currentMode === 'BUS' ? 'bus-outline' : currentMode === 'TRAM' ? 'train-outline' : currentMode === 'TROLLEYBUS' ? 'bus-outline' : currentMode === 'SUBWAY' ? 'subway-outline' : currentMode === 'RAIL' ? 'train-outline' : 'swap-horizontal-outline';

                return (
                    <MapboxGL.PointAnnotation key={`trip-mode-${index}`} id={`trip-mode-${index}`} coordinate={coordinate}>
                        <View style={[mapLayerStyles.tripModeMarker, { borderColor: feature.properties.color }]}>
                            <Ionicons name={modeIcon as any} size={13} color={feature.properties.color} />
                        </View>
                    </MapboxGL.PointAnnotation>
                );
            })}

            {tripPlannerRoute?.transitStops.map((stop, index) => (
                <MapboxGL.PointAnnotation
                    key={`trip-stop-${index}-${stop.stopCode ?? stop.lat}`}
                    id={`trip-stop-${index}`}
                    ref={(ref) => { stopAnnotationRefs.current[`trip-stop-${index}`] = ref as { refresh: () => void } | null; }}
                    coordinate={[stop.lon, stop.lat]}
                    selected={selectedStopAnnotationId === `trip-stop-${index}`}
                    onSelected={() => {
                        void onTripPlannerStopPress(stop, index);
                    }}
                    onDeselected={() => {
                        if (selectedStopIdRef.current === (stop.stopCode ?? `trip-${index}`)) {
                            onCloseSelectedStop();
                        }
                    }}
                >
                    <View style={[mapLayerStyles.tripStopDot, selectedStopAnnotationId === `trip-stop-${index}` && mapLayerStyles.tripStopDotSelected]} />
                </MapboxGL.PointAnnotation>
            ))}

            {tripPlannerRoute ? (
                <>
                    <MapboxGL.PointAnnotation key="trip-start" id="trip-start" coordinate={[tripPlannerRoute.endpoints.from.lon, tripPlannerRoute.endpoints.from.lat]}>
                        <View style={mapLayerStyles.tripEndpointMarker}><Text style={mapLayerStyles.tripEndpointText}>А</Text></View>
                    </MapboxGL.PointAnnotation>
                    <MapboxGL.PointAnnotation key="trip-end" id="trip-end" coordinate={[tripPlannerRoute.endpoints.to.lon, tripPlannerRoute.endpoints.to.lat]}>
                        <View style={[mapLayerStyles.tripEndpointMarker, mapLayerStyles.tripEndpointMarkerEnd]}><Text style={mapLayerStyles.tripEndpointText}>Б</Text></View>
                    </MapboxGL.PointAnnotation>
                </>
            ) : null}
        </>
    );
};
