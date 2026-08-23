Integration tests against the main stack with `--profile test` (starts `llm-stub`).

```bash
npm run test:integration
docker compose --profile test -p ragpolyglot-ci down -v
```

Requires `.env` (from `.env.example`) and `.env.test`. Project name `ragpolyglot-ci` keeps volumes separate from local `docker compose up`.
