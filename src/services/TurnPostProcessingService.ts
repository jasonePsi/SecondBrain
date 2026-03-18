import { MemoryService, SummaryUpdateResult } from './MemoryService';
import { OpsExecutionReport, OpsExecutor } from './OpsExecutor';
import { StructuredExtractionResult, StructuredExtractionService } from './StructuredExtractionService';
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

const emptyExecutionReport = (): OpsExecutionReport => ({
    executedCount: 0,
    skippedCount: 0,
    failedCount: 0,
    logs: []
});

const emptySummaryResult = (): SummaryUpdateResult => ({
    updated: false,
    summaryLength: 0,
    messageCount: 0
});

export const TurnPostProcessingService = {
    processTurn: async (input: TurnPostProcessingInput): Promise<TurnPostProcessingResult> => {
        let extraction: StructuredExtractionResult = {
            raw: '',
            ops: [],
            parseError: undefined,
            diagnostics: {
                rawOpsCount: 0,
                acceptedOpsCount: 0,
                droppedOpsCount: 0,
                droppedReasons: []
            }
        };

        try {
            extraction = await StructuredExtractionService.extractFromTurn(
                input.userMessage,
                input.assistantMessage,
                {
                    provider: input.provider,
                    requestId: input.turnId ? `${input.turnId}:extract` : undefined,
                    turnId: input.turnId
                }
            );
        } catch (error: any) {
            extraction = {
                raw: '',
                ops: [],
                parseError: error?.message || 'Structured extraction failed',
                diagnostics: {
                    rawOpsCount: 0,
                    acceptedOpsCount: 0,
                    droppedOpsCount: 0,
                    droppedReasons: ['extraction_exception']
                }
            };
            console.warn('[TurnPostProcessing] extraction failed', {
                turnId: input.turnId,
                threadId: input.threadId,
                error: extraction.parseError
            });
        }

        let executionReport = emptyExecutionReport();
        if (extraction.ops.length > 0) {
            try {
                executionReport = await OpsExecutor.execute(
                    { ops: extraction.ops },
                    input.spaceId || undefined,
                    input.threadId,
                    { turnId: input.turnId }
                );
            } catch (error: any) {
                executionReport = {
                    executedCount: 0,
                    skippedCount: 0,
                    failedCount: extraction.ops.length,
                    logs: [{
                        op: 'POST_PROCESSING_EXECUTION',
                        status: 'failed',
                        detail: error?.message || 'Ops execution failed'
                    }]
                };
                console.warn('[TurnPostProcessing] ops execution failed', {
                    turnId: input.turnId,
                    threadId: input.threadId,
                    error: error?.message
                });
            }
        }

        let summary = emptySummaryResult();
        try {
            summary = await MemoryService.updateThreadSummaryIfNeeded(input.threadId, {
                provider: input.provider,
                requestId: input.turnId ? `${input.turnId}:summary` : undefined,
                turnId: input.turnId
            });
        } catch (error: any) {
            console.warn('[TurnPostProcessing] summary update failed', {
                turnId: input.turnId,
                threadId: input.threadId,
                error: error?.message
            });
        }

        console.log('[TurnPostProcessing] completed', {
            turnId: input.turnId,
            provider: input.provider,
            threadId: input.threadId,
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
