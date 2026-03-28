import React from 'react';
import { View } from 'react-native';

interface AdBannerProps {
    isPremium: boolean;
}

export const AdBanner: React.FC<AdBannerProps> = ({ isPremium }) => {
    if (isPremium) {
        return null;
    }

    return <View />;
};
