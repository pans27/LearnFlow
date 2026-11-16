// Central database entry point for db and server shutdown.
export { getPrisma, disconnectPrisma as closeDatabase } from './lib/prisma';
