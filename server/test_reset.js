const db = require('./dbShim');

console.log("Testing Auction Start Reset...");

db.serialize(() => {
  db.run('BEGIN TRANSACTION', () => {
    console.log("Transaction begun.");
    db.run("UPDATE players SET status = 'AVAILABLE', soldTo = NULL, currentBid = 0", [], (err) => {
      if (err) console.error("UPDATE ERR:", err);
      else console.log("UPDATE SUCCESS!");

      db.get('SELECT COUNT(*) as count FROM players WHERE status = \'AVAILABLE\'', [], (err2, row) => {
         if (err2) console.error("GET ERR:", err2);
         else console.log("AVAILABLE COUNT:", row);
         
         process.exit();
      });
    });
  });
});
