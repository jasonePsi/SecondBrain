import { ActionService } from './ActionService';
import { FactRepo } from '../repositories/fact_repo';
import { SpaceRepo } from '../repositories/space_repo';
import { ThreadRepo } from '../repositories/thread_repo';
import { FeedRepo } from '../repositories/feed_repo';
import { normalizeScope, parseTimestamp, SupportedScope } from './ops_executor_utils';
import { debugLog } from './runtime_log.ts';

interface OpsExecutionLog {
    op: string;
    status: 'executed' | 'skipped' | 'failed';
    detail: string;
}

export interface OpsExecutionReport {
    executedCount: number;
    skippedCount: number;
    failedCount: number;
    logs: OpsExecutionLog[];
}

const resolveFeedSpaceIdForScope = async (
    scopeType: SupportedScope,
    scopeId: string | null,
    currentSpaceId?: string
): Promise<string | null> => {
    if (currentSpaceId) return currentSpaceId;
    if (scopeType === 'space') return scopeId;
    if (scopeType === 'thread' && scopeId) {
        const thread = await ThreadRepo.get(scopeId);
        return thread?.space_id || null;
    }
    return null;
};

export const OpsExecutor = {
    execute: async (
        jsonResult: any,
        currentSpaceId?: string,
        currentThreadId?: string,
        options?: {
            turnId?: string;
        }
    ): Promise<OpsExecutionReport> => {
        const ops = Array.isArray(jsonResult)
            ? jsonResult
            : (Array.isArray(jsonResult?.ops) ? jsonResult.ops : []);
        const logs: OpsExecutionLog[] = [];
        let executedCount = 0;
        let skippedCount = 0;
        let failedCount = 0;

        for (const [index, opItem] of ops.entries()) {
            const op = opItem?.op;
            const data = opItem?.data || {};

            try {
                switch (op) {
                    case 'CREATE_ACTION': {
                        const payloadText = typeof data?.payload?.text === 'string'
                            ? data.payload.text.trim()
                            : '';
                        const text = payloadText || 'Reminder';
                        const timestamp = parseTimestamp(data?.schedule?.timestamp);

                        if (!timestamp) {
                            skippedCount += 1;
                            logs.push({
                                op,
                                status: 'skipped',
                                detail: `#${index} Missing or invalid schedule timestamp`
                            });
                            break;
                        }

                        const { scopeType, scopeId } = normalizeScope(data?.scope, currentSpaceId, currentThreadId);
                        await ActionService.createReminder(scopeType, scopeId, text, timestamp, currentSpaceId);
                        executedCount += 1;
                        logs.push({ op, status: 'executed', detail: `Created ${scopeType} reminder` });
                        break;
                    }

                    case 'UPSERT_FACT': {
                        if (typeof data?.key !== 'string' || data.key.trim().length === 0) {
                            skippedCount += 1;
                            logs.push({ op, status: 'skipped', detail: `#${index} Missing fact key` });
                            break;
                        }
                        if (data.value === undefined) {
                            skippedCount += 1;
                            logs.push({ op, status: 'skipped', detail: `#${index} Missing fact value` });
                            break;
                        }

                        const { scopeType, scopeId } = normalizeScope(data?.scope, currentSpaceId, currentThreadId);
                        const result = await FactRepo.appendIfChanged(
                            scopeType,
                            scopeId,
                            data.key.trim(),
                            data.value,
                            typeof data?.unit === 'string' ? data.unit : undefined
                        );
                        if (result.inserted) {
                            const feedSpaceId = await resolveFeedSpaceIdForScope(scopeType, scopeId, currentSpaceId);
                            await FeedRepo.create(feedSpaceId, 'fact', result.factId);
                        }
                        executedCount += 1;
                        logs.push({
                            op,
                            status: 'executed',
                            detail: result.inserted ? 'Inserted fact history row' : 'Fact unchanged; reused latest row'
                        });
                        break;
                    }

                    case 'UPDATE_THREAD': {
                        if (!currentThreadId) {
                            skippedCount += 1;
                            logs.push({ op, status: 'skipped', detail: `#${index} No active thread context` });
                            break;
                        }

                        const updates: {
                            title?: string;
                            summary_text?: string | null;
                            summary_updated_at?: number | null;
                        } = {};

                        if (typeof data?.title === 'string' && data.title.trim().length >= 3) {
                            updates.title = data.title.trim().slice(0, 80);
                        }
                        if (typeof data?.summary === 'string' && data.summary.trim().length >= 12) {
                            updates.summary_text = data.summary.trim().slice(0, 1000);
                            updates.summary_updated_at = Date.now();
                        }

                        if (Object.keys(updates).length === 0) {
                            skippedCount += 1;
                            logs.push({ op, status: 'skipped', detail: `#${index} No valid thread update fields` });
                            break;
                        }

                        await ThreadRepo.update(currentThreadId, updates);
                        const feedSpaceId = currentSpaceId || (await ThreadRepo.get(currentThreadId))?.space_id || null;
                        await FeedRepo.create(feedSpaceId, 'thread_updated', currentThreadId);
                        executedCount += 1;
                        logs.push({ op, status: 'executed', detail: 'Updated thread metadata' });
                        break;
                    }

                    case 'UPSERT_SPACE': {
                        if (!data?.name || typeof data.name !== 'string' || data.name.trim().length === 0) {
                            skippedCount += 1;
                            logs.push({ op, status: 'skipped', detail: `#${index} Missing space name` });
                            break;
                        }
                        const createdSpaceId = await SpaceRepo.create(data.name.trim());
                        await FeedRepo.create(createdSpaceId, 'space_created', createdSpaceId);
                        executedCount += 1;
                        logs.push({ op, status: 'executed', detail: 'Created space' });
                        break;
                    }

                    case 'UPSERT_THREAD': {
                        if (!currentSpaceId || typeof data?.title !== 'string' || data.title.trim().length === 0) {
                            skippedCount += 1;
                            logs.push({ op, status: 'skipped', detail: `#${index} Missing space context or title` });
                            break;
                        }
                        const createdThreadId = await ThreadRepo.create(currentSpaceId, data.title.trim());
                        await FeedRepo.create(currentSpaceId, 'thread_created', createdThreadId);
                        executedCount += 1;
                        logs.push({ op, status: 'executed', detail: 'Created thread' });
                        break;
                    }

                    default:
                        skippedCount += 1;
                        logs.push({
                            op: op || 'UNKNOWN',
                            status: 'skipped',
                            detail: `#${index} Unsupported operation`
                        });
                        break;
                }
            } catch (error: any) {
                failedCount += 1;
                logs.push({
                    op: op || 'UNKNOWN',
                    status: 'failed',
                    detail: `#${index} ${error?.message || 'Execution failed'}`
                });
                console.error('[OpsExecutor] failed op', {
                    turnId: options?.turnId,
                    index,
                    op: op || 'UNKNOWN',
                    message: error?.message || 'Execution failed'
                });
            }
        }

        const report: OpsExecutionReport = {
            executedCount,
            skippedCount,
            failedCount,
            logs
        };

        debugLog('[OpsExecutor] execution report', {
            turnId: options?.turnId,
            ...report
        });
        return report;
    }
};

export const __opsExecutorTestUtils = {
    parseTimestamp,
    normalizeScope
};
