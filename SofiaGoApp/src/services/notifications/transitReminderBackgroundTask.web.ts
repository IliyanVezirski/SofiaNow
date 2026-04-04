export const TRANSIT_REMINDER_BACKGROUND_TASK = 'sofianow-transit-reminder-refresh';

export const ensureTransitReminderBackgroundTaskRegistered = async () => ({
    ok: false,
    message: 'Background refresh is not available on web.',
});

export const unregisterTransitReminderBackgroundTask = async () => {
    return;
};

export const triggerTransitReminderBackgroundTaskForTesting = async () => {
    return;
};