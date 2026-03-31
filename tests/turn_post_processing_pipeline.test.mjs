import test from 'node:test';
import assert from 'node:assert/strict';
import { runTurnPostProcessingPipeline } from '../src/services/turn_post_processing_utils.ts';

const withMutedConsoleWarn = async (fn) => {
  const originalWarn = console.warn;
  console.warn = () => {};
  try {
    return await fn();
  } finally {
    console.warn = originalWarn;
  }
};

test('runTurnPostProcessingPipeline degrades gracefully when extraction throws', async () => {
  let executeOpsCalls = 0;
  let updateSummaryCalls = 0;

  const result = await runTurnPostProcessingPipeline({
    extract: async () => {
      throw new Error('extract exploded');
    },
    executeOps: async () => {
      executeOpsCalls += 1;
      return {
        executedCount: 0,
        skippedCount: 0,
        failedCount: 0,
        logs: []
      };
    },
    updateSummary: async () => {
      updateSummaryCalls += 1;
      return {
        updated: true,
        summaryLength: 42,
        messageCount: 9
      };
    }
  });

  assert.equal(result.extraction.parseError, 'extract exploded');
  assert.equal(result.extraction.ops.length, 0);
  assert.equal(result.executionReport.failedCount, 0);
  assert.equal(result.summary.updated, true);
  assert.equal(executeOpsCalls, 0);
  assert.equal(updateSummaryCalls, 1);
  assert.equal(result.outcome, 'degraded');
});

test('runTurnPostProcessingPipeline keeps summary update when ops execution fails', async () => {
  let updateSummaryCalls = 0;

  const result = await runTurnPostProcessingPipeline({
    extract: async () => ({
      raw: '{"ops":[{"op":"UPSERT_FACT"}]}',
      ops: [{ op: 'UPSERT_FACT', data: { key: 'city', value: 'Athens' } }],
      diagnostics: {
        rawOpsCount: 1,
        acceptedOpsCount: 1,
        droppedOpsCount: 0,
        droppedReasons: []
      }
    }),
    executeOps: async () => {
      throw new Error('executor down');
    },
    updateSummary: async () => {
      updateSummaryCalls += 1;
      return {
        updated: true,
        summaryLength: 18,
        messageCount: 12
      };
    }
  });

  assert.equal(result.executionReport.failedCount, 1);
  assert.equal(result.executionReport.logs[0].op, 'POST_PROCESSING_EXECUTION');
  assert.equal(result.summary.updated, true);
  assert.equal(updateSummaryCalls, 1);
  assert.equal(result.outcome, 'degraded');
});

test('runTurnPostProcessingPipeline treats summary failure as non-fatal', async () => {
  const result = await runTurnPostProcessingPipeline({
    extract: async () => ({
      raw: '{"ops":[]}',
      ops: [],
      diagnostics: {
        rawOpsCount: 0,
        acceptedOpsCount: 0,
        droppedOpsCount: 0,
        droppedReasons: []
      }
    }),
    executeOps: async () => ({
      executedCount: 0,
      skippedCount: 0,
      failedCount: 0,
      logs: []
    }),
    updateSummary: async () => {
      throw new Error('summary unavailable');
    }
  });

  assert.equal(result.summary.updated, false);
  assert.equal(result.summary.summaryLength, 0);
  assert.equal(result.outcome, 'ok');
});

test('runTurnPostProcessingPipeline emits deterministic stage sequence', async () => {
  const events = [];

  await runTurnPostProcessingPipeline({
    extract: async () => ({
      raw: '{"ops":[]}',
      ops: [],
      diagnostics: {
        rawOpsCount: 0,
        acceptedOpsCount: 0,
        droppedOpsCount: 0,
        droppedReasons: []
      }
    }),
    executeOps: async () => ({
      executedCount: 0,
      skippedCount: 0,
      failedCount: 0,
      logs: []
    }),
    updateSummary: async () => ({
      updated: false,
      summaryLength: 0,
      messageCount: 5
    }),
    onStage: (event) => {
      events.push(`${event.stage}:${event.status}`);
    }
  });

  assert.deepEqual(events, [
    'extraction:done',
    'ops:skipped',
    'summary:done',
    'completed:done'
  ]);
});

test('runTurnPostProcessingPipeline emits failed extraction stage and degraded completion', async () => {
  const events = [];

  const result = await runTurnPostProcessingPipeline({
    extract: async () => {
      throw new Error('parse failed');
    },
    executeOps: async () => ({
      executedCount: 0,
      skippedCount: 0,
      failedCount: 0,
      logs: []
    }),
    updateSummary: async () => ({
      updated: false,
      summaryLength: 0,
      messageCount: 0
    }),
    onStage: (event) => {
      events.push(`${event.stage}:${event.status}`);
    }
  });

  assert.equal(result.outcome, 'degraded');
  assert.deepEqual(events, [
    'extraction:failed',
    'ops:skipped',
    'summary:done',
    'completed:failed'
  ]);
});

test('runTurnPostProcessingPipeline marks degraded when executeOps reports failures without throwing', async () => {
  const events = [];

  const result = await runTurnPostProcessingPipeline({
    extract: async () => ({
      raw: '{"ops":[{"op":"UPSERT_FACT"}]}',
      ops: [{ op: 'UPSERT_FACT', data: { key: 'city', value: 'Athens' } }],
      diagnostics: {
        rawOpsCount: 1,
        acceptedOpsCount: 1,
        droppedOpsCount: 0,
        droppedReasons: []
      }
    }),
    executeOps: async () => ({
      executedCount: 0,
      skippedCount: 0,
      failedCount: 1,
      logs: [{ op: 'UPSERT_FACT', status: 'failed', detail: 'db busy' }]
    }),
    updateSummary: async () => ({
      updated: true,
      summaryLength: 14,
      messageCount: 8
    }),
    onStage: (event) => {
      events.push(`${event.stage}:${event.status}`);
    }
  });

  assert.equal(result.outcome, 'degraded');
  assert.equal(result.executionReport.failedCount, 1);
  assert.deepEqual(events, [
    'extraction:done',
    'ops:done',
    'summary:done',
    'completed:failed'
  ]);
});

test('runTurnPostProcessingPipeline marks degraded when extraction returns parseError without throwing', async () => {
  let executeOpsCalls = 0;
  const result = await runTurnPostProcessingPipeline({
    extract: async () => ({
      raw: '{"ops":[{"op":"UPSERT_FACT"}]}',
      ops: [{ op: 'UPSERT_FACT', data: { key: 'city', value: 'Athens' } }],
      parseError: 'json_parse_failed',
      diagnostics: {
        rawOpsCount: 1,
        acceptedOpsCount: 1,
        droppedOpsCount: 0,
        droppedReasons: ['json_parse_failed']
      }
    }),
    executeOps: async () => {
      executeOpsCalls += 1;
      return {
        executedCount: 1,
        skippedCount: 0,
        failedCount: 0,
        logs: []
      };
    },
    updateSummary: async () => ({
      updated: true,
      summaryLength: 22,
      messageCount: 10
    })
  });

  assert.equal(executeOpsCalls, 1);
  assert.equal(result.extraction.parseError, 'json_parse_failed');
  assert.equal(result.executionReport.failedCount, 0);
  assert.equal(result.outcome, 'degraded');
});

test('runTurnPostProcessingPipeline keeps completed stage done when only summary update fails', async () => {
  const events = [];

  const result = await runTurnPostProcessingPipeline({
    extract: async () => ({
      raw: '{"ops":[]}',
      ops: [],
      diagnostics: {
        rawOpsCount: 0,
        acceptedOpsCount: 0,
        droppedOpsCount: 0,
        droppedReasons: []
      }
    }),
    executeOps: async () => ({
      executedCount: 0,
      skippedCount: 0,
      failedCount: 0,
      logs: []
    }),
    updateSummary: async () => {
      throw new Error('summary backend unavailable');
    },
    onStage: (event) => {
      events.push(`${event.stage}:${event.status}`);
    }
  });

  assert.equal(result.outcome, 'ok');
  assert.deepEqual(events, [
    'extraction:done',
    'ops:skipped',
    'summary:failed',
    'completed:done'
  ]);
});

test('runTurnPostProcessingPipeline isolates onStage callback failures from pipeline result', async () => {
  const seenEvents = [];

  const result = await withMutedConsoleWarn(async () => {
    return await runTurnPostProcessingPipeline({
      extract: async () => ({
        raw: '{"ops":[]}',
        ops: [],
        diagnostics: {
          rawOpsCount: 0,
          acceptedOpsCount: 0,
          droppedOpsCount: 0,
          droppedReasons: []
        }
      }),
      executeOps: async () => ({
        executedCount: 0,
        skippedCount: 0,
        failedCount: 0,
        logs: []
      }),
      updateSummary: async () => ({
        updated: false,
        summaryLength: 0,
        messageCount: 3
      }),
      onStage: (event) => {
        seenEvents.push(`${event.stage}:${event.status}`);
        if (event.stage === 'ops') {
          throw new Error('observer failed');
        }
      }
    });
  });

  assert.equal(result.outcome, 'ok');
  assert.equal(result.summary.updated, false);
  assert.deepEqual(seenEvents, [
    'extraction:done',
    'ops:skipped',
    'summary:done',
    'completed:done'
  ]);
});

test('runTurnPostProcessingPipeline keeps degraded extraction result even when failed-stage callback throws', async () => {
  const result = await withMutedConsoleWarn(async () => {
    return await runTurnPostProcessingPipeline({
      extract: async () => {
        throw new Error('extract stage crashed');
      },
      executeOps: async () => ({
        executedCount: 0,
        skippedCount: 0,
        failedCount: 0,
        logs: []
      }),
      updateSummary: async () => ({
        updated: false,
        summaryLength: 0,
        messageCount: 0
      }),
      onStage: (event) => {
        if (event.stage === 'extraction' && event.status === 'failed') {
          throw new Error('observer failed on extraction failure');
        }
      }
    });
  });

  assert.equal(result.outcome, 'degraded');
  assert.equal(result.extraction.parseError, 'extract stage crashed');
  assert.equal(result.executionReport.failedCount, 0);
});
