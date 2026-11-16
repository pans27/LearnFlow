// Central database entry point for repositories and server shutdown.
export { getPrisma, disconnectPrisma as closeDatabase } from './lib/prisma';
