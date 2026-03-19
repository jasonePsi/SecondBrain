import test from 'node:test';
import assert from 'node:assert/strict';
import {
  emptyExecutionReport,
  emptySummaryResult,
  extractionExceptionResult,
  opsExecutionFailureReport
} from '../src/services/turn_post_processing_utils.ts';

test('emptyExecutionReport returns zeroed counters and no logs', () => {
  const report = emptyExecutionReport();
  assert.equal(report.executedCount, 0);
  assert.equal(report.skippedCount, 0);
  assert.equal(report.failedCount, 0);
  assert.deepEqual(report.logs, []);
});

test('extractionExceptionResult returns parseError diagnostics', () => {
  const result = extractionExceptionResult('extract exploded');
  assert.equal(result.parseError, 'extract exploded');
  assert.equal(result.ops.length, 0);
  assert.ok(result.diagnostics.droppedReasons.includes('extraction_exception'));
});

test('opsExecutionFailureReport includes failed op summary', () => {
  const report = opsExecutionFailureReport(3, 'executor down');
  assert.equal(report.failedCount, 3);
  assert.equal(report.logs.length, 1);
  assert.equal(report.logs[0].op, 'POST_PROCESSING_EXECUTION');
  assert.equal(report.logs[0].status, 'failed');
});

test('emptySummaryResult returns no-op summary state', () => {
  const summary = emptySummaryResult();
  assert.equal(summary.updated, false);
  assert.equal(summary.summaryLength, 0);
  assert.equal(summary.messageCount, 0);
});
