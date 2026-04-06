import React, { forwardRef, useImperativeHandle, useRef } from 'react';
import MapboxGL, { type CameraRef } from '@maplibre/maplibre-react-native';

export interface MapboxMapCameraHandle {
    setCamera: CameraRef['setCamera'];
    fitBounds: CameraRef['fitBounds'];
    flyTo: CameraRef['flyTo'];
    moveTo: CameraRef['moveTo'];
}

interface MapboxMapCanvasProps {
    children?: React.ReactNode;
    defaultCenterCoordinate: [number, number];
    defaultZoomLevel: number;
    mapStyle: object | string;
    style: object;
    userLocationGeoJSON: object | null;
    onLongPress: (event: any) => void;
    onMapPress: (event: any) => void;
    onRegionDidChange: (event: any) => void;
}

export const MapboxMapCanvas = forwardRef<MapboxMapCameraHandle, MapboxMapCanvasProps>(({
    children,
    defaultCenterCoordinate,
    defaultZoomLevel,
    mapStyle,
    style,
    userLocationGeoJSON,
    onLongPress,
    onMapPress,
    onRegionDidChange,
}, ref) => {
    const cameraRef = useRef<CameraRef>(null);

    useImperativeHandle(ref, () => ({
        setCamera: (config) => cameraRef.current?.setCamera(config),
        fitBounds: (ne, sw, padding, duration) => cameraRef.current?.fitBounds(ne, sw, padding, duration),
        flyTo: (coords, duration) => cameraRef.current?.flyTo(coords, duration),
        moveTo: (coords, duration) => cameraRef.current?.moveTo(coords, duration),
    }), []);

    return (
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
                ref={cameraRef}
                defaultSettings={{
                    centerCoordinate: defaultCenterCoordinate,
                    zoomLevel: defaultZoomLevel,
                }}
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
});
