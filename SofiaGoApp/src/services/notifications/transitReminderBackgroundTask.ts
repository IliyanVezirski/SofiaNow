import { Platform } from 'react-native';
import { refreshTransitArrivalReminders } from './transitArrivalNotifications';

export const TRANSIT_REMINDER_BACKGROUND_TASK = 'sofiago-transit-reminder-refresh';
const BACKGROUND_MIN_INTERVAL_MINUTES = 15;

type BackgroundTaskModule = typeof import('expo-background-task');
type TaskManagerModule = typeof import('expo-task-manager');

let cachedModules: { BackgroundTask: BackgroundTaskModule; TaskManager: TaskManagerModule } | null | undefined;
let backgroundTaskDefinitionChecked = false;

const loadBackgroundTaskModules = () => {
    if (Platform.OS === 'web') {
        return null;
    }

    if (cachedModules !== undefined) {
        return cachedModules;
    }

    try {
        cachedModules = {
            BackgroundTask: require('expo-background-task') as BackgroundTaskModule,
            TaskManager: require('expo-task-manager') as TaskManagerModule,
        };
    } catch (error) {
        console.warn('Background task modules are unavailable in this build:', error);
        cachedModules = null;
    }

    return cachedModules;
};

const ensureBackgroundTaskDefined = () => {
    const modules = loadBackgroundTaskModules();
    if (!modules || backgroundTaskDefinitionChecked) {
        return !!modules;
    }

    const { BackgroundTask, TaskManager } = modules;

    if (!TaskManager.isTaskDefined(TRANSIT_REMINDER_BACKGROUND_TASK)) {
        TaskManager.defineTask(TRANSIT_REMINDER_BACKGROUND_TASK, async () => {
            try {
                await refreshTransitArrivalReminders();
                return BackgroundTask.BackgroundTaskResult.Success;
            } catch (error) {
                console.error('Transit reminder background refresh failed:', error);
                return BackgroundTask.BackgroundTaskResult.Failed;
            }
        });
    }

    backgroundTaskDefinitionChecked = true;
    return true;
};

export const ensureTransitReminderBackgroundTaskRegistered = async () => {
    if (Platform.OS === 'web') {
        return { ok: false, message: 'Background refresh is not available on web.' };
    }

    const modules = loadBackgroundTaskModules();
    if (!modules) {
        return { ok: false, message: 'Background tasks are not available in this build.' };
    }

    const { BackgroundTask, TaskManager } = modules;

    ensureBackgroundTaskDefined();

    const taskManagerAvailable = await TaskManager.isAvailableAsync();
    if (!taskManagerAvailable) {
        return { ok: false, message: 'TaskManager is not available in this build.' };
    }

    const status = await BackgroundTask.getStatusAsync();
    if (status !== BackgroundTask.BackgroundTaskStatus.Available) {
        return { ok: false, message: 'Background tasks are not available on this device right now.' };
    }

    const alreadyRegistered = await TaskManager.isTaskRegisteredAsync(TRANSIT_REMINDER_BACKGROUND_TASK);
    if (!alreadyRegistered) {
        await BackgroundTask.registerTaskAsync(TRANSIT_REMINDER_BACKGROUND_TASK, {
            minimumInterval: BACKGROUND_MIN_INTERVAL_MINUTES,
        });
    }

    return {
        ok: true,
        message: alreadyRegistered
            ? 'Transit reminder background refresh is already registered.'
            : 'Transit reminder background refresh registered.',
    };
};

export const unregisterTransitReminderBackgroundTask = async () => {
    if (Platform.OS === 'web') {
        return;
    }

    const modules = loadBackgroundTaskModules();
    if (!modules) {
        return;
    }

    const { BackgroundTask, TaskManager } = modules;

    const isRegistered = await TaskManager.isTaskRegisteredAsync(TRANSIT_REMINDER_BACKGROUND_TASK);
    if (isRegistered) {
        await BackgroundTask.unregisterTaskAsync(TRANSIT_REMINDER_BACKGROUND_TASK);
    }
};

export const triggerTransitReminderBackgroundTaskForTesting = async () => {
    if (__DEV__ && Platform.OS !== 'web') {
        const modules = loadBackgroundTaskModules();
        if (!modules) {
            return;
        }

        const { BackgroundTask } = modules;
        await BackgroundTask.triggerTaskWorkerForTestingAsync();
    }
};