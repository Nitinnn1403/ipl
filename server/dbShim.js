require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

function compilePostgresQuery(query) {
  let paramCount = 1;
  return query.replace(/\?/g, () => `$${paramCount++}`);
}

const db = {
  get: (q, p = [], cb) => {
    if (typeof p === 'function') { cb = p; p = []; }
    const pgQuery = compilePostgresQuery(q);
    pool.query(pgQuery, p, (err, res) => {
      if (err) console.error('[Supabase GET Error]:', err.message, pgQuery);
      if (cb) cb(err, res && res.rows.length > 0 ? res.rows[0] : null);
    });
  },

  all: (q, p = [], cb) => {
    if (typeof p === 'function') { cb = p; p = []; }
    const pgQuery = compilePostgresQuery(q);
    pool.query(pgQuery, p, (err, res) => {
      if (err) console.error('[Supabase ALL Error]:', err.message, pgQuery);
      if (cb) cb(err, res ? res.rows : []);
    });
  },

  run: (q, p = [], cb) => {
    if (typeof p === 'function') { cb = p; p = []; }
    let pgQuery = compilePostgresQuery(q);
    
    // Automatically inject RETURNING id into Postgres INSERT statements to emulate this.lastID
    const isInsert = pgQuery.trim().toUpperCase().startsWith('INSERT');
    if (isInsert && !pgQuery.toUpperCase().includes('RETURNING')) {
      pgQuery += ' RETURNING id';
    }

    pool.query(pgQuery, p, function(err, res) {
      if (err) console.error('[Supabase RUN Error]:', err.message, pgQuery);
      if (cb) {
        // Construct the expected 'this' context context with lastID
        const context = (isInsert && res && res.rows.length > 0) ? { lastID: res.rows[0].id } : {};
        cb.call(context, err);
      }
    });
  },

  serialize: (cb) => {
    // Isolated shim simulation for sequential operations.
    if (cb) cb();
  }
};

module.exports = db;
