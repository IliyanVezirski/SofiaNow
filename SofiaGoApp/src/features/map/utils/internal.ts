import type { MapBounds } from '../../../types/map';
import { resolveTransitDataViewportSuppressed } from '../constants';

interface Identifiable {
    id: string;
}

export const buildStableMarkerPool = <T extends Identifiable>(
    items: T[],
    slotMap: Map<string, number>,
    reverseMap: Map<number, string>,
    maxSlots: number,
): Array<T | null> => {
    const activeIds = new Set(items.map((item) => item.id));

    for (const [id, slot] of slotMap) {
        if (!activeIds.has(id)) {
            slotMap.delete(id);
            reverseMap.delete(slot);
        }
    }

    for (const item of items) {
        if (slotMap.has(item.id)) {
            continue;
        }

        for (let slot = 0; slot < maxSlots; slot += 1) {
            if (!reverseMap.has(slot)) {
                slotMap.set(item.id, slot);
                reverseMap.set(slot, item.id);
                break;
            }
        }
    }

    const itemById = new Map(items.map((item) => [item.id, item]));
    const slots: Array<T | null> = new Array(maxSlots).fill(null);

    for (let index = 0; index < maxSlots; index += 1) {
        const itemId = reverseMap.get(index);
        if (itemId) {
            slots[index] = itemById.get(itemId) ?? null;
        }
    }

    return slots;
};

export const getTransitViewportRenderState = (
    bounds: MapBounds | null,
    wasSuppressed: boolean,
) => {
    const isSuppressed = resolveTransitDataViewportSuppressed(bounds, wasSuppressed);

    return {
        isSuppressed,
        shouldRenderTransitViewportData: !isSuppressed,
    };
};
