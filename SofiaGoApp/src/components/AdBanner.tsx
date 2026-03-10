import React from 'react';
import { Platform, View, StyleSheet } from 'react-native';
import { BannerAd, BannerAdSize, TestIds } from 'react-native-google-mobile-ads';

const adUnitId = __DEV__ ? TestIds.BANNER : (Platform.OS === 'ios' ? 'ca-app-pub-placeholder/ios' : 'ca-app-pub-placeholder/android');

interface AdBannerProps {
    isPremium: boolean;
}

export const AdBanner: React.FC<AdBannerProps> = ({ isPremium }) => {
    if (isPremium) {
        return null; // Premium users don't see ads
    }

    return (
        <View style={styles.container}>
            <BannerAd
                unitId={adUnitId}
                size={BannerAdSize.ANCHORED_ADAPTIVE_BANNER}
                requestOptions={{
                    requestNonPersonalizedAdsOnly: true,
                }}
            />
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        alignItems: 'center',
        justifyContent: 'center',
        width: '100%',
        paddingVertical: 8,
        backgroundColor: '#fff',
    }
});
