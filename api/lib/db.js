const { neon } = require('@neondatabase/serverless');

function getDb() {
  const sql = neon(process.env.DATABASE_URL);
  return sql;
}

module.exports = { getDb };
