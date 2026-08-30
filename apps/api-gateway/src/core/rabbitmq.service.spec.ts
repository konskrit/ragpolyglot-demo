import { isPoisonMessageError, PoisonMessageError } from './rabbitmq.service';

describe('PoisonMessageError', () => {
  it('is detected for poison classification', () => {
    expect(isPoisonMessageError(new PoisonMessageError('bad'))).toBe(true);
    expect(isPoisonMessageError(new Error('bad'))).toBe(false);
  });
});
