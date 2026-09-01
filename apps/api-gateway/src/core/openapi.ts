import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { apiReference } from '@scalar/nestjs-api-reference';

const WS_DOCS = `
## WebSocket (Socket.IO namespace \`/ws\`)

Not part of OpenAPI — connect with Socket.IO client.

| Direction | Event | Payload |
| --- | --- | --- |
| client → server | \`chat:query\` | \`{ message, conversationId?, userId?, topK? }\` |
| server → client | \`chat:token\` | \`{ token, conversationId? }\` |
| server → client | \`chat:complete\` | \`{ conversationId, sources?, error?, interrupted?, cacheHit? }\` |
| client → server | \`chat:interrupt\` | \`{ conversationId? }\` |
| client → server | \`subscribe:document\` | \`{ documentId }\` |
| server → client | \`document:status-update\` | \`{ documentId, status, progressStage?, progressDone?, progressTotal?, timestamp? }\` |

\`status\`: \`uploading\` | \`processing\` | \`paused\` | \`ready\` | \`failed\`. \`progressStage\`: \`waiting_for_ocr\` | \`extracting\` | \`embedding\`.
`;

export function setupOpenApi(app: INestApplication): void {
  const config = new DocumentBuilder()
    .setTitle('RAGPolyglot API Gateway')
    .setDescription(
      'Public REST surface for documents, chat, conversations, health, and metrics. ' +
        'Response schemas mirror the gateway contract (see also `libs/shared` TypeScript types).' +
        WS_DOCS,
    )
    .setVersion('1.0')
    .build();

  const document = SwaggerModule.createDocument(app, config);

  SwaggerModule.setup('openapi', app, document, {
    jsonDocumentUrl: 'openapi.json',
    swaggerUiEnabled: false,
  });

  app.use(
    '/docs',
    apiReference({
      content: document,
      pageTitle: 'RAGPolyglot API',
    }),
  );
}
