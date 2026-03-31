import { NativeModules, Platform } from 'react-native';
import { refreshTransitArrivalReminders } from './transitArrivalNotifications';
import { reconcileFavoriteCommuteNotifications } from '../places/repository';

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

    const hasTaskManagerNativeModule = !!NativeModules?.ExpoTaskManager;
    const hasBackgroundTaskNativeModule = !!NativeModules?.ExpoBackgroundTask;

    if (!hasTaskManagerNativeModule || !hasBackgroundTaskNativeModule) {
        cachedModules = null;
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

    if (!BackgroundTask || !TaskManager || typeof TaskManager.isTaskDefined !== 'function' || typeof TaskManager.defineTask !== 'function') {
        cachedModules = null;
        return false;
    }

    try {
        if (!TaskManager.isTaskDefined(TRANSIT_REMINDER_BACKGROUND_TASK)) {
            TaskManager.defineTask(TRANSIT_REMINDER_BACKGROUND_TASK, async () => {
                try {
                    await refreshTransitArrivalReminders();
                    await reconcileFavoriteCommuteNotifications();
                    return BackgroundTask.BackgroundTaskResult.Success;
                } catch (error) {
                    console.error('Transit reminder background refresh failed:', error);
                    return BackgroundTask.BackgroundTaskResult.Failed;
                }
            });
        }
    } catch (error) {
        console.warn('Unable to define transit reminder background task in this build:', error);
        cachedModules = null;
        return false;
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

    if (!ensureBackgroundTaskDefined()) {
        return { ok: false, message: 'Background tasks are not available in this build.' };
    }

    if (!BackgroundTask || !TaskManager || typeof TaskManager.isAvailableAsync !== 'function' || typeof TaskManager.isTaskRegisteredAsync !== 'function' || typeof BackgroundTask.getStatusAsync !== 'function' || typeof BackgroundTask.registerTaskAsync !== 'function') {
        return { ok: false, message: 'Background tasks are not available in this build.' };
    }

    let taskManagerAvailable = false;
    try {
        taskManagerAvailable = await TaskManager.isAvailableAsync();
    } catch (error) {
        console.warn('TaskManager availability check failed:', error);
        return { ok: false, message: 'TaskManager is not available in this build.' };
    }
    if (!taskManagerAvailable) {
        return { ok: false, message: 'TaskManager is not available in this build.' };
    }

    let status;
    try {
        status = await BackgroundTask.getStatusAsync();
    } catch (error) {
        console.warn('Background task status check failed:', error);
        return { ok: false, message: 'Background tasks are not available on this device right now.' };
    }
    if (status !== BackgroundTask.BackgroundTaskStatus.Available) {
        return { ok: false, message: 'Background tasks are not available on this device right now.' };
    }

    let alreadyRegistered = false;
    try {
        alreadyRegistered = await TaskManager.isTaskRegisteredAsync(TRANSIT_REMINDER_BACKGROUND_TASK);
    } catch (error) {
        console.warn('Background task registration check failed:', error);
        return { ok: false, message: 'Background tasks are not available in this build.' };
    }
    if (!alreadyRegistered) {
        try {
            await BackgroundTask.registerTaskAsync(TRANSIT_REMINDER_BACKGROUND_TASK, {
                minimumInterval: BACKGROUND_MIN_INTERVAL_MINUTES,
            });
        } catch (error) {
            console.warn('Failed to register transit reminder background task:', error);
            return { ok: false, message: 'Background tasks are not available in this build.' };
        }
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

    if (!BackgroundTask || !TaskManager || typeof TaskManager.isTaskRegisteredAsync !== 'function' || typeof BackgroundTask.unregisterTaskAsync !== 'function') {
        return;
    }

    let isRegistered = false;
    try {
        isRegistered = await TaskManager.isTaskRegisteredAsync(TRANSIT_REMINDER_BACKGROUND_TASK);
    } catch {
        return;
    }
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
        if (!BackgroundTask || typeof BackgroundTask.triggerTaskWorkerForTestingAsync !== 'function') {
            return;
        }

        await BackgroundTask.triggerTaskWorkerForTestingAsync();
    }
};
