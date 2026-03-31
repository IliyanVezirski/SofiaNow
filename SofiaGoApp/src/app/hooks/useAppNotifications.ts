import { AppState, Alert } from 'react-native';
import { useCallback, useEffect, useRef, type Dispatch, type SetStateAction } from 'react';
import * as Notifications from 'expo-notifications';
import * as NavigationBar from 'expo-navigation-bar';

import {
    handleRemindAgainFromNotification,
    initializeTransitArrivalNotifications,
    refreshTransitArrivalReminders,
    TRANSIT_ARRIVAL_NOTIFICATION_ACTION_REMIND_AGAIN,
    ensureTransitReminderBackgroundTaskRegistered,
    FAVORITE_COMMUTE_ROUTE_NOTIFICATION_ACTION_SHOW_ROUTE,
} from '../../services/notifications';
import { reconcileFavoriteCommuteNotifications } from '../../services/places/repository';
import type { OpenedNotification } from '../types';

type Params = {
    setOpenedNotification: Dispatch<SetStateAction<OpenedNotification | null>>;
    showFavoriteRouteFromNotification: (favoriteId: string | null | undefined) => Promise<boolean>;
};

const extractFavoriteIdFromData = (data: Record<string, unknown> | undefined) => String((data as { favoriteId?: unknown } | undefined)?.favoriteId || '').trim();

export const useAppNotifications = ({
    setOpenedNotification,
    showFavoriteRouteFromNotification,
}: Params) => {
    const lastHandledNotificationIdRef = useRef<string | null>(null);

    const openNotificationModal = useCallback((response: Notifications.NotificationResponse | null) => {
        const identifier = response?.notification.request.identifier;
        if (!identifier || lastHandledNotificationIdRef.current === identifier) {
            return;
        }

        lastHandledNotificationIdRef.current = identifier;
        const { title, body } = response.notification.request.content;
        const data = response.notification.request.content.data as { favoriteId?: unknown; type?: unknown } | undefined;
        const favoriteId = data?.type === 'favorite-commute-route' ? String(data.favoriteId || '').trim() : '';

        setOpenedNotification({
            id: identifier,
            title: String(title || 'Уведомление'),
            body: String(body || 'Няма допълнителна информация.'),
            favoriteId: favoriteId || null,
            canShowRoute: !!favoriteId,
        });
    }, [setOpenedNotification]);

    useEffect(() => {
        void NavigationBar.setVisibilityAsync('hidden');
        void initializeTransitArrivalNotifications();
        void ensureTransitReminderBackgroundTaskRegistered();
        void refreshTransitArrivalReminders();
        void reconcileFavoriteCommuteNotifications();

        void Notifications.getLastNotificationResponseAsync()
            .then(async (response) => {
                if (!response) {
                    return;
                }

                const data = response.notification.request.content.data as Record<string, unknown> | undefined;
                const favoriteId = extractFavoriteIdFromData(data);
                if (response.actionIdentifier === FAVORITE_COMMUTE_ROUTE_NOTIFICATION_ACTION_SHOW_ROUTE) {
                    await showFavoriteRouteFromNotification(favoriteId);
                    await Notifications.clearLastNotificationResponseAsync();
                    return;
                }

                if (response.actionIdentifier === TRANSIT_ARRIVAL_NOTIFICATION_ACTION_REMIND_AGAIN && data) {
                    const result = await handleRemindAgainFromNotification(data);
                    Alert.alert(result.ok ? 'Готово' : 'Грешка', result.message);
                    await Notifications.clearLastNotificationResponseAsync();
                    return;
                }

                openNotificationModal(response);
                await Notifications.clearLastNotificationResponseAsync();
            })
            .catch(() => undefined);

        const notificationResponseSubscription = Notifications.addNotificationResponseReceivedListener((response) => {
            void (async () => {
                const data = response.notification.request.content.data as Record<string, unknown> | undefined;
                const favoriteId = extractFavoriteIdFromData(data);
                if (response.actionIdentifier === FAVORITE_COMMUTE_ROUTE_NOTIFICATION_ACTION_SHOW_ROUTE) {
                    void showFavoriteRouteFromNotification(favoriteId).finally(() => {
                        void Notifications.clearLastNotificationResponseAsync().catch(() => undefined);
                    });
                    return;
                }

                if (response.actionIdentifier === TRANSIT_ARRIVAL_NOTIFICATION_ACTION_REMIND_AGAIN && data) {
                    void handleRemindAgainFromNotification(data).then((result) => {
                        Alert.alert(result.ok ? 'Готово' : 'Грешка', result.message);
                    }).finally(() => {
                        void Notifications.clearLastNotificationResponseAsync().catch(() => undefined);
                    });
                    return;
                }

                openNotificationModal(response);
                void Notifications.clearLastNotificationResponseAsync().catch(() => undefined);
            })();
        });

        const appStateSubscription = AppState.addEventListener('change', (nextState) => {
            if (nextState === 'active') {
                void refreshTransitArrivalReminders();
                void reconcileFavoriteCommuteNotifications();
            }
        });

        return () => {
            notificationResponseSubscription.remove();
            appStateSubscription.remove();
        };
    }, [openNotificationModal, showFavoriteRouteFromNotification]);
};
