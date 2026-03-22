const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const dbPath = path.resolve(__dirname, 'ipl.db');
const db = new sqlite3.Database(dbPath);

// Load players from JSON file
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

// Filter out specific countries and ONLY include our top-tier active sets
players = players.filter(p => p.country !== 'Pakistan' && p.country !== 'Bangladesh' && allowedSets.includes(p.setName));

const teams = [
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

db.serialize(() => {
  // Drop existing tables
  db.run('DROP TABLE IF EXISTS players');
  db.run('DROP TABLE IF EXISTS teams');
  db.run('DROP TABLE IF EXISTS retentions');
  db.run('DROP TABLE IF EXISTS tournaments');
  db.run('DROP TABLE IF EXISTS matches');
  db.run('DROP TABLE IF EXISTS standings');
  db.run('DROP TABLE IF EXISTS match_xi');

  // Create players table with enhanced columns
  db.run(`CREATE TABLE players (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
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
  db.run(`CREATE TABLE teams (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    purse INTEGER,
    logoUrl TEXT,
    rtmCardsRemaining INTEGER DEFAULT 2
  )`);

  // Create retentions table for pre-auction retentions
  db.run(`CREATE TABLE retentions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    teamId TEXT,
    playerId INTEGER,
    retentionType TEXT,
    price INTEGER,
    slotNumber INTEGER,
    FOREIGN KEY (teamId) REFERENCES teams(id),
    FOREIGN KEY (playerId) REFERENCES players(id)
  )`);

  // Create tournaments table
  db.run(`CREATE TABLE tournaments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    year INTEGER,
    status TEXT DEFAULT 'PENDING',
    roomCode TEXT
  )`);

  // Create matches table
  db.run(`CREATE TABLE matches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tournamentId INTEGER,
    matchNumber INTEGER,
    team1Id TEXT,
    team2Id TEXT,
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
    venue TEXT,
    FOREIGN KEY (tournamentId) REFERENCES tournaments(id),
    FOREIGN KEY (team1Id) REFERENCES teams(id),
    FOREIGN KEY (team2Id) REFERENCES teams(id)
  )`);

  // Create standings table for points table
  db.run(`CREATE TABLE standings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tournamentId INTEGER,
    teamId TEXT,
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
    nrr REAL DEFAULT 0,
    FOREIGN KEY (tournamentId) REFERENCES tournaments(id),
    FOREIGN KEY (teamId) REFERENCES teams(id)
  )`);

  // Create match_xi table for playing XI selection
  db.run(`CREATE TABLE match_xi (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    matchId INTEGER,
    teamId TEXT,
    playerId INTEGER,
    role TEXT,
    battingOrder INTEGER,
    isImpactSub INTEGER DEFAULT 0,
    FOREIGN KEY (matchId) REFERENCES matches(id),
    FOREIGN KEY (teamId) REFERENCES teams(id),
    FOREIGN KEY (playerId) REFERENCES players(id)
  )`);

  // Insert players from JSON
  const insertPlayer = db.prepare(`
    INSERT INTO players (name, role, country, basePrice, setName, imageUrl, battingRating, bowlingRating, specialty, bowlingType, age)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  players.forEach(p => {
    const avatar = `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(p.name)}`;
    insertPlayer.run(
      p.name,
      p.role,
      p.country,
      p.basePrice,
      p.setName,
      avatar,
      p.battingRating || 50,
      p.bowlingRating || 50,
      p.specialty || null,
      p.bowlingType || null,
      p.age || null
    );
  });
  insertPlayer.finalize();

  // Insert teams
  const insertTeam = db.prepare('INSERT INTO teams (id, name, purse, logoUrl, rtmCardsRemaining) VALUES (?, ?, ?, ?, ?)');
  teams.forEach(t => {
    insertTeam.run(t.id, t.name, t.purse, t.logoUrl, 2);
  });
  insertTeam.finalize();

  console.log(`Database seeded with ${players.length} players and ${teams.length} teams.`);
  console.log('Tables created: players, teams, retentions, tournaments, matches, standings, match_xi');
});

db.close();
