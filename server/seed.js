require('dotenv').config();
const { Client } = require('pg');
const path = require('path');
const fs = require('fs');

const client = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function runSeed() {
  await client.connect();
  console.log("Connected to Supabase PostgreSQL.");

  try {
    // Drop existing tables
    const tables = ['match_xi', 'standings', 'matches', 'tournaments', 'retentions', 'teams', 'players'];
    for (const table of tables) {
      await client.query(`DROP TABLE IF EXISTS ${table} CASCADE`);
    }

    console.log("Dropped old tables. Creating new tables...");

    // Create players table using exact camelCase double quotes for JS object compatibility (Postgres downcases otherwise)
    await client.query(`CREATE TABLE players (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      role TEXT,
      country TEXT,
      basePrice INTEGER,
      currentBid INTEGER DEFAULT 0,
      soldTo TEXT DEFAULT NULL,
      status TEXT DEFAULT 'AVAILABLE',
      setName TEXT,
      imageUrl TEXT,
      battingRating INTEGER DEFAULT 50,
      bowlingRating INTEGER DEFAULT 50,
      specialty TEXT,
      bowlingType TEXT,
      age INTEGER,
      isXI INTEGER DEFAULT 0,
      isImpactSub INTEGER DEFAULT 0
    )`);

    // Create teams table
    await client.query(`CREATE TABLE teams (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      purse INTEGER,
      logoUrl TEXT,
      rtmCardsRemaining INTEGER DEFAULT 2
    )`);

    // Create retentions table
    await client.query(`CREATE TABLE retentions (
      id SERIAL PRIMARY KEY,
      teamId TEXT REFERENCES teams(id),
      playerId INTEGER REFERENCES players(id),
      retentionType TEXT,
      price INTEGER,
      slotNumber INTEGER
    )`);

    // Create tournaments table
    await client.query(`CREATE TABLE tournaments (
      id SERIAL PRIMARY KEY,
      name TEXT,
      year INTEGER,
      status TEXT DEFAULT 'PENDING',
      roomCode TEXT
    )`);

    // Create matches table
    await client.query(`CREATE TABLE matches (
      id SERIAL PRIMARY KEY,
      tournamentId INTEGER REFERENCES tournaments(id),
      matchNumber INTEGER,
      team1Id TEXT REFERENCES teams(id),
      team2Id TEXT REFERENCES teams(id),
      team1Score INTEGER DEFAULT 0,
      team1Wickets INTEGER DEFAULT 0,
      team1Overs REAL DEFAULT 0,
      team2Score INTEGER DEFAULT 0,
      team2Wickets INTEGER DEFAULT 0,
      team2Overs REAL DEFAULT 0,
      winnerId TEXT,
      status TEXT DEFAULT 'SCHEDULED',
      stage TEXT DEFAULT 'league',
      tossWinnerId TEXT,
      tossDecision TEXT,
      venue TEXT
    )`);

    // Create standings table
    await client.query(`CREATE TABLE standings (
      id SERIAL PRIMARY KEY,
      tournamentId INTEGER REFERENCES tournaments(id),
      teamId TEXT REFERENCES teams(id),
      played INTEGER DEFAULT 0,
      won INTEGER DEFAULT 0,
      lost INTEGER DEFAULT 0,
      tied INTEGER DEFAULT 0,
      noResult INTEGER DEFAULT 0,
      points INTEGER DEFAULT 0,
      runsFor INTEGER DEFAULT 0,
      oversFor REAL DEFAULT 0,
      runsAgainst INTEGER DEFAULT 0,
      oversAgainst REAL DEFAULT 0,
      nrr REAL DEFAULT 0
    )`);

    // Create match_xi table
    await client.query(`CREATE TABLE match_xi (
      id SERIAL PRIMARY KEY,
      matchId INTEGER REFERENCES matches(id),
      teamId TEXT REFERENCES teams(id),
      playerId INTEGER REFERENCES players(id),
      isImpactPlayer INTEGER DEFAULT 0
    )`);

    console.log("Tables created successfully! Injecting data...");

    const teamsData = [
      { id: 'CSK', name: 'Chennai Super Kings', purse: 12000, logoUrl: 'https://upload.wikimedia.org/wikipedia/en/2/2b/Chennai_Super_Kings_Logo.svg' },
      { id: 'MI', name: 'Mumbai Indians', purse: 12000, logoUrl: 'https://upload.wikimedia.org/wikipedia/en/c/cd/Mumbai_Indians_Logo.svg' },
      { id: 'RCB', name: 'Royal Challengers Bangalore', purse: 12000, logoUrl: 'https://upload.wikimedia.org/wikipedia/en/1/1c/Royal_Challengers_Bangalore_logo.svg' },
      { id: 'KKR', name: 'Kolkata Knight Riders', purse: 12000, logoUrl: 'https://upload.wikimedia.org/wikipedia/en/4/4c/Kolkata_Knight_Riders_Logo.svg' },
      { id: 'SRH', name: 'Sunrisers Hyderabad', purse: 12000, logoUrl: 'https://upload.wikimedia.org/wikipedia/en/8/81/Sunrisers_Hyderabad.svg' },
      { id: 'DC', name: 'Delhi Capitals', purse: 12000, logoUrl: 'https://upload.wikimedia.org/wikipedia/en/2/2f/Delhi_Capitals.svg' },
      { id: 'RR', name: 'Rajasthan Royals', purse: 12000, logoUrl: 'https://upload.wikimedia.org/wikipedia/en/6/60/Rajasthan_Royals_Logo.svg' },
      { id: 'PBKS', name: 'Punjab Kings', purse: 12000, logoUrl: 'https://upload.wikimedia.org/wikipedia/en/d/d4/Punjab_Kings_Logo.svg' },
      { id: 'LSG', name: 'Lucknow Super Giants', purse: 12000, logoUrl: 'https://upload.wikimedia.org/wikipedia/en/a/a9/Lucknow_Super_Giants_IPL_Logo.svg' },
      { id: 'GT', name: 'Gujarat Titans', purse: 12000, logoUrl: 'https://upload.wikimedia.org/wikipedia/en/0/09/Gujarat_Titans_Logo.svg' },
    ];

    for (const t of teamsData) {
      await client.query(
        `INSERT INTO teams (id, name, purse, logoUrl) VALUES ($1, $2, $3, $4)`,
        [t.id, t.name, t.purse, t.logoUrl]
      );
    }

    const playersPath = path.resolve(__dirname, 'data', 'players.json');
    const playersData = JSON.parse(fs.readFileSync(playersPath, 'utf8'));
    let players = playersData.players;

    const allowedSets = [
      'Marquee 1', 'Marquee 2', 'Marquee 3',
      'Capped Batters 1', 'Capped All-Rounders 1', 'Capped Fast Bowlers 1', 'Capped Spinners 1',
      'Capped Batters 2', 'Capped All-Rounders 2', 'Capped Fast Bowlers 2', 'Capped Spinners 2',
      'Capped Batters 3', 'Capped Fast Bowlers 3',
      'Uncapped Batters 1', 'Uncapped Bowlers 1', 'Uncapped All-Rounders 1', 'Uncapped Spinners 1',
      'Uncapped Batters 2', 'Uncapped Bowlers 2',
      'Uncapped Overseas 1', 'Uncapped Overseas 2',
      'Domestic Batters 1', 'Domestic Batters 2', 'Domestic Bowlers 1', 'Domestic Bowlers 2', 'Domestic Bowlers 3',
      'Domestic All-Rounders 1',
      'Domestic Pool 1', 'Domestic Pool 2', 'Domestic Pool 3',
      'Accelerated 1', 'Accelerated 2'
    ];
    players = players.filter(p => p.country !== 'Pakistan' && p.country !== 'Bangladesh' && allowedSets.includes(p.setName));

    for (const p of players) {
      await client.query(
        `INSERT INTO players (name, role, country, basePrice, setName, imageUrl, battingRating, bowlingRating, specialty, bowlingType, age)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [p.name, p.role, p.country, p.basePrice, p.setName, p.imageUrl, p.battingRating, p.bowlingRating, p.specialty, p.bowlingType, p.age]
      );
    }

    console.log(`Database Supabase Migration Complete! Seeded ${players.length} players and ${teamsData.length} teams.`);
  } catch (err) {
    console.error("Migration Error:", err);
  } finally {
    await client.end();
  }
}

runSeed();
