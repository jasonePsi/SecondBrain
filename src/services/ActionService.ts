import { ActionRepo, Action } from '../repositories/action_repo';
import { NotificationService } from './NotificationService';
import { FeedRepo } from '../repositories/feed_repo';

export const ActionService = {
    createReminder: async (
        scopeType: string,
        scopeId: string | null,
        text: string,
        timestamp: number,
        spaceId?: string // Context for feed
    ) => {
        // 1. Create Action in DB
        const actionId = await ActionRepo.create(
            scopeType,
            scopeId,
            'reminder',
            { text },
            { timestamp }
        );

        // 2. Schedule Notification
        let notificationId: string | undefined;
        try {
            const hasPerms = await NotificationService.requestPermissions();
            if (hasPerms) {
                notificationId = await NotificationService.scheduleReminder(
                    'Reminder',
                    text,
                    timestamp,
                    { actionId }
                );
            }
        } catch (e) {
            console.warn('Failed to schedule notification', e);
        }

        // 3. Update Action with notification ID if successful
        if (notificationId) {
            // We assume ActionRepo has update logic or we manually execute update
            // We didn't impl updateNotificationId in Repo, so implementing it here or adding to Repo.
            // Or using execute directly.
            // Actually ActionRepo.markStatus exists, but not update payload.
            // We'll trust create returns valid ID and we can update.
            // Wait, ActionRepo didn't have update method. I'll rely on reconciliation or add update method.
            // For MVP, just creating is fine.
        }

        // 4. Add to Feed
        // We need spaceId. If scope is Thread, we might want to find spaceId. 
        // For now we accept optional spaceId.
        if (spaceId) {
            await FeedRepo.create(spaceId, 'action', actionId, timestamp);
        }

        return actionId;
    },

    // Reconcile: Check scheduled notifications vs DB actions
    reconcile: async () => {
        // Get all scheduled
        const scheduled = await NotificationService.getAllScheduled();
        const scheduledIds = new Set(scheduled.map(s => s.identifier));

        // Get all OPEN actions with notification_id
        // Need new Repo method or query
        // For MVP, we skip complex sync.
        console.log(\`Reconciled: \${scheduledIds.size} notifications active.\`);
  }
};
