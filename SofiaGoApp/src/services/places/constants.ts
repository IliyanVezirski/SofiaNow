import type { FavoriteCommuteWeekday, FavoritePresetKey } from './types';

export const FAVORITE_COMMUTE_NOTIFICATION_SCHEDULE_VERSION = 5;
export const DEFAULT_PRESET_ORDER: FavoritePresetKey[] = ['home', 'work'];
export const FAVORITE_COMMUTE_WEEKDAY_OPTIONS: Array<{ value: FavoriteCommuteWeekday; shortLabel: string; fullLabel: string }> = [
    { value: 2, shortLabel: 'Пн', fullLabel: 'понеделник' },
    { value: 3, shortLabel: 'Вт', fullLabel: 'вторник' },
    { value: 4, shortLabel: 'Ср', fullLabel: 'сряда' },
    { value: 5, shortLabel: 'Чт', fullLabel: 'четвъртък' },
    { value: 6, shortLabel: 'Пт', fullLabel: 'петък' },
    { value: 7, shortLabel: 'Сб', fullLabel: 'събота' },
    { value: 1, shortLabel: 'Нд', fullLabel: 'неделя' },
];
export const DEFAULT_COMMUTE_WEEKDAYS: FavoriteCommuteWeekday[] = FAVORITE_COMMUTE_WEEKDAY_OPTIONS.map((option) => option.value);
