import React from 'react';
import MapboxGL from '@maplibre/maplibre-react-native';

interface MapboxMapCanvasProps {
    bounds?: {
        ne: [number, number];
        sw: [number, number];
        paddingTop: number;
        paddingBottom: number;
        paddingLeft: number;
        paddingRight: number;
    };
    centerCoordinate?: [number, number];
    children?: React.ReactNode;
    mapStyle: object | string;
    style: object;
    userLocationGeoJSON: object | null;
    zoomLevel?: number;
    onLongPress: (event: any) => void;
    onMapPress: (event: any) => void;
    onRegionDidChange: (event: any) => void;
}

export const MapboxMapCanvas: React.FC<MapboxMapCanvasProps> = ({
    bounds,
    centerCoordinate,
    children,
    mapStyle,
    style,
    userLocationGeoJSON,
    zoomLevel,
    onLongPress,
    onMapPress,
    onRegionDidChange,
}) => (
    <MapboxGL.MapView
        style={style}
        mapStyle={mapStyle}
        surfaceView={false}
        logoEnabled={false}
        compassEnabled={false}
        onPress={onMapPress}
        onRegionDidChange={onRegionDidChange}
        onLongPress={onLongPress}
    >
        <MapboxGL.Camera
            zoomLevel={zoomLevel}
            centerCoordinate={centerCoordinate}
            bounds={bounds}
            animationDuration={bounds ? 800 : 0}
        />
        {userLocationGeoJSON ? (
            <MapboxGL.ShapeSource id="user-location-source" shape={userLocationGeoJSON as any}>
                <MapboxGL.CircleLayer
                    id="user-location-outer"
                    style={{ circleRadius: 12, circleColor: '#FFFFFF', circleOpacity: 0.9 }}
                />
                <MapboxGL.CircleLayer
                    id="user-location-inner"
                    style={{ circleRadius: 10, circleColor: '#007AFF' }}
                />
            </MapboxGL.ShapeSource>
        ) : null}
        {children}
    </MapboxGL.MapView>
);
