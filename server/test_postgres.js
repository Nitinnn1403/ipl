require('dotenv').config({ path: '.env' });
const { Client } = require('pg');

const client = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function run() {
  await client.connect();
  console.log("Connected directly to Supabase.");
  try {
     const res2 = await client.query("SELECT COUNT(*) as count FROM players WHERE status = 'AVAILABLE'");
     console.log("COUNT ROWS:", JSON.stringify(res2.rows));

     const res3 = await client.query("SELECT id, name FROM teams LIMIT 1");
     console.log("TEAMS ROWS:", JSON.stringify(res3.rows));

  } catch(e) {
     console.error("NATIVE POSTGRES ERROR:", e.message);
  } finally {
     await client.end();
  }
}
run();
