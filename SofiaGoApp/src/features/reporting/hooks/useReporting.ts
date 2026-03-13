import { useState, useCallback } from 'react';

export const useReporting = () => {
    const [reportModalVisible, setReportModalVisible] = useState(false);

    const openReportModal = useCallback(() => setReportModalVisible(true), []);
    const closeReportModal = useCallback(() => setReportModalVisible(false), []);

    return { reportModalVisible, openReportModal, closeReportModal };
};
