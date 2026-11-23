# Dewi Sri API

Express and TypeScript service for the existing `dewi_sri` MySQL database. This service only reads the catalog; it does not run schema or seed scripts.

## Local setup

Use Node.js 22 LTS or newer. Start MySQL in Laragon and ensure the existing database has the schema and seed described in the root README. From `backend/`:

```sh
npm install
cp .env.example .env
npm run dev
```

On Windows PowerShell, use `Copy-Item .env.example .env` instead of `cp` if preferred. Set `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, and `DB_NAME` to your actual Laragon connection details. The sample empty password is not assumed by the code. `HOST` and `PORT` bind the API (default `127.0.0.1:3001`), and `FRONTEND_ORIGIN` is the one allowed browser origin (default `http://localhost:3000`). All values are validated at startup. `.env` is ignored by Git.

Run `npm run typecheck`, `npm run build`, `npm test`, and `npm start` for validation and built startup. The frontend continues separately with `npm run dev` from the repository root.

## API

All responses use `success` and either `data`, `message`, or `error`.

| Endpoint | Result |
| --- | --- |
| `GET /api/v1/health` | Process availability |
| `GET /api/v1/health/database` | Read-only database and configured schema check; 503 on failure |
| `GET /api/v1/categories` | Active categories with `parentId` |
| `GET /api/v1/species` | Published species with active categories |
| `GET /api/v1/species/:slug` | Published species, public media, active care actions, published guides |

After starting, open `http://127.0.0.1:3001/api/v1/health/database` and `http://127.0.0.1:3001/api/v1/species/sorgum`. A failed database check returns 503 without exposing connection details.

## Architecture and limits

`src/config` validates environment variables and owns the MySQL connection pool. `src/modules/catalog/repository.ts` contains parameterized read-only queries against the existing tables. `src/app.ts` handles HTTP routing, validation, CORS, Helmet, and error responses. `src/integrations/rag.ts` defines the future server-side RAG boundary only.

The frontend still uses static species data and localStorage. Authentication, user persistence, CMS writes, and RAG calls are not implemented. Administrative mutations require real authentication and authorization before adding routes. Future CMS modules can be placed alongside `catalog`, with SQL changes maintained for manual execution through phpMyAdmin. No migration or automatic schema synchronization runs at startup.
