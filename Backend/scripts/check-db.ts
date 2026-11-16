import { getPrisma, closeDatabase } from '../src/database';

// Verify the PostgreSQL connection with a query through Prisma.
try {
  await getPrisma().$queryRaw`SELECT 1`;
  console.log('PostgreSQL connection successful');
} catch (error) {
  console.error('PostgreSQL connection failed:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await closeDatabase();
}
