import type { PlanType } from '../../../services/transit';

export const modeIconName = (mode: string): string => {
    switch (mode) {
        case 'WALK': return 'footsteps-outline';
        case 'BUS': return 'bus-outline';
        case 'TRAM': return 'train-outline';
        case 'TROLLEYBUS': return 'bus-outline';
        case 'SUBWAY': return 'subway-outline';
        case 'RAIL': return 'train-outline';
        default: return 'bus-outline';
    }
};

export const modeColor = (mode: string): string => {
    switch (mode) {
        case 'WALK': return '#94A3B8';
        case 'BUS': return '#2563EB';
        case 'TRAM': return '#DC2626';
        case 'TROLLEYBUS': return '#7C3AED';
        case 'SUBWAY': return '#059669';
        case 'RAIL': return '#D97706';
        default: return '#64748B';
    }
};

export const fmtTime = (epoch: number) => {
    const d = new Date(epoch);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

export const fmtDuration = (secs: number) => {
    const m = Math.round(secs / 60);
    if (m < 60) return `${m} мин`;
    const h = Math.floor(m / 60);
    return `${h} ч ${m % 60} мин`;
};

export const formatDateForApi = (date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

export const formatDateForInput = (date: Date) => {
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    return `${day}.${month}.${year}`;
};

export const formatTimeForInput = (date: Date) => (
    `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
);

export const getCurrentPlannerDateInput = () => formatDateForInput(new Date());
export const getCurrentPlannerTimeInput = () => formatTimeForInput(new Date());

export const parseInputDate = (value: string) => {
    const match = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(String(value || '').trim());
    if (!match) {
        return null;
    }

    const day = Number(match[1]);
    const month = Number(match[2]);
    const year = Number(match[3]);
    const parsed = new Date(year, month - 1, day);
    if (
        parsed.getFullYear() !== year
        || parsed.getMonth() !== month - 1
        || parsed.getDate() !== day
    ) {
        return null;
    }

    return parsed;
};

export const normalizeDateInput = (value: string) => value.replace(/[^\d.]/g, '').slice(0, 10);
export const normalizeTimeInput = (value: string) => value.replace(/[^\d:]/g, '').slice(0, 5);
export const isValidTimeInput = (value: string) => /^([01]\d|2[0-3]):([0-5]\d)$/.test(String(value || '').trim());

export const PLAN_LABELS: Record<PlanType, string> = {
    '0': 'По-малко чакане',
    '1': 'По-малко ходене',
    '2': 'По-малко прекачвания',
};
