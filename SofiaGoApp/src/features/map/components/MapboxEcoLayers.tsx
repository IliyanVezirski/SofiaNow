import React from 'react';
import MapboxGL from '@maplibre/maplibre-react-native';

import type { EcoParksFeatureCollection } from '../../eco/types';

type Props = {
    focusedParkId?: string | null;
    parksFeatureCollection: EcoParksFeatureCollection | null;
    shouldShowParks: boolean;
};

export const MapboxEcoLayers: React.FC<Props> = ({
    focusedParkId = null,
    parksFeatureCollection,
    shouldShowParks,
}) => {
    if (!shouldShowParks || !parksFeatureCollection?.features.length) {
        return null;
    }

    const focusedParkNumericId = Number(focusedParkId);
    const hasFocusedPark = Number.isFinite(focusedParkNumericId);

    return (
        <MapboxGL.ShapeSource
            id="eco-parks-source"
            shape={parksFeatureCollection as any}
        >
            <MapboxGL.FillLayer
                id="eco-parks-fill"
                style={{
                    fillColor: ['get', 'fillColor'],
                    fillOpacity: hasFocusedPark
                        ? ['case', ['==', ['get', 'parkId'], focusedParkNumericId], 0.34, 0.22]
                        : 0.22,
                }}
            />
            <MapboxGL.LineLayer
                id="eco-parks-outline"
                style={{
                    lineColor: ['get', 'strokeColor'],
                    lineWidth: hasFocusedPark
                        ? ['case', ['==', ['get', 'parkId'], focusedParkNumericId], 2.6, 1.4]
                        : 1.4,
                    lineOpacity: hasFocusedPark
                        ? ['case', ['==', ['get', 'parkId'], focusedParkNumericId], 1, 0.85]
                        : 0.85,
                }}
            />
        </MapboxGL.ShapeSource>
    );
};
