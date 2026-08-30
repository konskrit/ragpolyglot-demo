import {
  mapConversationMessages,
  mapConversations,
  toChatMessages,
} from './conversations';

describe('mapConversations', () => {
  it('returns empty array for non-arrays', () => {
    expect(mapConversations(null)).toEqual([]);
  });

  it('maps valid rows and skips malformed ones', () => {
    expect(
      mapConversations([
        {
          id: 'a',
          title: 'What is RAG?',
          createdAt: '2026-01-01T00:00:00Z',
          updatedAt: '2026-01-02T00:00:00Z',
        },
        { id: 'b', title: 'missing dates' },
      ]),
    ).toEqual([
      {
        id: 'a',
        title: 'What is RAG?',
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-02T00:00:00Z',
      },
    ]);
  });
});

describe('mapConversationMessages', () => {
  it('accepts numeric string ids from postgres', () => {
    const mapped = mapConversationMessages([
      {
        id: '12',
        conversationId: 'c1',
        role: 'user',
        text: 'hello',
        createdAt: '2026-01-01T00:00:00Z',
      },
    ]);
    expect(mapped).toEqual([
      {
        id: 12,
        conversationId: 'c1',
        role: 'user',
        text: 'hello',
        createdAt: '2026-01-01T00:00:00Z',
      },
    ]);
    expect(toChatMessages(mapped)).toEqual([{ role: 'user', text: 'hello' }]);
  });
});
