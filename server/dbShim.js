require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

const camelCaseMap = {
  soldto: 'soldTo', currentbid: 'currentBid', baseprice: 'basePrice',
  setname: 'setName', imageurl: 'imageUrl', battingrating: 'battingRating',
  bowlingrating: 'bowlingRating', bowlingtype: 'bowlingType', isxi: 'isXI',
  isimpactsub: 'isImpactSub', rtmcardsremaining: 'rtmCardsRemaining',
  roomcode: 'roomCode', teamid: 'teamId', playerid: 'playerId',
  retentiontype: 'retentionType', slotnumber: 'slotNumber',
  tournamentid: 'tournamentId', matchnumber: 'matchNumber',
  team1id: 'team1Id', team2id: 'team2Id', team1score: 'team1Score',
  team1wickets: 'team1Wickets', team1overs: 'team1Overs',
  team2score: 'team2Score', team2wickets: 'team2Wickets',
  team2overs: 'team2Overs', winnerid: 'winnerId',
  tosswinnerid: 'tossWinnerId', tossdecision: 'tossDecision',
  matchid: 'matchId', isimpactplayer: 'isImpactPlayer',
  runsfor: 'runsFor', oversfor: 'oversFor',
  runsagainst: 'runsAgainst', oversagainst: 'oversAgainst',
  noresult: 'noResult'
};

function formatRows(rows) {
  if (!rows) return rows;
  if (!Array.isArray(rows)) rows = [rows];
  return rows.map(row => {
    const newRow = {};
    for (let key in row) {
      newRow[camelCaseMap[key] || key] = row[key];
    }
    return newRow;
  });
}

function compilePostgresQuery(query) {
  let paramCount = 1;
  // SQLite allows double quotes for string literals; Postgres strictly enforces single quotes.
  let cleanQuery = query.replace(/"([^"]+)"/g, "'$1'");
  // Map ? bindings to $1, $2 etc.
  return cleanQuery.replace(/\?/g, () => `$${paramCount++}`);
}

const db = {
  get: (q, p = [], cb) => {
    if (typeof p === 'function') { cb = p; p = []; }
    const pgQuery = compilePostgresQuery(q);
    pool.query(pgQuery, p, (err, res) => {
      if (err) console.error('[Supabase GET Error]:', err.message, pgQuery);
      let formatted = res && res.rows.length > 0 ? formatRows(res.rows)[0] : null;
      if (cb) cb(err, formatted);
    });
  },

  all: (q, p = [], cb) => {
    if (typeof p === 'function') { cb = p; p = []; }
    const pgQuery = compilePostgresQuery(q);
    pool.query(pgQuery, p, (err, res) => {
      if (err) console.error('[Supabase ALL Error]:', err.message, pgQuery);
      if (cb) cb(err, res ? formatRows(res.rows) : []);
    });
  },

  run: (q, p = [], cb) => {
    if (typeof p === 'function') { cb = p; p = []; }
    let pgQuery = compilePostgresQuery(q);
    
    // Postgres strict Pool blocks - silently swallow standalone SQLite transaction controls
    const upperQ = pgQuery.trim().toUpperCase();
    if (upperQ === 'BEGIN TRANSACTION' || upperQ === 'COMMIT' || upperQ === 'ROLLBACK') {
      if (cb) cb.call({}, null);
      return;
    }

    const isInsert = upperQ.startsWith('INSERT');
    if (isInsert && !pgQuery.toUpperCase().includes('RETURNING')) {
      pgQuery += ' RETURNING id';
    }

    pool.query(pgQuery, p, function(err, res) {
      if (err) console.error('[Supabase RUN Error]:', err.message, pgQuery);
      if (cb) {
        const context = (isInsert && res && res.rows.length > 0) ? { lastID: res.rows[0].id } : {};
        cb.call(context, err);
      }
    });
  },

  serialize: (cb) => {
    if (cb) cb();
  }
};

module.exports = db;
