import { MemoryService, SummaryUpdateResult } from './MemoryService';
import { OpsExecutionReport, OpsExecutor } from './OpsExecutor';
import { StructuredExtractionResult, StructuredExtractionService } from './StructuredExtractionService';

export interface TurnPostProcessingInput {
    threadId: string;
    spaceId: string | null;
    userMessage: string;
    assistantMessage: string;
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
            parseError: undefined
        };

        try {
            extraction = await StructuredExtractionService.extractFromTurn(
                input.userMessage,
                input.assistantMessage
            );
        } catch (error: any) {
            extraction = {
                raw: '',
                ops: [],
                parseError: error?.message || 'Structured extraction failed'
            };
            console.warn('[TurnPostProcessing] extraction failed', {
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
                    input.threadId
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
                    threadId: input.threadId,
                    error: error?.message
                });
            }
        }

        let summary = emptySummaryResult();
        try {
            summary = await MemoryService.updateThreadSummaryIfNeeded(input.threadId);
        } catch (error: any) {
            console.warn('[TurnPostProcessing] summary update failed', {
                threadId: input.threadId,
                error: error?.message
            });
        }

        console.log('[TurnPostProcessing] completed', {
            threadId: input.threadId,
            extractedOps: extraction.ops.length,
            parseError: !!extraction.parseError,
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
