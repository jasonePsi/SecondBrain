import { MemoryService, SummaryUpdateResult } from './MemoryService';
import { OpsExecutionReport, OpsExecutor } from './OpsExecutor';
import { StructuredExtractionResult, StructuredExtractionService } from './StructuredExtractionService';
import {
    emptyExecutionReport,
    emptySummaryResult,
    extractionExceptionResult,
    runTurnPostProcessingPipeline
} from './turn_post_processing_utils';
import type { AIProviderType } from './LLMService';

export interface TurnPostProcessingInput {
    threadId: string;
    spaceId: string | null;
    userMessage: string;
    assistantMessage: string;
    turnId?: string;
    provider?: AIProviderType;
}

export interface TurnPostProcessingResult {
    extraction: StructuredExtractionResult;
    executionReport: OpsExecutionReport;
    summary: SummaryUpdateResult;
}

interface TurnPostProcessingDeps {
    extractFromTurn: typeof StructuredExtractionService.extractFromTurn;
    executeOps: typeof OpsExecutor.execute;
    updateSummary: typeof MemoryService.updateThreadSummaryIfNeeded;
}

export const TurnPostProcessingService = {
    processTurn: async (
        input: TurnPostProcessingInput,
        deps?: Partial<TurnPostProcessingDeps>
    ): Promise<TurnPostProcessingResult> => {
        const extractFromTurn = deps?.extractFromTurn || StructuredExtractionService.extractFromTurn;
        const executeOps = deps?.executeOps || OpsExecutor.execute;
        const updateSummary = deps?.updateSummary || MemoryService.updateThreadSummaryIfNeeded;
        const baseLog = {
            turnId: input.turnId,
            provider: input.provider,
            threadId: input.threadId
        };

        console.log('[TurnPostProcessing] started', baseLog);
        const pipelineInput = {
            extract: async () => {
                return await extractFromTurn(
                    input.userMessage,
                    input.assistantMessage,
                    {
                        provider: input.provider,
                        requestId: input.turnId ? `${input.turnId}:extract` : undefined,
                        turnId: input.turnId
                    }
                );
            },
            executeOps: async (ops: unknown[]) => {
                return await executeOps(
                    { ops },
                    input.spaceId || undefined,
                    input.threadId,
                    { turnId: input.turnId }
                );
            },
            updateSummary: async () => {
                return await updateSummary(input.threadId, {
                    provider: input.provider,
                    requestId: input.turnId ? `${input.turnId}:summary` : undefined,
                    turnId: input.turnId
                });
            },
            onStage: (event: {
                stage: 'extraction' | 'ops' | 'summary' | 'completed';
                status: 'done' | 'failed' | 'skipped';
                detail?: string;
                meta?: Record<string, unknown>;
            }) => {
                if (event.stage === 'extraction' && event.status === 'done') {
                    console.log('[TurnPostProcessing] extraction stage done', {
                        ...baseLog,
                        extractedOps: event.meta?.extractedOps,
                        parseError: event.meta?.parseError,
                        droppedOps: event.meta?.droppedOps
                    });
                    return;
                }

                if (event.stage === 'extraction' && event.status === 'failed') {
                    console.warn('[TurnPostProcessing] extraction failed', {
                        ...baseLog,
                        error: event.detail
                    });
                    return;
                }

                if (event.stage === 'ops' && event.status === 'done') {
                    console.log('[TurnPostProcessing] ops stage done', {
                        ...baseLog,
                        executed: event.meta?.executed,
                        skipped: event.meta?.skipped,
                        failed: event.meta?.failed
                    });
                    return;
                }

                if (event.stage === 'ops' && event.status === 'failed') {
                    console.warn('[TurnPostProcessing] ops execution failed', {
                        ...baseLog,
                        error: event.detail
                    });
                    return;
                }

                if (event.stage === 'summary' && event.status === 'done') {
                    console.log('[TurnPostProcessing] summary stage done', {
                        ...baseLog,
                        summaryUpdated: event.meta?.summaryUpdated,
                        summaryLength: event.meta?.summaryLength
                    });
                    return;
                }

                if (event.stage === 'summary' && event.status === 'failed') {
                    console.warn('[TurnPostProcessing] summary update failed', {
                        ...baseLog,
                        error: event.detail
                    });
                }
            }
        };

        const pipelineResult = await runTurnPostProcessingPipeline(pipelineInput).catch((error) => {
            const message = error instanceof Error ? error.message : 'Post-processing pipeline failed';
            console.error('[TurnPostProcessing] pipeline failure', {
                ...baseLog,
                error: message
            });
            return {
                extraction: extractionExceptionResult(message),
                executionReport: emptyExecutionReport(),
                summary: emptySummaryResult(),
                outcome: 'degraded' as const
            };
        });
        const extraction = pipelineResult.extraction as StructuredExtractionResult;
        const executionReport = pipelineResult.executionReport as OpsExecutionReport;
        const summary = pipelineResult.summary as SummaryUpdateResult;
        const outcome = pipelineResult.outcome;

        console.log('[TurnPostProcessing] completed', {
            ...baseLog,
            outcome,
            extractedOps: extraction.ops.length,
            parseError: !!extraction.parseError,
            droppedOps: extraction.diagnostics.droppedOpsCount,
            executed: executionReport.executedCount,
            failed: executionReport.failedCount,
            summaryUpdated: summary.updated
        });

        return {
            extraction,
            executionReport,
            summary
        };
    }
};
