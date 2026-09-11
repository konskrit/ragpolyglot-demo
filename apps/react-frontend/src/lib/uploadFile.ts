const ALLOWED_EXTENSIONS = new Set([
  '.txt',
  '.md',
  '.markdown',
  '.json',
  '.pdf',
]);

function fileExtension(name: string): string {
  const i = name.lastIndexOf('.');
  return i < 0 ? '' : name.slice(i).toLowerCase();
}

function startsWithPdfMagic(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 4 &&
    bytes[0] === 0x25 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x44 &&
    bytes[3] === 0x46
  );
}

function readHead(file: File, n: number): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
    reader.onerror = () => reject(reader.error ?? new Error('read failed'));
    reader.readAsArrayBuffer(file.slice(0, n));
  });
}

export async function validateUploadFile(file: File): Promise<string | null> {
  if (!file.name.trim()) {
    return 'Title is required.';
  }

  const ext = fileExtension(file.name);
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    return `Unsupported file type "${ext || '(none)'}". Allowed: ${[...ALLOWED_EXTENSIONS].join(', ')}`;
  }

  const head = await readHead(file, 5);
  if (ext === '.pdf') {
    if (!startsWithPdfMagic(head)) {
      return `${file.name} is not a valid PDF`;
    }
    return null;
  }

  if (startsWithPdfMagic(head)) {
    return `${file.name} looks like a PDF but has extension ${ext}`;
  }
  return null;
}
