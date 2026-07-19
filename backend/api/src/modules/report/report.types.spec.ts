import { strict as assert } from 'node:assert';
import { isRetryableFailureCategory } from './report.types';

describe('report failure retryability', () => {
  it('exposes regeneration-required as user retryable', () => {
    assert.equal(isRetryableFailureCategory('REGENERATION_REQUIRED'), true);
  });
});
