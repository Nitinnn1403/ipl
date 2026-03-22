const db = require('./dbShim');

console.log("Testing checkHumanAuctionComplete natively...");

const humanTeams = ['CSK'];
const placeholders = humanTeams.map(() => '?').join(',');

db.all(
  `SELECT id, purse, (SELECT COUNT(*) FROM players WHERE soldTo = teams.id) as squadSize FROM teams WHERE id IN (${placeholders})`,
  humanTeams,
  (err, rows) => {
    if (err) {
      console.error("DB ERROR:", err);
      process.exit(1);
    }
    
    console.log("RAW ROWS RETURNED FROM SHIM:", rows);

    let isComplete = true;
    for (const team of rows) {
      console.log(`Evaluating Team ${team.id} -> Squad Size:`, team.squadSize, `Purse:`, team.purse);
      console.log(`Condition 1 (squadSize < 25):`, team.squadSize < 25);
      console.log(`Condition 2 (purse >= 20):`, team.purse >= 20);
      
      if (team.squadSize < 25 && team.purse >= 20) {
        console.log("Conditions met! Breaking loop, auction NOT complete!");
        isComplete = false;
        break;
      }
    }
    
    console.log("FINAL isComplete RESULT:", isComplete);
    process.exit();
  }
);
