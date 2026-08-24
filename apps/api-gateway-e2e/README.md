HTTP + WebSocket tests against compose `--profile test` (starts `llm-stub` instead of LM Studio).

```bash
npm run test:integration
docker compose --profile test -p ragpolyglot-ci down -v
```

Needs `.env` (copy `.env.example`) and `.env.test.example`. Project `ragpolyglot-ci` keeps volumes off the local `docker compose up` stack.

Covers gateway health, upload → ready, WebSocket chat + interrupt, and REST `POST /api/chat`.
