const { Pool } = require('pg');

const connectionString = process.env.DATABASE_URL;

if (!connectionString || connectionString.startsWith('replace-with-')) {
  throw new Error('Set DATABASE_URL to a local PostgreSQL connection string');
}

const pool = new Pool({ connectionString });

pool.on('error', (error) => {
  console.error('Unexpected error on an idle PostgreSQL connection', error.code || 'unknown error');
});

module.exports = pool;
