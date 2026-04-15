const IS_DEV = process.env.APP_VARIANT === 'development';

const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY || 'AIzaSyA-dURfwNmQRO2NLrfgOglwEFtmiwTqD8Y';

export default {
  expo: {
    owner: 'iliaynski90',
    name: IS_DEV ? 'SofiaNow (Dev)' : 'SofiaNow',
    slug: 'SofiaGoApp',
    version: '1.2.0',
    orientation: 'portrait',
    icon: './assets/app-icon-new.png',
    userInterfaceStyle: 'light',
    splash: {
      image: './assets/splash.png',
      resizeMode: 'contain',
      backgroundColor: '#ffffff',
    },
    ios: {
      supportsTablet: true,
      infoPlist: {
        LSApplicationQueriesSchemes: ['comgooglemaps', 'waze'],
      },
    },
    android: {
      adaptiveIcon: {
        foregroundImage: './assets/app-icon-new.png',
        backgroundColor: '#ffffff',
      },
      config: {
        googleMaps: {
          apiKey: GOOGLE_MAPS_API_KEY,
        },
      },
      notification: {
        icon: './assets/android-icon-monochrome.png',
        color: '#0F766E',
      },
      package: 'com.iliyanvezirski.SofiaGoApp',
      versionCode: 12,
    },
    web: {
      favicon: './assets/app-icon-new.png',
    },
    plugins: [
      'expo-localization',
      [
        'expo-notifications',
        {
          icon: './assets/android-icon-monochrome.png',
          color: '#0F766E',
          defaultChannel: 'transit-arrivals-v2',
        },
      ],
      '@maplibre/maplibre-react-native',
      'expo-asset',
      'expo-font',
      'expo-background-task',
      'react-native-iap',
    ],
    extra: {
      eas: {
        projectId: '7d3194fc-e8b2-4dc1-8304-3dac9f853f79',
      },
    },
  },
};
