import React from 'react';
import GoogleMapView, { PROVIDER_GOOGLE, Region } from 'react-native-maps';

interface GoogleMapCanvasProps {
    children?: React.ReactNode;
    googleMapRef: React.RefObject<GoogleMapView | null>;
    initialRegion: Region;
    showsTraffic: boolean;
    showsUserLocation: boolean;
    style: object;
    onLongPress: (event: any) => void;
    onMapPress: (event: any) => void;
    onMapReady: () => void;
    onRegionChangeComplete: (region: Region) => void;
}

export const GoogleMapCanvas: React.FC<GoogleMapCanvasProps> = ({
    children,
    googleMapRef,
    initialRegion,
    showsTraffic,
    showsUserLocation,
    style,
    onLongPress,
    onMapPress,
    onMapReady,
    onRegionChangeComplete,
}) => (
    <GoogleMapView
        ref={googleMapRef}
        style={style}
        provider={PROVIDER_GOOGLE}
        initialRegion={initialRegion}
        mapType="standard"
        toolbarEnabled={false}
        showsCompass={false}
        showsUserLocation={showsUserLocation}
        showsMyLocationButton={false}
        showsBuildings
        showsIndoors
        showsTraffic={showsTraffic}
        onMapReady={onMapReady}
        onPress={onMapPress}
        onLongPress={onLongPress}
        onRegionChangeComplete={onRegionChangeComplete}
    >
        {children}
    </GoogleMapView>
);
