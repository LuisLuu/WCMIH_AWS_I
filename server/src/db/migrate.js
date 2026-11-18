const fs = require('node:fs/promises');
const path = require('node:path');
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });

const pool = require('./pool');

const migrationsDirectory = path.join(__dirname, 'migrations');

async function runMigrations(database = pool) {
  const client = await database.connect();

  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS "schema_migrations" (
        name TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    const migrationFiles = (await fs.readdir(migrationsDirectory))
      .filter((file) => file.endsWith('.sql'))
      .sort();

    for (const migrationFile of migrationFiles) {
      await client.query('BEGIN');

      try {
        const applied = await client.query(
          'SELECT 1 FROM "schema_migrations" WHERE name = $1',
          [migrationFile],
        );

        if (applied.rowCount > 0) {
          await client.query('COMMIT');
          continue;
        }

        const migration = await fs.readFile(
          path.join(migrationsDirectory, migrationFile),
          'utf8',
        );
        await client.query(migration);
        await client.query(
          'INSERT INTO "schema_migrations" (name) VALUES ($1)',
          [migrationFile],
        );
        await client.query('COMMIT');
        console.log(`Applied migration ${migrationFile}`);
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
    }
  } finally {
    client.release();
  }
}

if (require.main === module) {
  runMigrations()
    .catch((error) => {
      console.error('Database migration failed:', error.message);
      process.exitCode = 1;
    })
    .finally(() => pool.end());
}

module.exports = { runMigrations };
