export interface TurnPostProcessingExecutionReport {
    executedCount: number;
    skippedCount: number;
    failedCount: number;
    logs: Array<{
        op: string;
        status: 'executed' | 'skipped' | 'failed';
        detail: string;
    }>;
}

export interface TurnPostProcessingSummaryResult {
    updated: boolean;
    summaryLength: number;
    messageCount: number;
}

export interface TurnPostProcessingExtractionResult {
    raw: string;
    ops: unknown[];
    parseError?: string;
    diagnostics: {
        rawOpsCount: number;
        acceptedOpsCount: number;
        droppedOpsCount: number;
        droppedReasons: string[];
    };
}

export type TurnPostProcessingOutcome = 'ok' | 'degraded';

export type TurnPostProcessingStage = 'extraction' | 'ops' | 'summary' | 'completed';

export interface TurnPostProcessingStageEvent {
    stage: TurnPostProcessingStage;
    status: 'done' | 'failed' | 'skipped';
    detail?: string;
    meta?: Record<string, unknown>;
}

interface RunTurnPostProcessingPipelineInput {
    extract: () => Promise<TurnPostProcessingExtractionResult>;
    executeOps: (ops: unknown[]) => Promise<TurnPostProcessingExecutionReport>;
    updateSummary: () => Promise<TurnPostProcessingSummaryResult>;
    onStage?: (event: TurnPostProcessingStageEvent) => void;
}

export interface RunTurnPostProcessingPipelineResult {
    extraction: TurnPostProcessingExtractionResult;
    executionReport: TurnPostProcessingExecutionReport;
    summary: TurnPostProcessingSummaryResult;
    outcome: TurnPostProcessingOutcome;
}

const toErrorMessage = (error: unknown, fallback: string): string => {
    if (error instanceof Error && error.message.trim().length > 0) {
        return error.message.trim();
    }
    if (typeof error === 'string' && error.trim().length > 0) {
        return error.trim();
    }
    return fallback;
};

export const emptyExtractionResult = (): TurnPostProcessingExtractionResult => ({
    raw: '',
    ops: [],
    parseError: undefined,
    diagnostics: {
        rawOpsCount: 0,
        acceptedOpsCount: 0,
        droppedOpsCount: 0,
        droppedReasons: []
    }
});

export const emptyExecutionReport = (): TurnPostProcessingExecutionReport => ({
    executedCount: 0,
    skippedCount: 0,
    failedCount: 0,
    logs: []
});

export const emptySummaryResult = (): TurnPostProcessingSummaryResult => ({
    updated: false,
    summaryLength: 0,
    messageCount: 0
});

export const extractionExceptionResult = (message: string): TurnPostProcessingExtractionResult => ({
    raw: '',
    ops: [],
    parseError: message,
    diagnostics: {
        rawOpsCount: 0,
        acceptedOpsCount: 0,
        droppedOpsCount: 0,
        droppedReasons: ['extraction_exception']
    }
});

export const opsExecutionFailureReport = (
    failedCount: number,
    detail: string
): TurnPostProcessingExecutionReport => ({
    executedCount: 0,
    skippedCount: 0,
    failedCount,
    logs: [{
        op: 'POST_PROCESSING_EXECUTION',
        status: 'failed',
        detail
    }]
});

export const derivePostProcessingOutcome = (
    input: {
        parseError?: string;
        failedCount: number;
    }
): TurnPostProcessingOutcome => {
    if (input.parseError) return 'degraded';
    if (input.failedCount > 0) return 'degraded';
    return 'ok';
};

export const runTurnPostProcessingPipeline = async (
    input: RunTurnPostProcessingPipelineInput
): Promise<RunTurnPostProcessingPipelineResult> => {
    const onStage = input.onStage;

    let extraction = emptyExtractionResult();
    try {
        extraction = await input.extract();
        onStage?.({
            stage: 'extraction',
            status: 'done',
            meta: {
                extractedOps: extraction.ops.length,
                parseError: extraction.parseError,
                droppedOps: extraction.diagnostics.droppedOpsCount
            }
        });
    } catch (error) {
        extraction = extractionExceptionResult(
            toErrorMessage(error, 'Structured extraction failed')
        );
        onStage?.({
            stage: 'extraction',
            status: 'failed',
            detail: extraction.parseError
        });
    }

    let executionReport = emptyExecutionReport();
    if (extraction.ops.length > 0) {
        try {
            executionReport = await input.executeOps(extraction.ops);
            onStage?.({
                stage: 'ops',
                status: 'done',
                meta: {
                    executed: executionReport.executedCount,
                    skipped: executionReport.skippedCount,
                    failed: executionReport.failedCount
                }
            });
        } catch (error) {
            executionReport = opsExecutionFailureReport(
                extraction.ops.length,
                toErrorMessage(error, 'Ops execution failed')
            );
            onStage?.({
                stage: 'ops',
                status: 'failed',
                detail: executionReport.logs[0]?.detail || 'Ops execution failed',
                meta: {
                    failed: executionReport.failedCount
                }
            });
        }
    } else {
        onStage?.({
            stage: 'ops',
            status: 'skipped',
            detail: 'No extracted ops to execute'
        });
    }

    let summary = emptySummaryResult();
    try {
        summary = await input.updateSummary();
        onStage?.({
            stage: 'summary',
            status: 'done',
            meta: {
                summaryUpdated: summary.updated,
                summaryLength: summary.summaryLength
            }
        });
    } catch (error) {
        onStage?.({
            stage: 'summary',
            status: 'failed',
            detail: toErrorMessage(error, 'Summary update failed')
        });
    }

    const outcome = derivePostProcessingOutcome({
        parseError: extraction.parseError,
        failedCount: executionReport.failedCount
    });
    onStage?.({
        stage: 'completed',
        status: outcome === 'ok' ? 'done' : 'failed',
        detail: outcome,
        meta: {
            extractedOps: extraction.ops.length,
            failedOps: executionReport.failedCount,
            summaryUpdated: summary.updated
        }
    });

    return {
        extraction,
        executionReport,
        summary,
        outcome
    };
};
