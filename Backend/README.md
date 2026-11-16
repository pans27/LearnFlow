# LearnFlow backend

Express 5 API skeleton using TypeScript ES modules and PostgreSQL through Prisma
with the PostgreSQL adapter, matching the Prisma 7 approach in `a2`.
The layout follows the server, router, middleware, and database separation in `a2`.

## Local setup

Use Node.js 24 (also specified in `.nvmrc` and `package.json`). Dependency version
ranges match the corresponding packages in `a2`. From `Backend`:

```powershell
npm install
Copy-Item .env.example .env
# Edit .env with your local PostgreSQL credentials and database name.
npm run prisma:generate
npm run typecheck
npm run dev
```

`npm start` runs through tsx without file watching, matching `a2`. Run `npm run typecheck` to check TypeScript types. `GET http://localhost:3000/api/health`
returns `{ "status": "ok" }`. The API starts without a database connection;
create a PostgreSQL database separately and run `npm run db:check` to verify it.
No tables or schema changes are applied automatically.

## Structure

- `src/app.ts`: Express application, exported separately for future tests.
- `src/server.ts`: HTTP listener and graceful shutdown.
- `src/config.ts`: environment configuration.
- `src/routes.ts` and `src/routes/`: API router and future feature routers.
- `src/middleware.ts`: logging, JSON errors, and unknown-route handling.
- `src/database.ts`: shared database entry point and shutdown export.
- `src/lib/prisma.ts`: lazy Prisma client with the PostgreSQL adapter.
- `prisma/schema.prisma`: generator, datasource, and future models.
- `prisma.config.ts`: Prisma CLI connection and migration configuration.
- `generated/prisma/`: generated client, excluded from Git.
- `src/services/`: future business logic.
- `src/repositories/`: future database queries.
- `scripts/check-db.ts`: explicit database connectivity check.

Use `../learnflow-openapi.yaml` as the proposed API contract. The SQL files in
the repository root document the schema options; select a schema strategy before
adding migrations. Authentication, authorization, migrations, and feature
endpoints are intentionally left for later implementation. Unknown routes return
404; only the health endpoint is currently implemented.

## Prisma workflow

The schema has no domain models yet. Add models when implementing the data layer.
Regenerate the client after schema changes and after installing or updating Prisma.
Generation does not connect to PostgreSQL or apply tables.

- `npm run prisma:validate`: validate the schema.
- `npm run prisma:generate`: generate the client before running or type checking.
- `npm run db:check`: execute `SELECT 1` through Prisma.
- `npm run db:migrate -- --name initial`: create and apply a development migration
  once models are defined and the database is configured.
- `npm run db:deploy`: apply committed migrations during deployment.
- `npm run db:studio`: open Prisma's database browser.

Repositories should call `getPrisma()` from `src/database.ts` and use generated
model methods once available. Select one of the repository-root SQL schema
strategies before implementing models; existing tables would need a migration
baseline before Prisma Migrate manages them.
