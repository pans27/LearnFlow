import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../generated/prisma/client';
import { config } from '../config';

let prisma: PrismaClient | undefined;

// Defer creating the client until database access is needed.
export function getPrisma(): PrismaClient {
  if (!config.databaseUrl) {
    throw new Error('Set DATABASE_URL before using the database');
  }
  if (!prisma) {
    const adapter = new PrismaPg({
      connectionString: config.databaseUrl,
      connectionTimeoutMillis: 5000,
    });
    prisma = new PrismaClient({ adapter });
  }
  return prisma;
}

export async function disconnectPrisma(): Promise<void> {
  if (prisma) {
    await prisma.$disconnect();
    prisma = undefined;
  }
}
