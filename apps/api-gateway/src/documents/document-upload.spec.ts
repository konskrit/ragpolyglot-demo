import { AxiosError } from 'axios';
import { shouldDiscardUploadAfterFailure } from './document-upload';

function axiosError(
  partial: Partial<AxiosError> & { response?: AxiosError['response'] },
): AxiosError {
  return Object.assign(new Error('upstream'), partial, {
    isAxiosError: true,
  }) as AxiosError;
}

describe('shouldDiscardUploadAfterFailure', () => {
  it('discards on non-axios errors', () => {
    expect(shouldDiscardUploadAfterFailure(new Error('local'))).toBe(true);
  });

  it('keeps file when document-service responded', () => {
    expect(
      shouldDiscardUploadAfterFailure(
        axiosError({
          response: {
            status: 503,
            data: {},
            headers: {},
            statusText: '',
            config: {} as never,
          },
        }),
      ),
    ).toBe(false);
  });

  it('keeps file on timeout without response', () => {
    expect(
      shouldDiscardUploadAfterFailure(axiosError({ code: 'ECONNABORTED' })),
    ).toBe(false);
  });

  it('discards when upstream was unreachable', () => {
    expect(
      shouldDiscardUploadAfterFailure(axiosError({ code: 'ECONNREFUSED' })),
    ).toBe(true);
    expect(
      shouldDiscardUploadAfterFailure(axiosError({ code: 'ENOTFOUND' })),
    ).toBe(true);
  });
});
