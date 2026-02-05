import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

Notifications.setNotificationHandler({
    handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
        shouldShowBanner: true, // required by type
        shouldShowList: true, // required by type
    }),
});

export const NotificationService = {
    requestPermissions: async () => {
        const { status: existingStatus } = await Notifications.getPermissionsAsync();
        let finalStatus = existingStatus;
        if (existingStatus !== 'granted') {
            const { status } = await Notifications.requestPermissionsAsync();
            finalStatus = status;
        }
        return finalStatus === 'granted';
    },

    scheduleReminder: async (title: string, body: string, triggerTimestamp: number, data?: any) => {
        const trigger = new Date(triggerTimestamp);
        if (trigger.getTime() <= Date.now()) {
            console.warn('Notification trigger is in the past, skipping or firing now');
            // fallback?
        }

        const id = await Notifications.scheduleNotificationAsync({
            content: {
                title,
                body,
                data,
            },
            trigger: trigger as any,
        });
        return id;
    },

    cancel: async (id: string) => {
        await Notifications.cancelScheduledNotificationAsync(id);
    },

    getAllScheduled: async () => {
        return await Notifications.getAllScheduledNotificationsAsync();
    }
};
