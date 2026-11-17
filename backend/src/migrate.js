const fs = require('fs');
const path = require('path');
const { pool } = require('./config/db');

async function runMigrations() {
  const client = await pool.connect();
  try {
    console.log('--- 1. Checking database connection ---');
    const testRes = await client.query('SELECT NOW() AS current_time');
    console.log('✅ Connected successfully! Server time:', testRes.rows[0].current_time);

    console.log('\n--- 2. Running migration files ---');
    const migrationsDir = path.join(__dirname, 'migrations');
    const files = fs.readdirSync(migrationsDir).sort();

    for (const file of files) {
      if (file.endsWith('.sql')) {
        console.log(`Running: ${file}...`);
        const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
        await client.query(sql);
        console.log(`✅ Completed: ${file}`);
      }
    }

    console.log('\n--- 3. Checking pgvector extension ---');
    const extRes = await client.query("SELECT extname FROM pg_extension WHERE extname = 'vector'");
    if (extRes.rows.length > 0) {
      console.log('✅ The pgvector extension is enabled.');
    } else {
      console.warn('⚠️ Warning: The vector extension was not found.');
    }

    console.log('\n🎉 All migrations completed successfully!');
  } catch (err) {
    console.error('❌ An error occurred:', err);
  } finally {
    client.release();
    await pool.end();
  }
}

runMigrations();
