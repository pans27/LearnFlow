import { seedDefaultAdmin } from '../src/db/seed-admin';
import { closeDatabase } from '../src/database';

// Provision the default administrator and display its temporary password only on creation.
try {
  const result = await seedDefaultAdmin({ email: process.env.DEFAULT_ADMIN_EMAIL, password: process.env.DEFAULT_ADMIN_PASSWORD });
  if (result.created) {
    console.log(`Default admin created: ${result.email} (ID ${result.id})`);
    console.log(`Temporary password: ${result.temporaryPassword}`);
  } else {
    console.log(`Default admin already exists: ${result.email} (ID ${result.id}); account left unchanged`);
  }
} catch (error) {
  console.error('Default admin seed failed:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await closeDatabase();
}
