import { ActionService } from './ActionService';
import { FactRepo } from '../repositories/fact_repo';
import { SpaceRepo } from '../repositories/space_repo';
import { ThreadRepo } from '../repositories/thread_repo';

export const OpsExecutor = {
    execute: async (jsonResult: any, currentSpaceId?: string, currentThreadId?: string) => {
        // Schema: { assistant_reply, ops: [] }
        const ops = jsonResult.ops || [];

        for (const opItem of ops) {
            try {
                const { op, data } = opItem;

                switch (op) {
                    case 'CREATE_ACTION':
                        // data: { type, payload, schedule, ... }
                        await ActionService.createReminder(
                            currentThreadId ? 'thread' : 'space',
                            currentThreadId || currentSpaceId || null,
                            data.payload?.text || JSON.stringify(data.payload),
                            data.schedule?.timestamp || Date.now() + 60000, // fallback 1m
                            currentSpaceId
                        );
                        break;
                    case 'UPSERT_FACT':
                        // data: { key, value, ... }
                        await FactRepo.upsert(
                            'thread',
                            currentThreadId || null,
                            data.key,
                            data.value,
                            data.unit
                        );
                        break;
                    // Add other ops...
                    case 'UPSERT_SPACE':
                        if (data.name) await SpaceRepo.create(data.name);
                        break;
                    case 'UPSERT_THREAD':
                        if (data.title && currentSpaceId) await ThreadRepo.create(currentSpaceId, data.title);
                        break;
                }
            } catch (e) {
                console.error('Failed to execute op', opItem, e);
            }
        }

        return jsonResult.assistant_reply;
    }
};
