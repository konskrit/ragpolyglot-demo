import {
  appendAssistantText,
  applyChatComplete,
  finishAssistantMessage,
} from './chatMessages';
import type { Message } from '@ragpolyglot-shared';

const assistant = (text: string): Message => ({ role: 'assistant', text });

describe('chatMessages', () => {
  it('appends to the last assistant message', () => {
    const prev = [assistant('Hel')];
    expect(appendAssistantText(prev, 'lo')).toEqual([assistant('Hello')]);
  });

  it('finishAssistantMessage keeps text or uses fallback', () => {
    expect(
      finishAssistantMessage([assistant('  hi  ')], '(interrupted)'),
    ).toEqual([assistant('hi')]);
    expect(finishAssistantMessage([assistant('   ')], '(interrupted)')).toEqual(
      [assistant('(interrupted)')],
    );
  });

  it('applyChatComplete drains pending and attaches sources', () => {
    const got = applyChatComplete([assistant('A')], 'B', {
      sources: [
        {
          documentId: 'd1',
          documentTitle: 'Doc',
          similarity: 0.9,
          chunkContent: 'x',
        },
      ],
    });
    expect(got).toEqual([
      {
        role: 'assistant',
        text: 'AB',
        sources: [
          {
            documentId: 'd1',
            documentTitle: 'Doc',
            similarity: 0.9,
            chunkContent: 'x',
          },
        ],
      },
    ]);
  });
});
