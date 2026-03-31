import type { TripRouteGeoJSON } from '../../features/tripPlanner/utils/routeGeoJson';
import type { Itinerary } from '../transit';

export interface PlaceSearchResult {
    id: string;
    name: string;
    subtitle: string;
    latitude: number;
    longitude: number;
}

export type FavoritePresetKey = 'home' | 'work';
export type FavoriteCommuteWeekday = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export interface FavoriteLinePreference {
    line: string;
    enabled: boolean;
    notificationsEnabled: boolean;
}

export interface FavoriteCommuteRouteStop {
    name: string;
    stopCode: string | null;
    time: string | null;
}

export interface FavoriteCommuteRouteLineTab {
    id: string;
    line: string;
    label: string;
    mode: string;
    stops: FavoriteCommuteRouteStop[];
}

export interface FavoriteCommutePlan {
    originName: string;
    originLatitude: number | null;
    originLongitude: number | null;
    destinationFavoriteId: string | null;
    destinationFavoriteName: string | null;
    planType: '0' | '1' | '2';
    routeDate: string | null;
    routeTime: string | null;
    arriveBy: boolean;
    routeStartTime: string | null;
    reminderOffsetMinutes: number | null;
    reminderWeekdays: FavoriteCommuteWeekday[];
    notificationWeekdays: FavoriteCommuteWeekday[];
    firstTransitStopId: string | null;
    firstTransitStopName: string | null;
    firstTransitLine: string | null;
    firstTransitStopOffsetMinutes: number | null;
    walkDurationSeconds: number | null;
    walkDistanceMeters: number | null;
    itinerary: Itinerary | null;
    routeGeoJson: TripRouteGeoJSON | null;
    itineraryIndex: number;
    itinerarySummary: string;
    routeLabel: string;
    transportLabels?: string[];
    routeLineTabs?: FavoriteCommuteRouteLineTab[];
    reminderTime: string | null;
    notificationEnabled: boolean;
    notificationIds: string[];
    notificationScheduleVersion: number | null;
    lastPlannedAt: number | null;
}

export interface FavoritePlace {
    id: string;
    name: string;
    latitude: number | null;
    longitude: number | null;
    createdAtUnix: number;
    presetKey: FavoritePresetKey | null;
    selectedStopId: string | null;
    selectedStopName: string | null;
    selectedLines: FavoriteLinePreference[];
    personalNotificationLeadMinutes: number | null;
    defaultCommute: FavoriteCommutePlan | null;
}

export interface StoredFavoriteCommuteReminder {
    favoriteId: string;
    favoriteName: string;
    routeLabel: string;
    itinerarySummary: string;
    reminderTime: string;
    routeStartTime: string | null;
    reminderOffsetMinutes: number | null;
    arriveBy: boolean;
    reminderWeekdays: FavoriteCommuteWeekday[];
    notificationWeekdays: FavoriteCommuteWeekday[];
    notificationIds: string[];
    lastPlannedAt: number | null;
}
