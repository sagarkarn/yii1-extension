import mysql from 'mysql2/promise';

(async () => {
  try {
    const conn = await mysql.createConnection({
        host: '127.0.0.1',
        port: 3306,
        user: 'root',
        password: '',
        database: 'ajg',
        family: 4
      });
      

    console.log('✅ CONNECTED');
    await conn.end();
  } catch (err) {
    console.error('❌ ERROR:', err);
  }
})();
