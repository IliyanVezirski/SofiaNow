import { useMemo, useState } from 'react';

import type { EcoActionKey } from '../../features/eco/types';

export const useEcoPanels = () => {
    const [activeEcoPanel, setActiveEcoPanel] = useState<EcoActionKey | null>(null);

    const allowEcoActionHighlight = useMemo(
        () => activeEcoPanel !== null,
        [activeEcoPanel],
    );

    return {
        activeEcoPanel,
        allowEcoActionHighlight,
        setActiveEcoPanel,
    };
};
