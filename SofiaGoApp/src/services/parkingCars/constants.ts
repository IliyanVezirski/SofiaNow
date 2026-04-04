export const PARKING_CARS_STORAGE_KEY = '@sofiago:parking:cars:v1';
export const PARKING_CARS_STORAGE_KEY_BACKUP = '@sofiago:parking:cars:backup';
export const LEGACY_PARKING_CARS_STORAGE_KEYS = [
    '@sofiago:parking:cars',
    '@sofiaGo:parking:cars:v1',
    '@sofiaGo:parking:cars',
    '@sofianow:parking:cars:v1',
    '@sofianow:parking:cars',
] as const;
export const PLATE_SEPARATOR_REGEX = /[\s\-–—_.·•]/;
export const CYRILLIC_PLATE_REGEX = /[А-Яа-я]/;
export const MAX_PARKING_CAR_NAME_LENGTH = 24;
export const PARKING_CAR_ID_PREFIX = 'parking-car';
export const PARKING_CAR_ID_RANDOM_SLICE_START = 2;
export const PARKING_CAR_ID_RANDOM_SLICE_END = 8;
