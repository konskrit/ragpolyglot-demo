import { statusLabel } from './statusLabel';

describe('statusLabel', () => {
  it('maps known statuses', () => {
    expect(statusLabel('ready')).toBe('Ready');
    expect(statusLabel('Processing')).toBe('Processing');
  });

  it('echoes unknown statuses', () => {
    expect(statusLabel('queued')).toBe('queued');
  });
});
