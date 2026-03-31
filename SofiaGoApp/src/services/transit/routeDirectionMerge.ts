type StopLike = {
    id: string;
};

type DirectionLike<TStop extends StopLike> = {
    stops: TStop[];
};

export const containsStopSequence = (masterStops: string[], candidateStops: string[]) => {
    if (candidateStops.length === 0 || candidateStops.length > masterStops.length) {
        return false;
    }

    const masterSerialized = `|${masterStops.join('|')}|`;
    const candidateSerialized = `|${candidateStops.join('|')}|`;
    return masterSerialized.includes(candidateSerialized);
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
        ));

        if (!matchingMaster) {
            visibleDirections.push(direction);
            return;
        }

        mergeIntoMaster?.(matchingMaster, direction);
    });

    return visibleDirections;
};