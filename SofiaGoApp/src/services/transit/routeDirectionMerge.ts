type StopLike = {
    id: string;
};

type DirectionLike<TStop extends StopLike> = {
    stops: TStop[];
};

const splitStopIds = (value: string) => String(value || '')
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);

const hasMatchingStopId = (leftStopId: string, rightStopId: string) => {
    const leftIds = splitStopIds(leftStopId);
    const rightIds = splitStopIds(rightStopId);

    if (leftIds.length === 0 || rightIds.length === 0) {
        return false;
    }

    return leftIds.some((leftId) => rightIds.includes(leftId));
};

const countMatchingPrefixStops = (masterStops: string[], candidateStops: string[]) => {
    let matchCount = 0;
    const limit = Math.min(masterStops.length, candidateStops.length);

    while (matchCount < limit && hasMatchingStopId(masterStops[matchCount], candidateStops[matchCount])) {
        matchCount += 1;
    }

    return matchCount;
};

const countMatchingSuffixStops = (masterStops: string[], candidateStops: string[]) => {
    let matchCount = 0;

    while (
        matchCount < masterStops.length
        && matchCount < candidateStops.length
        && hasMatchingStopId(
            masterStops[masterStops.length - 1 - matchCount],
            candidateStops[candidateStops.length - 1 - matchCount],
        )
    ) {
        matchCount += 1;
    }

    return matchCount;
};

const hasStrongTerminalOverlap = (masterStops: string[], candidateStops: string[]) => {
    if (candidateStops.length < 4 || masterStops.length < candidateStops.length) {
        return false;
    }

    const prefixMatches = countMatchingPrefixStops(masterStops, candidateStops);
    const suffixMatches = countMatchingSuffixStops(masterStops, candidateStops);
    const strongestOverlap = Math.max(prefixMatches, suffixMatches);

    return strongestOverlap >= 4 && (strongestOverlap / candidateStops.length) >= 0.75;
};

export const containsStopSequence = (masterStops: string[], candidateStops: string[]) => {
    if (candidateStops.length === 0 || candidateStops.length > masterStops.length) {
        return false;
    }

    let masterIndex = 0;

    for (const candidateStopId of candidateStops) {
        let matchedIndex = -1;

        for (let index = masterIndex; index < masterStops.length; index += 1) {
            if (hasMatchingStopId(masterStops[index], candidateStopId)) {
                matchedIndex = index;
                break;
            }
        }

        if (matchedIndex === -1) {
            return false;
        }

        masterIndex = matchedIndex + 1;
    }

    return true;
};

export const collapseContainedDirections = <
    TStop extends StopLike,
    TDirection extends DirectionLike<TStop>,
>(
    directions: TDirection[],
    cloneDirection: (direction: TDirection) => TDirection,
    mergeIntoMaster?: (master: TDirection, candidate: TDirection) => void,
) => {
    const sortedDirections = directions
        .map((direction) => cloneDirection(direction))
        .sort((left, right) => right.stops.length - left.stops.length);

    const visibleDirections: TDirection[] = [];

    sortedDirections.forEach((direction) => {
        const matchingMaster = visibleDirections.find((candidate) => containsStopSequence(
            candidate.stops.map((stop) => stop.id),
            direction.stops.map((stop) => stop.id),
        ) || hasStrongTerminalOverlap(
            candidate.stops.map((stop) => stop.id),
            direction.stops.map((stop) => stop.id),
        ));

        if (!matchingMaster) {
            visibleDirections.push(direction);
            return;
        }

        mergeIntoMaster?.(matchingMaster, direction);
    });

    return visibleDirections;
};