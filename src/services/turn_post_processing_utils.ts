interface TurnPostProcessingExecutionReport {
    executedCount: number;
    skippedCount: number;
    failedCount: number;
    logs: Array<{
        op: string;
        status: 'executed' | 'skipped' | 'failed';
        detail: string;
    }>;
}

interface TurnPostProcessingSummaryResult {
    updated: boolean;
    summaryLength: number;
    messageCount: number;
}

interface TurnPostProcessingExtractionResult {
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
