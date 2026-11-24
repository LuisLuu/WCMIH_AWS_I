const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/37_38_WCM'
});
async function runMigration() {
  const client = await pool.connect();
  try {
    console.log('🔄 Đang kết nối database và chạy migration 006...');
    const migrationPath = path.join(process.cwd(), 'src', 'db', 'migrations', '006_resize_embedding_to_768.sql');
    const sql = fs.readFileSync(migrationPath, 'utf8');
    await client.query(sql);
    console.log('✅ Chạy migration 006 (vector 768 chiều) thành công!');
  } catch (error) {
    console.error('❌ Lỗi khi chạy migration:', error.message);
  } finally {
    client.release();
    await pool.end();
  }
}
runMigration();
