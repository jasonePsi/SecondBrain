import {
    Action,
    ActionRepo,
    parseActionPayload
} from '../repositories/action_repo';
import { NotificationService } from './NotificationService';
import { FeedRepo } from '../repositories/feed_repo';
import { ThreadRepo } from '../repositories/thread_repo';

interface ReconcileResult {
    linkedNotificationIds: number;
    clearedMissingNotificationIds: number;
    rescheduledReminders: number;
    canceledOrphanNotifications: number;
}

const extractActionIdFromNotification = (scheduledNotification: any): string | null => {
    const actionId = scheduledNotification?.content?.data?.actionId;
    return typeof actionId === 'string' && actionId.length > 0 ? actionId : null;
};

const getReminderTextFromAction = (action: Action): string => {
    const payload = parseActionPayload<{ text?: unknown }>(action, {});
    if (typeof payload.text === 'string' && payload.text.trim().length > 0) {
        return payload.text.trim();
    }
    return 'Reminder';
};

const resolveFeedSpaceId = async (
    scopeType: string,
    scopeId: string | null,
    explicitSpaceId?: string
): Promise<string | null> => {
    if (explicitSpaceId) return explicitSpaceId;
    if (scopeType === 'space') return scopeId || null;
    if (scopeType === 'thread' && scopeId) {
        const thread = await ThreadRepo.get(scopeId);
        return thread?.space_id || null;
    }
    return null;
};

export const ActionService = {
    createReminder: async (
        scopeType: string,
        scopeId: string | null,
        text: string,
        timestamp: number,
        spaceId?: string
    ) => {
        const actionId = await ActionRepo.create(
            scopeType,
            scopeId,
            'reminder',
            { text },
            { timestamp }
        );

        try {
            const hasPerms = await NotificationService.requestPermissions();
            if (hasPerms) {
                const notificationId = await NotificationService.scheduleReminder(
                    'Reminder',
                    text,
                    timestamp,
                    { actionId }
                );
                await ActionRepo.updateNotificationId(actionId, notificationId);
            }
        } catch (error) {
            console.warn('Failed to schedule reminder notification', error);
        }

        const feedSpaceId = await resolveFeedSpaceId(scopeType, scopeId, spaceId);
        await FeedRepo.create(feedSpaceId, 'action', actionId, timestamp);

        return actionId;
    },

    setActionStatus: async (
        actionId: string,
        status: 'done' | 'canceled' | 'snoozed',
        explicitSpaceId?: string
    ) => {
        const action = await ActionRepo.getById(actionId);
        if (!action) {
            throw new Error('Action not found');
        }

        await ActionRepo.markStatus(actionId, status);

        if ((status === 'done' || status === 'canceled') && action.notification_id) {
            try {
                await NotificationService.cancel(action.notification_id);
            } catch (error) {
                console.warn(`Failed to cancel notification for action ${actionId}`, error);
            }
            await ActionRepo.updateNotificationId(actionId, null);
        }

        const feedType = status === 'done'
            ? 'action_done'
            : status === 'canceled'
                ? 'action_canceled'
                : 'action_snoozed';
        const feedSpaceId = await resolveFeedSpaceId(action.scope_type, action.scope_id, explicitSpaceId);
        await FeedRepo.create(feedSpaceId, feedType, actionId, action.scheduled_for || undefined);
    },

    reconcile: async (): Promise<ReconcileResult> => {
        const [scheduledNotifications, openReminderActions] = await Promise.all([
            NotificationService.getAllScheduled(),
            ActionRepo.listOpenReminders()
        ]);

        const scheduledIds = new Set<string>();
        const scheduledByActionId = new Map<string, string[]>();

        for (const scheduled of scheduledNotifications) {
            const identifier = scheduled.identifier;
            scheduledIds.add(identifier);

            const actionId = extractActionIdFromNotification(scheduled);
            if (!actionId) continue;
            const list = scheduledByActionId.get(actionId) || [];
            list.push(identifier);
            scheduledByActionId.set(actionId, list);
        }

        const openReminderById = new Map(openReminderActions.map((action) => [action.id, action]));
        let linkedNotificationIds = 0;
        let clearedMissingNotificationIds = 0;
        let canceledOrphanNotifications = 0;
        let rescheduledReminders = 0;

        for (const action of openReminderActions) {
            if (!action.notification_id) continue;

            const hasLinkedScheduledNotification = scheduledIds.has(action.notification_id);
            const hasAlternativeLinkedNotification = (scheduledByActionId.get(action.id) || []).length > 0;
            if (hasLinkedScheduledNotification || hasAlternativeLinkedNotification) {
                continue;
            }

            await ActionRepo.updateNotificationId(action.id, null);
            clearedMissingNotificationIds += 1;
        }

        for (const [actionId, identifiers] of scheduledByActionId.entries()) {
            const action = openReminderById.get(actionId);
            if (!action) {
                for (const notificationId of identifiers) {
                    await NotificationService.cancel(notificationId);
                    canceledOrphanNotifications += 1;
                }
                continue;
            }

            const preferredNotificationId = (
                action.notification_id && identifiers.includes(action.notification_id)
            )
                ? action.notification_id
                : identifiers[0];

            if (action.notification_id !== preferredNotificationId) {
                await ActionRepo.updateNotificationId(action.id, preferredNotificationId);
                action.notification_id = preferredNotificationId;
                linkedNotificationIds += 1;
            }

            for (const notificationId of identifiers) {
                if (notificationId === preferredNotificationId) continue;
                await NotificationService.cancel(notificationId);
                canceledOrphanNotifications += 1;
            }
        }

        const remindersNeedingSchedule = openReminderActions.filter((action) => {
            return !action.notification_id && !!action.scheduled_for && action.scheduled_for > Date.now();
        });

        if (remindersNeedingSchedule.length > 0) {
            const hasPerms = await NotificationService.requestPermissions();
            if (hasPerms) {
                for (const action of remindersNeedingSchedule) {
                    if (!action.scheduled_for) continue;
                    try {
                        const notificationId = await NotificationService.scheduleReminder(
                            'Reminder',
                            getReminderTextFromAction(action),
                            action.scheduled_for,
                            { actionId: action.id }
                        );
                        await ActionRepo.updateNotificationId(action.id, notificationId);
                        rescheduledReminders += 1;
                    } catch (error) {
                        console.warn(`Failed to reschedule reminder action ${action.id}`, error);
                    }
                }
            }
        }

        return {
            linkedNotificationIds,
            clearedMissingNotificationIds,
            rescheduledReminders,
            canceledOrphanNotifications
        };
    }
};
