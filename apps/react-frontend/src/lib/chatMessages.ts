import type { ChatCompletePayload, Message } from '@ragpolyglot-shared';

export function finishAssistantMessage(
  prev: Message[],
  fallbackText: string,
): Message[] {
  const last = prev[prev.length - 1];
  if (!last || last.role !== 'assistant') return prev;
  return [
    ...prev.slice(0, -1),
    {
      ...last,
      text: last.text.trim() || fallbackText,
    },
  ];
}

export function appendAssistantText(
  prev: Message[],
  pending: string,
): Message[] {
  if (!pending) return prev;
  const last = prev[prev.length - 1];
  if (!last || last.role !== 'assistant') return prev;
  return [...prev.slice(0, -1), { ...last, text: last.text + pending }];
}

export function applyChatComplete(
  prev: Message[],
  pending: string,
  payload: Pick<ChatCompletePayload, 'interrupted' | 'error' | 'sources'>,
): Message[] {
  const last = prev[prev.length - 1];
  if (!last || last.role !== 'assistant') return prev;

  let text = last.text + pending;
  if (payload.interrupted && !text.trim()) {
    text = '(interrupted)';
  } else if (payload.error && !text.trim()) {
    text = 'Sorry, something went wrong.';
  }

  return [
    ...prev.slice(0, -1),
    {
      ...last,
      text,
      sources: payload.sources ?? [],
    },
  ];
}
