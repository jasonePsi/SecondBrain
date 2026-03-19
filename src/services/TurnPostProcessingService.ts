import { MemoryService, SummaryUpdateResult } from './MemoryService';
import { OpsExecutionReport, OpsExecutor } from './OpsExecutor';
import { StructuredExtractionResult, StructuredExtractionService } from './StructuredExtractionService';
import {
    emptyExecutionReport,
    emptySummaryResult,
    extractionExceptionResult,
    opsExecutionFailureReport
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
            extraction = await extractFromTurn(
                input.userMessage,
                input.assistantMessage,
                {
                    provider: input.provider,
                    requestId: input.turnId ? `${input.turnId}:extract` : undefined,
                    turnId: input.turnId
                }
            );
        } catch (error: any) {
            extraction = extractionExceptionResult(
                error?.message || 'Structured extraction failed'
            ) as StructuredExtractionResult;
            console.warn('[TurnPostProcessing] extraction failed', {
                turnId: input.turnId,
                threadId: input.threadId,
                error: extraction.parseError
            });
        }

        let executionReport = emptyExecutionReport();
        if (extraction.ops.length > 0) {
            try {
                executionReport = await executeOps(
                    { ops: extraction.ops },
                    input.spaceId || undefined,
                    input.threadId,
                    { turnId: input.turnId }
                );
            } catch (error: any) {
                executionReport = opsExecutionFailureReport(
                    extraction.ops.length,
                    error?.message || 'Ops execution failed'
                );
                console.warn('[TurnPostProcessing] ops execution failed', {
                    turnId: input.turnId,
                    threadId: input.threadId,
                    error: error?.message
                });
            }
        }

        let summary = emptySummaryResult();
        try {
            summary = await updateSummary(input.threadId, {
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
