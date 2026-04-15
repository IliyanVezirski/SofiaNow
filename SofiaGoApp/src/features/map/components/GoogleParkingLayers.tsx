import React from 'react';
import { Text, View } from 'react-native';
import { Marker, Polygon } from 'react-native-maps';

import { CATEGORY_META } from '../../parkingZones/components/ParkingLotsModal';
import type { ParkingLot } from '../../parkingZones/types/parkingLots';
import type { ParkingZoneFeatureCollection } from '../../parkingZones/types';
import { getPolygonRings, toMapCoordinate } from '../utils/mapScreen';

const PARKING_LOT_LABELS: Record<string, string> = {
    buffer: 'БП',
    underground: 'ПП',
    'multi-storey': 'МП',
    airport: '✈',
    surface: 'П',
    commercial: 'ТП',
    impound: 'НП',
    private: 'ЧП',
};

interface GoogleParkingLayersProps {
    isParkingMode: boolean;
    parkingLots: ParkingLot[];
    selectedParkingLotId: string | null;
    selectedParkingZoneFeatureId?: string | null;
    visibleParkingZonesFeatureCollection: ParkingZoneFeatureCollection | null;
    onParkingZonePress: (zoneFeatureId: string) => void;
    onParkingLotPress: (lotId: string) => void;
}

export const GoogleParkingLayers: React.FC<GoogleParkingLayersProps> = ({
    isParkingMode,
    parkingLots,
    selectedParkingLotId,
    selectedParkingZoneFeatureId = null,
    visibleParkingZonesFeatureCollection,
    onParkingZonePress,
    onParkingLotPress,
}) => {
    return (
        <>
            {visibleParkingZonesFeatureCollection?.features.map((feature) => (
                <React.Fragment key={`parking-zone-${feature.properties.id}`}>
                    {getPolygonRings(feature.geometry).map((ring, index) => (
                        <Polygon
                            key={`parking-zone-${feature.properties.id}-${index}`}
                            coordinates={ring.map(toMapCoordinate)}
                            strokeColor={isParkingMode ? feature.properties.lineColor : 'rgba(0,0,0,0)'}
                            strokeWidth={isParkingMode ? 1.8 : 0}
                            fillColor={isParkingMode ? `${feature.properties.lineColor}2E` : 'rgba(0,0,0,0)'}
                            tappable={isParkingMode}
                            zIndex={1}
                            onPress={() => onParkingZonePress(feature.properties.id)}
                        />
                    ))}
                </React.Fragment>
            ))}

            {visibleParkingZonesFeatureCollection?.features.map((feature) => {
                const isHighlighted = isParkingMode && feature.properties.id === selectedParkingZoneFeatureId;
                return (
                    <React.Fragment key={`parking-zone-highlight-${feature.properties.id}`}>
                        {getPolygonRings(feature.geometry).map((ring, index) => (
                            <Polygon
                                key={`parking-zone-highlight-${feature.properties.id}-${index}`}
                                coordinates={ring.map(toMapCoordinate)}
                                strokeColor={isHighlighted ? feature.properties.lineColor : 'rgba(0,0,0,0)'}
                                strokeWidth={isHighlighted ? 5 : 0}
                                fillColor="rgba(0,0,0,0)"
                                zIndex={3}
                            />
                        ))}
                    </React.Fragment>
                );
            })}

            {parkingLots.map((lot) => {
                const meta = CATEGORY_META[lot.category];
                const isSelected = lot.id === selectedParkingLotId;
                const label = PARKING_LOT_LABELS[lot.category] ?? 'P';

                return (
                    <Marker
                        key={`parking-lot-${lot.id}`}
                        coordinate={{ latitude: lot.latitude, longitude: lot.longitude }}
                        anchor={{ x: 0.5, y: 0.5 }}
                        onPress={() => onParkingLotPress(lot.id)}
                    >
                        <View style={{ alignItems: 'center', justifyContent: 'center', width: isSelected ? 32 : 28, height: isSelected ? 32 : 28, borderRadius: isSelected ? 16 : 14, backgroundColor: meta?.color ?? '#64748B', borderWidth: 2.5, borderColor: isSelected ? '#0F172A' : '#FFFFFF' }}>
                            <Text style={{ color: '#FFFFFF', fontSize: isSelected ? 10 : 8, fontWeight: '800' }}>{label}</Text>
                        </View>
                    </Marker>
                );
            })}
        </>
    );
};
