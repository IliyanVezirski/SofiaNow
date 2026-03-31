import React from 'react';
import MapboxGL from '@maplibre/maplibre-react-native';

import type { ParkingZoneFeatureCollection } from '../../parkingZones/types';

interface MapboxParkingLayersProps {
    isParkingMode: boolean;
    parkingLotsGeoJSON: {
        type: 'FeatureCollection';
        features: Array<{
            type: 'Feature';
            id: string;
            geometry: { type: 'Point'; coordinates: number[] };
            properties: {
                lotId: string;
                label: string;
                color: string;
                isSelected: number;
            };
        }>;
    };
    selectedParkingZoneFeatureId?: string | null;
    visibleParkingZonesFeatureCollection: ParkingZoneFeatureCollection | null;
    onParkingZonePress: (zoneFeatureId: string) => void;
    onParkingLotPress: (lotId: string) => void;
}

export const MapboxParkingLayers: React.FC<MapboxParkingLayersProps> = ({
    isParkingMode,
    parkingLotsGeoJSON,
    selectedParkingZoneFeatureId = null,
    visibleParkingZonesFeatureCollection,
    onParkingZonePress,
    onParkingLotPress,
}) => {
    if (!isParkingMode) {
        return null;
    }

    return (
        <>
            {visibleParkingZonesFeatureCollection ? (
                <MapboxGL.ShapeSource
                    id="parking-zones"
                    shape={visibleParkingZonesFeatureCollection as any}
                    onPress={(event) => {
                        const feature = event.features?.[0];
                        const zoneFeatureId = feature?.properties?.id as string | undefined;
                        if (zoneFeatureId) {
                            onParkingZonePress(zoneFeatureId);
                        }
                    }}
                >
                    <MapboxGL.FillLayer
                        id="parking-zones-fill"
                        style={{
                            fillColor: ['get', 'lineColor'],
                            fillOpacity: 0.16,
                        }}
                    />
                    <MapboxGL.LineLayer
                        id="parking-zones-outline"
                        style={{
                            lineColor: ['get', 'lineColor'],
                            lineWidth: 1.6,
                            lineOpacity: 0.55,
                        }}
                    />
                    <MapboxGL.LineLayer
                        id="parking-zones-outline-highlight"
                        filter={['==', ['get', 'id'], selectedParkingZoneFeatureId ?? '']}
                        style={{
                            lineColor: ['get', 'lineColor'],
                            lineWidth: 5,
                            lineOpacity: 1,
                        }}
                    />
                </MapboxGL.ShapeSource>
            ) : null}

            <MapboxGL.ShapeSource
                id="parking-lots-source"
                shape={parkingLotsGeoJSON as any}
                onPress={(event) => {
                    const feature = event.features?.[0];
                    const lotId = feature?.properties?.lotId as string | undefined;
                    if (lotId) {
                        onParkingLotPress(lotId);
                    }
                }}
            >
                <MapboxGL.CircleLayer
                    id="parking-lots-circle"
                    style={{
                        circleRadius: ['case', ['==', ['get', 'isSelected'], 1], 16, 13],
                        circleColor: ['get', 'color'],
                        circleStrokeWidth: 2.5,
                        circleStrokeColor: ['case', ['==', ['get', 'isSelected'], 1], '#0F172A', '#FFFFFF'],
                        circlePitchAlignment: 'map',
                    }}
                />
                <MapboxGL.SymbolLayer
                    id="parking-lots-label"
                    style={{
                        textField: ['get', 'label'],
                        textSize: ['case', ['==', ['get', 'isSelected'], 1], 10, 8],
                        textColor: '#FFFFFF',
                        textAllowOverlap: true,
                        textIgnorePlacement: true,
                    }}
                />
            </MapboxGL.ShapeSource>
        </>
    );
};
