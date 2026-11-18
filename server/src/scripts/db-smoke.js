const path = require('node:path');

require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });

const pool = require('../db/pool');
const { runMigrations } = require('../db/migrate');

async function runSmokeTest() {
  await runMigrations(pool);

  const result = await pool.query(
    `INSERT INTO "Telemetry_Logs" (event_type, message)
     VALUES ($1, $2)
     RETURNING id, event_type, message, created_at`,
    ['connection_pool_smoke_test', 'Local PostgreSQL connection verified'],
  );
  const [row] = result.rows;

  if (!row) {
    throw new Error('Telemetry smoke-test insert returned no row');
  }

  console.log(`Inserted Telemetry_Logs smoke-test row with id ${row.id}`);
}

runSmokeTest()
  .catch((error) => {
    console.error('PostgreSQL smoke test failed:', error.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
