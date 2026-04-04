import { Alert, Linking, Platform } from 'react-native';

export type ExternalNavigationMode = 'driving' | 'walking';

type NavigationChoice = {
    key: 'google' | 'waze';
    label: string;
    appUrl: string | null;
    fallbackUrl: string;
};

const buildGoogleMapsWebUrl = (
    latitude: number,
    longitude: number,
    mode: ExternalNavigationMode,
) => `https://www.google.com/maps/dir/?api=1&destination=${latitude},${longitude}&travelmode=${mode}`;

const buildGoogleMapsAppUrl = (
    latitude: number,
    longitude: number,
    mode: ExternalNavigationMode,
) => Platform.select({
    ios: `comgooglemaps://?daddr=${latitude},${longitude}&directionsmode=${mode}`,
    android: `google.navigation:q=${latitude},${longitude}&mode=${mode === 'walking' ? 'w' : 'd'}`,
    default: null,
});

const buildWazeWebUrl = (latitude: number, longitude: number) =>
    `https://waze.com/ul?ll=${latitude},${longitude}&navigate=yes`;

const buildWazeAppUrl = (latitude: number, longitude: number) =>
    `waze://?ll=${latitude},${longitude}&navigate=yes`;

const openNavigationChoice = async ({ appUrl, fallbackUrl }: NavigationChoice): Promise<boolean> => {
    if (appUrl) {
        try {
            const supported = await Linking.canOpenURL(appUrl);
            if (supported) {
                await Linking.openURL(appUrl);
                return true;
            }
        } catch {
            // Fall through to the universal fallback URL below.
        }
    }

    try {
        await Linking.openURL(fallbackUrl);
        return true;
    } catch {
        return false;
    }
};

const buildNavigationChoices = (
    latitude: number,
    longitude: number,
    mode: ExternalNavigationMode,
): NavigationChoice[] => [
    {
        key: 'google',
        label: mode === 'walking' ? 'Google Maps' : 'Google Maps',
        appUrl: buildGoogleMapsAppUrl(latitude, longitude, mode),
        fallbackUrl: buildGoogleMapsWebUrl(latitude, longitude, mode),
    },
    {
        key: 'waze',
        label: mode === 'walking' ? 'Waze (кола)' : 'Waze',
        appUrl: buildWazeAppUrl(latitude, longitude),
        fallbackUrl: buildWazeWebUrl(latitude, longitude),
    },
];

const getNavigationPromptMessage = (mode: ExternalNavigationMode) => (
    mode === 'walking'
        ? 'Google Maps ще отвори пешеходен маршрут, а Waze ще отвори автомобилна навигация.'
        : 'Избери приложение за навигация.'
);

export const openExternalNavigation = async (
    latitude: number,
    longitude: number,
    mode: ExternalNavigationMode = 'driving',
): Promise<boolean> => {
    const choices = buildNavigationChoices(latitude, longitude, mode);

    if (Platform.OS === 'web') {
        return openNavigationChoice(choices[0]);
    }

    return new Promise<boolean>((resolve) => {
        let settled = false;
        const resolveOnce = (value: boolean) => {
            if (settled) {
                return;
            }

            settled = true;
            resolve(value);
        };

        Alert.alert(
            'Навигация',
            getNavigationPromptMessage(mode),
            [
                ...choices.map((choice) => ({
                    text: choice.label,
                    onPress: () => {
                        void openNavigationChoice(choice).then(resolveOnce);
                    },
                })),
                {
                    text: 'Отказ',
                    style: 'cancel' as const,
                    onPress: () => resolveOnce(false),
                },
            ],
            {
                cancelable: true,
                onDismiss: () => resolveOnce(false),
            },
        );
    });
};

export const openExternalDrivingNavigation = async (latitude: number, longitude: number): Promise<boolean> => (
    openExternalNavigation(latitude, longitude, 'driving')
);

export const openExternalWalkingNavigation = async (latitude: number, longitude: number): Promise<boolean> => (
    openExternalNavigation(latitude, longitude, 'walking')
);
