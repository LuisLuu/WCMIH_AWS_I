const fs = require('fs');
const path = require('path');
const { pool } = require('./config/db');

async function runMigrations() {
  const client = await pool.connect();
  try {
    console.log('--- 1. Kiểm tra kết nối tới Database ---');
    const testRes = await client.query('SELECT NOW() AS current_time');
    console.log('✅ Kết nối thành công! Giờ máy chủ:', testRes.rows[0].current_time);

    console.log('\n--- 2. Bắt đầu chạy các file Migration ---');
    const migrationsDir = path.join(__dirname, 'migrations');
    const files = fs.readdirSync(migrationsDir).sort();

    for (const file of files) {
      if (file.endsWith('.sql')) {
        console.log(`Đang chạy: ${file}...`);
        const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
        await client.query(sql);
        console.log(`✅ Hoàn thành: ${file}`);
      }
    }

    console.log('\n--- 3. Kiểm tra Extension pgvector ---');
    const extRes = await client.query("SELECT extname FROM pg_extension WHERE extname = 'vector'");
    if (extRes.rows.length > 0) {
      console.log('✅ Extension pgvector đã được kích hoạt thành công!');
    } else {
      console.warn('⚠️ Cảnh báo: Chưa tìm thấy extension vector.');
    }

    console.log('\n🎉 Chạy thành công toàn bộ Migration!');
  } catch (err) {
    console.error('❌ Lỗi xảy ra:', err);
  } finally {
    client.release();
    await pool.end();
  }
}

runMigrations();
