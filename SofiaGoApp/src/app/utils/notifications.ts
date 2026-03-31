export const extractDelayHighlight = (body: string | null | undefined) => {
    const value = String(body || '');
    const match = /(закъснява с \d+ мин|идва с \d+ мин по-рано)/.exec(value);
    if (!match || match.index == null) {
        return {
            before: value,
            highlight: null,
            after: '',
            tone: null as 'late' | 'early' | null,
        };
    }

    const highlight = match[0];
    return {
        before: value.slice(0, match.index),
        highlight,
        after: value.slice(match.index + highlight.length),
        tone: highlight.startsWith('закъснява') ? 'late' as const : 'early' as const,
    };
};
