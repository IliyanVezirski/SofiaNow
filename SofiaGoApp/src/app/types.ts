import type { Ionicons } from '@expo/vector-icons';
import type { MapExperienceMode } from '../features/map/components/MapModeSwitcher';

export type BottomTab = 'map' | 'schedules' | 'planner' | 'nearby';

export type OpenedNotification = {
    id: string;
    title: string;
    body: string;
    favoriteId: string | null;
    canShowRoute: boolean;
    canRemindAgain: boolean;
    reminderData: Record<string, unknown> | null;
};

export type HomeActionButton = {
    key: string;
    label: string;
    icon: keyof typeof Ionicons.glyphMap;
    onPress: () => void;
    active?: boolean;
};

export type ParkingActionKey = 'zone' | 'pay' | 'lots' | 'search' | 'cars';

export type MapCameraBounds = {
    ne: [number, number];
    sw: [number, number];
};

export const DEFAULT_MAP_EXPERIENCE_MODE: MapExperienceMode = 'transit';
export const DEFAULT_PARKING_ACTION_KEY: ParkingActionKey = 'pay';
