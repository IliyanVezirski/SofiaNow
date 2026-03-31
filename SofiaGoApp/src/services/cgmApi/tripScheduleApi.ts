import { Platform } from 'react-native';
import { DayType, StaticScheduleEntry } from '../../types/vehicles';
import { AvailableLine, LineRouteGeometry, LineRouteDirection } from '../stopsApi';
import { collapseContainedDirections, containsStopSequence } from '../routeDirectionMerge';
import { VehicleType, getGtfsRouteType } from '../transitUtils';

const TRIP_BASE_URL = 'https://www.sofiatraffic.bg';
const PUBLIC_TRANSPORT_URL = `${TRIP_BASE_URL}/bg/public-transport`;
const TRIP_LINES_URL = `${TRIP_BASE_URL}/bg/trip/getLines`;
const TRIP_SCHEDULE_URL = `${TRIP_BASE_URL}/bg/trip/getSchedule`;
const SESSION_TTL_MS = 10 * 60 * 1000;

type RawTripLine = {
    line_id: number;
    name: string;
    ext_id: string;
    type: number;
    color?: string;
    icon?: string;
};

type RawTripTime = {
    id?: number | string;
    route_id?: number | string;
    code?: string;
    weekend?: number;
    time?: string;
};

type RawTripStop = {
    id: number;
    code?: string;
    name?: string;
    latitude?: string;
    longitude?: string;
    times?: RawTripTime[];
};

type RawTripSegment = {
    route_id: number;
    sequence: number;
    stop?: RawTripStop | null;
};

type RawTripRoute = {
    id: number;
    name?: string;
    is_weekend?: number;
    segments?: RawTripSegment[];
};

type RawTripSchedule = {
    line?: RawTripLine;
    routes?: RawTripRoute[];
};

export interface TripApiStopScheduleEntry extends StaticScheduleEntry {
    dayType: DayType;
}

export interface TripApiStop {
    id: string;
    apiStopId: string;
    name: string;
    latitude: number;
    longitude: number;
    scheduleEntries: TripApiStopScheduleEntry[];
}

export interface TripApiDirection {
    id: string;
    name: string;
    availableDayTypes: DayType[];
    stops: TripApiStop[];
}

export interface TripApiLineSchedule {
    line: string;
    routeId: string;
    type: VehicleType;
    isNight: boolean;
    directions: TripApiDirection[];
}

let sessionCsrfToken: string | null = null;
let sessionFetchedAt = 0;

const KEY_DIRECTION_STOP_CODES = new Set([1006, 1038, 2454, 6435, 6436]);

const normalizeText = (value: string) => value
    .trim()
    .toLocaleUpperCase('bg-BG')
    .replace(/\s+/g, ' ')
    .replace(/[.\-–—,;:()]/g, '');

const matchesNormalizedText = (candidate: string, targets: string[]) => {
    const normalizedCandidate = normalizeText(candidate || '');
    if (!normalizedCandidate || targets.length === 0) {
        return false;
    }

    return targets.some((target) => (
        normalizedCandidate === target
        || normalizedCandidate.includes(target)
        || target.includes(normalizedCandidate)
    ));
};

const sortLines = (lines: AvailableLine[]) => lines.sort((left, right) => (
    left.line.localeCompare(right.line, 'bg', { numeric: true })
));

const inferVehicleTypeFromTripApi = (rawType: number | undefined, extId: string, line: string): VehicleType => {
    switch (rawType) {
        case 2:
            return 'tram';
        case 3:
            return 'subway';
        case 4:
            return 'trolley';
        case 1:
        default:
            return getGtfsRouteType(extId) || 'bus';
    }
};

const parseTimeToMinutes = (value: string | undefined) => {
    if (!value) return null;
    const parts = value.split(':');
    if (parts.length < 2) return null;
    const hours = Number(parts[0]);
    const minutes = Number(parts[1]);
    if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
    return hours * 60 + minutes;
};

const parseCoordinate = (value: string | undefined) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
};

const mapWeekendFlagToDayType = (weekendFlag?: number): DayType => (weekendFlag ? 'h' : 'w');

type VariantStopTime = {
    id: string;
    code: string;
    isWeekend: boolean;
    times: Array<number | null>;
};

type RouteVariant = {
    routeIds: string[];
    stops: string[];
    stopTimes: VariantStopTime[];
};

type DirectionAccumulator = {
    id: string;
    name: string;
    availableDayTypes: Set<DayType>;
    stops: Array<TripApiStop & { scheduleEntryIndex: Map<string, number> }>;
    stopIndex: Map<string, TripApiStop & { scheduleEntryIndex: Map<string, number> }>;
};

const getNormalizedStopCode = (stop: RawTripStop | null | undefined) => {
    const code = String(stop?.code || stop?.id || '').trim();
    return code || null;
};

const getNormalizedVariantId = (value: number | string | undefined) => {
    const normalized = String(value ?? '').trim();
    return normalized || null;
};

const generateFromToText = (stops: TripApiStop[]) => {
    const names = stops
        .map((stop, index) => {
            const numericCode = Number(stop.id);
            const shouldInclude = index === 0
                || index === stops.length - 1
                || KEY_DIRECTION_STOP_CODES.has(numericCode);
            return shouldInclude ? stop.name.trim() : null;
        })
        .filter((name): name is string => Boolean(name))
        .filter((name, index, allNames) => allNames.indexOf(name) === index);

    return names.join(' => ') || stops[stops.length - 1]?.name || 'Посока';
};

const getPartialTimeKind = (masterStops: string[], candidateStops: string[]): 'start' | 'final' | null => {
    if (!containsStopSequence(masterStops, candidateStops)) {
        return null;
    }

    const firstMasterIndex = masterStops.indexOf(candidateStops[0]);
    const lastMasterIndex = masterStops.indexOf(candidateStops[candidateStops.length - 1]);

    if (firstMasterIndex > 0) {
        return 'start';
    }

    if (lastMasterIndex !== masterStops.length - 1) {
        return 'final';
    }

    return null;
};

const mergeStopScheduleEntriesIntoDirection = (master: TripApiDirection, candidate: TripApiDirection) => {
    const masterStopsById = new Map(master.stops.map((stop) => [stop.id, stop]));
    const availableDayTypes = new Set<DayType>(master.availableDayTypes);
    const partialTimeKind = getPartialTimeKind(
        master.stops.map((stop) => stop.id),
        candidate.stops.map((stop) => stop.id),
    );

    candidate.availableDayTypes.forEach((dayType) => {
        availableDayTypes.add(dayType);
    });

    candidate.stops.forEach((candidateStop) => {
        const masterStop = masterStopsById.get(candidateStop.id);
        if (!masterStop) {
            return;
        }

        const mergedEntries = new Map<string, TripApiStopScheduleEntry>();

        masterStop.scheduleEntries.forEach((entry) => {
            mergedEntries.set(`${entry.dayType}:${master.id}`, {
                ...entry,
                destination: master.name,
                routeId: master.id,
                times: [...entry.times],
                partialTimeKinds: { ...(entry.partialTimeKinds || {}) },
            });
        });

        candidateStop.scheduleEntries.forEach((entry) => {
            const entryKey = `${entry.dayType}:${master.id}`;
            const existing = mergedEntries.get(entryKey);
            if (!existing) {
                mergedEntries.set(entryKey, {
                    ...entry,
                    destination: master.name,
                    routeId: master.id,
                    times: [...entry.times].sort((left, right) => left - right),
                    partialTimeKinds: partialTimeKind
                        ? Object.fromEntries(entry.times.map((time) => [String(time), partialTimeKind]))
                        : {},
                });
                return;
            }

            const mergedTimes = new Set(existing.times);
            entry.times.forEach((time) => mergedTimes.add(time));
            existing.times = Array.from(mergedTimes).sort((left, right) => left - right);

            if (partialTimeKind) {
                const partialTimeKinds = { ...(existing.partialTimeKinds || {}) };
                entry.times.forEach((time) => {
                    partialTimeKinds[String(time)] = partialTimeKind;
                });
                existing.partialTimeKinds = partialTimeKinds;
            }
        });

        masterStop.scheduleEntries = Array.from(mergedEntries.values()).sort((left, right) => {
            if (left.dayType !== right.dayType) {
                return left.dayType.localeCompare(right.dayType);
            }

            return left.destination.localeCompare(right.destination, 'bg');
        });
    });

    master.availableDayTypes = Array.from(availableDayTypes).sort();
};

const collapseShortDirections = (directions: TripApiDirection[]) => {
    return collapseContainedDirections(
        directions,
        (direction) => ({
            ...direction,
            availableDayTypes: [...direction.availableDayTypes],
            stops: direction.stops.map((stop) => ({
                ...stop,
                scheduleEntries: stop.scheduleEntries.map((entry) => ({
                    ...entry,
                    times: [...entry.times],
                })),
            })),
        }),
        mergeStopScheduleEntriesIntoDirection,
    );
};

const generateRouteVariants = (segments: RawTripSegment[]) => {
    const routeIds: string[] = [];
    const routeIdsBySequence = new Map<number, Set<string>>();

    segments.forEach((segment) => {
        const segmentRouteIds = new Set(
            (segment.stop?.times || [])
                .map((time) => getNormalizedVariantId(time.route_id ?? segment.route_id))
                .filter((value): value is string => Boolean(value)),
        );

        routeIdsBySequence.set(segment.sequence, segmentRouteIds);
        segmentRouteIds.forEach((routeId) => {
            if (!routeIds.includes(routeId)) {
                routeIds.push(routeId);
            }
        });
    });

    return routeIds.map<RouteVariant>((routeId) => ({
        routeIds: [routeId],
        stops: segments
            .filter((segment) => routeIdsBySequence.get(segment.sequence)?.has(routeId))
            .map((segment) => getNormalizedStopCode(segment.stop))
            .filter((value): value is string => Boolean(value)),
        stopTimes: [],
    }));
};

const mergePartialVariants = (variants: RouteVariant[]) => {
    if (variants.length <= 1) {
        return variants;
    }

    const lengths = variants.map((variant) => variant.stops.length);
    const masterIndex = lengths.indexOf(Math.max(...lengths));
    const master = variants[masterIndex];
    const indexesToRemove: number[] = [];

    variants.forEach((variant, variantIndex) => {
        if (variantIndex === masterIndex) {
            return;
        }

        if (master.stops.join(',').includes(variant.stops.join(','))) {
            master.routeIds.push(variant.routeIds[0]);
            indexesToRemove.unshift(variantIndex);
        }
    });

    indexesToRemove.forEach((index) => variants.splice(index, 1));
    return variants;
};

const processStopTimes = (variants: RouteVariant[], segments: RawTripSegment[]) => {
    variants.forEach((variant) => {
        variant.stopTimes = [];
    });

    segments.forEach((segment) => {
        const stopCode = getNormalizedStopCode(segment.stop);
        if (!stopCode) {
            return;
        }

        (segment.stop?.times || []).forEach((time, timeIndex) => {
            const routeVariantId = getNormalizedVariantId(time.route_id ?? segment.route_id);
            if (!routeVariantId) {
                return;
            }

            const variant = variants.find((candidate) => candidate.routeIds.includes(routeVariantId));
            if (!variant) {
                return;
            }

            const stopIndex = variant.stops.indexOf(stopCode);
            if (stopIndex === -1) {
                return;
            }

            const timeId = String(
                time.id
                ?? `${routeVariantId}:${time.code || ''}:${time.weekend ?? 0}:${time.time || ''}:${segment.sequence}:${timeIndex}`,
            );
            let timeObject = variant.stopTimes.find((candidate) => candidate.id === timeId);
            if (!timeObject) {
                timeObject = {
                    id: timeId,
                    code: String(time.code || ''),
                    isWeekend: time.weekend === 1,
                    times: [],
                };
                variant.stopTimes.push(timeObject);
            }

            const minutes = parseTimeToMinutes(time.time);
            if (minutes == null) {
                return;
            }

            timeObject.times[stopIndex] = minutes;
        });
    });
};

const getOrCreateDirection = (
    directionMap: Map<string, DirectionAccumulator>,
    directionId: string,
    directionName: string,
) => {
    let direction = directionMap.get(directionId);
    if (!direction) {
        direction = {
            id: directionId,
            name: directionName,
            availableDayTypes: new Set<DayType>(),
            stops: [],
            stopIndex: new Map(),
        };
        directionMap.set(directionId, direction);
    }

    return direction;
};

const buildTripApiHeaders = (csrfToken: string) => ({
    Accept: 'application/json, text/plain, */*',
    'Content-Type': 'application/json',
    'X-Requested-With': 'XMLHttpRequest',
    'X-CSRF-TOKEN': csrfToken,
    Referer: PUBLIC_TRANSPORT_URL,
    Origin: TRIP_BASE_URL,
});

const extractCsrfToken = (html: string) => {
    const match = html.match(/<meta\s+name="csrf-token"\s+content="([^"]+)"/i);
    return match?.[1] || null;
};

const ensureTripSession = async (forceRefresh = false) => {
    if (Platform.OS === 'web') {
        throw new Error('CGM trip API requires same-site cookies and is not reliable on web builds.');
    }

    const now = Date.now();
    if (!forceRefresh && sessionCsrfToken && now - sessionFetchedAt < SESSION_TTL_MS) {
        return sessionCsrfToken;
    }

    const response = await fetch(PUBLIC_TRANSPORT_URL, {
        method: 'GET',
        credentials: 'include',
        headers: {
            Accept: 'text/html,application/xhtml+xml',
        },
    });

    if (!response.ok) {
        throw new Error(`Failed to initialize CGM trip session: ${response.status}`);
    }

    const html = await response.text();
    const csrfToken = extractCsrfToken(html);
    if (!csrfToken) {
        throw new Error('Failed to extract CGM trip CSRF token.');
    }

    sessionCsrfToken = csrfToken;
    sessionFetchedAt = now;
    return csrfToken;
};

const postTripJson = async <T>(url: string, body: unknown, attempt = 0): Promise<T> => {
    const csrfToken = await ensureTripSession(attempt > 0);
    const response = await fetch(url, {
        method: 'POST',
        credentials: 'include',
        headers: buildTripApiHeaders(csrfToken),
        body: JSON.stringify(body),
    });

    const text = await response.text();
    const contentType = response.headers.get('content-type') || '';
    const returnedHtml = text.trim().startsWith('<!DOCTYPE') || text.trim().startsWith('<html');

    if ((!response.ok || returnedHtml || !contentType.includes('application/json')) && attempt < 1) {
        sessionCsrfToken = null;
        return postTripJson<T>(url, body, attempt + 1);
    }

    if (!response.ok || returnedHtml || !contentType.includes('application/json')) {
        throw new Error(`CGM trip API request failed for ${url}.`);
    }

    return JSON.parse(text) as T;
};

export const fetchTripApiAvailableLines = async (): Promise<AvailableLine[]> => {
    const rawLines = await postTripJson<RawTripLine[]>(TRIP_LINES_URL, {});
    const lineIndex = new Map<string, AvailableLine>();

    rawLines.forEach((rawLine) => {
        const line = String(rawLine.name || '').trim().toUpperCase();
        const routeId = String(rawLine.ext_id || '').trim().toUpperCase();
        if (!line || !routeId) return;

        const isNight = line.startsWith('N');
        const type = inferVehicleTypeFromTripApi(rawLine.type, routeId, line);
        const key = `${isNight ? 'night' : type}:${line}`;

        if (!lineIndex.has(key)) {
            lineIndex.set(key, {
                line,
                routeId,
                type,
                isNight,
            });
        }
    });

    return sortLines(Array.from(lineIndex.values()));
};

export const fetchTripApiLineSchedule = async (selectedLine: AvailableLine): Promise<TripApiLineSchedule | null> => {
    const routeId = String(selectedLine.routeId || '').trim().toUpperCase();
    if (!routeId) return null;

    const rawSchedule = await postTripJson<RawTripSchedule>(TRIP_SCHEDULE_URL, { ext_id: routeId });
    const rawRoutes = Array.isArray(rawSchedule.routes) ? rawSchedule.routes : [];
    if (!rawRoutes.length) return null;

    const directionMap = new Map<string, DirectionAccumulator>();

    rawRoutes.forEach((rawRoute) => {
        const segments = Array.isArray(rawRoute.segments)
            ? [...rawRoute.segments].sort((left, right) => left.sequence - right.sequence)
            : [];
        if (!segments.length) return;

        const variants = mergePartialVariants(generateRouteVariants(segments));
        processStopTimes(variants, segments);

        const stopDataByCode = new Map<string, RawTripStop>();
        segments.forEach((segment) => {
            const stopCode = getNormalizedStopCode(segment.stop);
            if (stopCode && segment.stop && !stopDataByCode.has(stopCode)) {
                stopDataByCode.set(stopCode, segment.stop);
            }
        });

        variants.forEach((variant, variantIndex) => {
            if (!variant.stops.length) {
                return;
            }

            const directionId = variant.routeIds[0] || `${routeId}:${rawRoute.id}:${variantIndex}`;
            const directionStops = variant.stops
                .map((stopCode) => {
                    const rawStop = stopDataByCode.get(stopCode);
                    if (!rawStop) {
                        return null;
                    }

                    return {
                        id: stopCode,
                        apiStopId: String(rawStop.id || rawStop.code || stopCode).trim(),
                        name: String(rawStop.name || stopCode).trim(),
                        latitude: parseCoordinate(rawStop.latitude),
                        longitude: parseCoordinate(rawStop.longitude),
                        scheduleEntries: [],
                        scheduleEntryIndex: new Map<string, number>(),
                    } satisfies TripApiStop & { scheduleEntryIndex: Map<string, number> };
                })
                .filter((stop): stop is TripApiStop & { scheduleEntryIndex: Map<string, number> } => Boolean(stop));

            if (!directionStops.length) {
                return;
            }

            const directionName = generateFromToText(directionStops);
            const direction = getOrCreateDirection(directionMap, directionId, directionName);

            if (direction.stops.length === 0) {
                directionStops.forEach((stop) => {
                    direction.stopIndex.set(stop.id, stop);
                    direction.stops.push(stop);
                });
            }

            variant.stopTimes.forEach((stopTime) => {
                const dayType = mapWeekendFlagToDayType(stopTime.isWeekend ? 1 : 0);
                direction.availableDayTypes.add(dayType);

                stopTime.times.forEach((minutes, stopIndex) => {
                    if (minutes == null) {
                        return;
                    }

                    const stop = direction.stops[stopIndex];
                    if (!stop) {
                        return;
                    }

                    const scheduleEntryKey = `${dayType}:${directionId}`;
                    let entryIndex = stop.scheduleEntryIndex.get(scheduleEntryKey);
                    if (entryIndex == null) {
                        entryIndex = stop.scheduleEntries.length;
                        stop.scheduleEntryIndex.set(scheduleEntryKey, entryIndex);
                        stop.scheduleEntries.push({
                            dayType,
                            line: selectedLine.line,
                            type: selectedLine.type,
                            destination: direction.name,
                            times: [],
                            routeId: directionId,
                        });
                    }

                    const entry = stop.scheduleEntries[entryIndex];
                    const mergedTimes = new Set(entry.times);
                    mergedTimes.add(minutes);
                    entry.times = Array.from(mergedTimes).sort((left, right) => left - right);
                });
            });
        });
    });

    const directions = collapseShortDirections(Array.from(directionMap.values()).map((direction) => ({
        id: direction.id,
        name: direction.name,
        availableDayTypes: Array.from(direction.availableDayTypes).sort(),
        stops: direction.stops.map(({ scheduleEntryIndex, ...stop }) => stop),
    })));

    return {
        line: selectedLine.line,
        routeId,
        type: selectedLine.type,
        isNight: selectedLine.isNight,
        directions,
    };
};

export const getTripApiStopScheduleEntries = (
    lineSchedule: TripApiLineSchedule | null,
    stopId: string,
    directionId: string | null | undefined,
    directionName: string | null | undefined,
    directionAliases: string[] = [],
    dayType: DayType,
) => {
    if (!lineSchedule) return null;

    const requestedStopIds = Array.from(new Set(
        String(stopId || '')
            .split(',')
            .map((value) => value.trim())
            .filter(Boolean),
    ));
    const normalizedDirectionTargets = Array.from(new Set(
        [directionName, ...directionAliases]
            .filter((value): value is string => Boolean(value))
            .map((value) => normalizeText(value)),
    ));

    const matchStop = (candidate: TripApiStop) => (
        requestedStopIds.includes(candidate.id)
        || requestedStopIds.includes(candidate.apiStopId)
    );

    const preferredDirections = lineSchedule.directions.filter((candidate) => {
        if (directionId && candidate.id === directionId) {
            return true;
        }

        return matchesNormalizedText(candidate.name, normalizedDirectionTargets);
    });

    const collectEntries = (directions: TripApiDirection[]) => {
        const mergedEntries = new Map<string, StaticScheduleEntry>();

        directions.forEach((direction) => {
            direction.stops
                .filter(matchStop)
                .forEach((stop) => {
                    stop.scheduleEntries
                        .filter((entry) => entry.dayType === dayType)
                        .forEach(({ dayType: _dayType, ...entry }) => {
                            const entryKey = `${entry.line}|${entry.type}|${entry.destination}|${entry.routeId}`;
                            const existing = mergedEntries.get(entryKey);
                            if (!existing) {
                                mergedEntries.set(entryKey, {
                                    ...entry,
                                    times: [...entry.times],
                                    partialTimeKinds: entry.partialTimeKinds ? { ...entry.partialTimeKinds } : undefined,
                                });
                                return;
                            }

                            const mergedTimes = new Set(existing.times);
                            entry.times.forEach((time) => mergedTimes.add(time));
                            existing.times = Array.from(mergedTimes).sort((left, right) => left - right);
                            if (entry.partialTimeKinds) {
                                existing.partialTimeKinds = {
                                    ...(existing.partialTimeKinds || {}),
                                    ...entry.partialTimeKinds,
                                };
                            }
                        });
                });
        });

        return Array.from(mergedEntries.values())
            .sort((left, right) => left.destination.localeCompare(right.destination, 'bg'));
    };

    const preferredEntries = collectEntries(preferredDirections);
    if (preferredEntries.length > 0) {
        return preferredEntries;
    }

    return collectEntries(lineSchedule.directions);
};

export const convertTripApiScheduleToRouteGeometry = (lineSchedule: TripApiLineSchedule): LineRouteGeometry => {
    const directions: LineRouteDirection[] = lineSchedule.directions.map((direction) => ({
        id: direction.id,
        name: direction.name,
        availableDayTypes: direction.availableDayTypes,
        coordinates: direction.stops.map((stop) => [stop.longitude, stop.latitude] as [number, number]),
        stops: direction.stops.map((stop) => ({
            id: stop.id,
            name: stop.name,
            latitude: stop.latitude,
            longitude: stop.longitude,
        })),
    }));

    return {
        line: lineSchedule.line,
        type: lineSchedule.type,
        isNight: lineSchedule.isNight,
        directions,
    };
};