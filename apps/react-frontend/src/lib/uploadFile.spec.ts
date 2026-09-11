import { validateUploadFile } from './uploadFile';

describe('validateUploadFile', () => {
  it('accepts a PDF with %PDF magic', async () => {
    const file = new File(['%PDF-1.4 content'], 'doc.pdf', {
      type: 'application/pdf',
    });
    await expect(validateUploadFile(file)).resolves.toBeNull();
  });

  it('rejects a non-PDF renamed as .pdf', async () => {
    const file = new File(['hello'], 'doc.pdf', { type: 'application/pdf' });
    await expect(validateUploadFile(file)).resolves.toMatch(/not a valid PDF/);
  });

  it('rejects a PDF renamed as .txt', async () => {
    const file = new File(['%PDF-1.4'], 'notes.txt', { type: 'text/plain' });
    await expect(validateUploadFile(file)).resolves.toMatch(/looks like a PDF/);
  });

  it('rejects unsupported extensions', async () => {
    const file = new File(['x'], 'img.png');
    await expect(validateUploadFile(file)).resolves.toMatch(/Unsupported/);
  });
});
