import React from 'react';
import { Polygon } from 'react-native-maps';

import type { EcoParksFeatureCollection } from '../../eco/types';
import { getPolygonRings, toMapCoordinate } from '../utils/mapScreen';

type Props = {
    focusedParkId?: string | null;
    parksFeatureCollection: EcoParksFeatureCollection | null;
    shouldShowParks: boolean;
};

export const GoogleEcoLayers: React.FC<Props> = ({
    focusedParkId = null,
    parksFeatureCollection,
    shouldShowParks,
}) => {
    if (!shouldShowParks || !parksFeatureCollection?.features.length) {
        return null;
    }

    return (
        <>
            {parksFeatureCollection.features.map((feature) => {
                const isFocused = feature.id === focusedParkId;

                return (
                <React.Fragment key={`eco-park-${feature.id}`}>
                    {getPolygonRings(feature.geometry).map((ring, index) => (
                        <Polygon
                            key={`eco-park-${feature.id}-${index}`}
                            coordinates={ring.map(toMapCoordinate)}
                            strokeColor={feature.properties.strokeColor}
                            strokeWidth={isFocused ? 2.6 : 1.4}
                            fillColor={`${feature.properties.fillColor}${isFocused ? '52' : '38'}`}
                            tappable={false}
                            zIndex={isFocused ? 4 : 2}
                        />
                    ))}
                </React.Fragment>
                );
            })}
        </>
    );
};
