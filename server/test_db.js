const db = require('./dbShim');

console.log("Testing Set Fetch...");

db.all('SELECT * FROM players WHERE status = "AVAILABLE" AND setName = ?', ['Marquee 1'], (err, rows) => {
  if (err) console.error("ERR:", err);
  else console.log("MARQUEE 1 ROWS:", rows.length);
  process.exit();
});
