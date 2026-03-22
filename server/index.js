const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');
const rooms = require('./rooms');

const DEBUG_BYPASS_3_PLAYERS = true; // Use this to test the tournament locally without 3 people

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*', methods: ['GET', 'POST'] } });

// Inject Shim Proxy Database connected to Supabase
const db = require('./dbShim');

// Per-room auction states
const roomAuctionStates = new Map();
const roomAuctionIntervals = new Map();

// Match preparation states for PvP matches { roomCode_matchId: { customXIMap: {}, speed: 'normal' } }
const matchPreps = new Map();

app.get('/api/teams', (req, res) => {
  db.all('SELECT * FROM teams', [], (err, rows) => res.json(rows || []));
});
app.get('/api/players', (req, res) => {
  db.all('SELECT * FROM players', [], (err, rows) => res.json(rows || []));
});
app.get('/api/room/:roomCode/auction-state', (req, res) => {
  const state = roomAuctionStates.get(req.params.roomCode);
  res.json(state || { status: 'WAITING' });
});

const SETS_ORDER = [
  // Marquee Sets (Top stars first)
  'Marquee 1', 'Marquee 2', 'Marquee 3',
  // Capped Players Round 1
  'Capped Batters 1', 'Capped All-Rounders 1', 'Capped Fast Bowlers 1', 'Capped Spinners 1',
  // Capped Players Round 2
  'Capped Batters 2', 'Capped All-Rounders 2', 'Capped Fast Bowlers 2', 'Capped Spinners 2',
  // Capped Players Round 3
  'Capped Batters 3', 'Capped Fast Bowlers 3',
  // Uncapped Indians
  'Uncapped Batters 1', 'Uncapped Bowlers 1', 'Uncapped All-Rounders 1', 'Uncapped Spinners 1',
  'Uncapped Batters 2', 'Uncapped Bowlers 2',
  // Uncapped Overseas
  'Uncapped Overseas 1', 'Uncapped Overseas 2',
  // Domestic pools
  'Domestic Batters 1', 'Domestic Batters 2', 'Domestic Bowlers 1', 'Domestic Bowlers 2', 'Domestic Bowlers 3',
  'Domestic All-Rounders 1',
  'Domestic Pool 1', 'Domestic Pool 2', 'Domestic Pool 3',
  // Accelerated rounds (unsold players return)
  'Accelerated 1', 'Accelerated 2'
];

// Room-specific auction state structure
function createRoomAuctionState(roomCode, humanTeams, aiTeams) {
  return {
    roomCode,
    humanTeams,
    aiTeams,
    currentSetIndex: 0,
    playersInSet: [],
    isAuctionActive: false,
    auctionState: {
      status: 'WAITING',
      currentPlayer: null,
      currentBid: 0,
      nextBid: 0,
      currentBidderId: null,
      currentBidderName: null,
      timeLeft: 0,
      currentSet: 'Awaiting Start...',
      teams: {} // Will store team purse/squad data
    }
  };
}

const getNextBid = (currentBid) => {
  if (currentBid < 100) return currentBid + 5;
  if (currentBid < 200) return currentBid + 10;
  if (currentBid < 300) return currentBid + 20;
  return currentBid + 25;
};

const shuffle = (array) => {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
};

const broadcastToRoom = (roomCode, event, data) => {
  io.to(roomCode).emit(event, data);
};

// AI Bidding Logic
function calculateTeamNeed(squadSize, overseasCount, role, isOverseas) {
  let needScore = 50; // Base need

  // More slots available = more willing to bid
  const slotsRemaining = 25 - squadSize;
  needScore += slotsRemaining * 2;

  // Check role needs (simplified)
  if (role === 'Wicketkeeper' && squadSize < 3) needScore += 30;
  if (role === 'Bowler' && squadSize < 8) needScore += 20;
  if (role === 'All-Rounder') needScore += 15;

  // Overseas limit check
  if (isOverseas && overseasCount >= 7) needScore -= 50;
  if (isOverseas && overseasCount >= 8) return 0;

  return Math.max(0, Math.min(100, needScore));
}

function shouldAIBid(teamPurse, squadSize, overseasCount, player, currentBid) {
  const slotsRemaining = 25 - squadSize;
  const minReserve = slotsRemaining * 20; // Keep 20L per remaining slot

  if (currentBid > teamPurse - minReserve) return false;
  if (squadSize >= 25) return false;

  const isOverseas = player.country !== 'India';
  if (isOverseas && overseasCount >= 8) return false;

  const needScore = calculateTeamNeed(squadSize, overseasCount, player.role, isOverseas);
  const playerValue = (player.battingRating || 50) + (player.bowlingRating || 50);
  const valueRatio = playerValue / currentBid;

  // Decision logic
  if (needScore > 60 && valueRatio > 0.8) return true;
  if (needScore > 80 && valueRatio > 0.5) return true;
  if (playerValue > 150 && valueRatio > 1.0) return true;

  // Random interest for unpredictability
  return Math.random() < 0.08;
}

async function processAIBids(roomCode) {
  const roomState = roomAuctionStates.get(roomCode);
  if (!roomState || roomState.auctionState.status !== 'BIDDING') return;

  const { aiTeams, auctionState } = roomState;
  const currentPlayer = auctionState.currentPlayer;

  if (!currentPlayer || !aiTeams.length) return;

  // Get team stats for all AI teams
  const teamPromises = aiTeams.map(teamId => {
    return new Promise((resolve) => {
      db.get(
        `SELECT purse,
         (SELECT COUNT(*) FROM players WHERE soldTo = ?) as squadSize,
         (SELECT COUNT(*) FROM players WHERE soldTo = ? AND country != "India") as overseasCount
         FROM teams WHERE id = ?`,
        [teamId, teamId, teamId],
        (err, stats) => resolve({ teamId, ...stats })
      );
    });
  });

  const teamStats = await Promise.all(teamPromises);

  // Filter teams that can and want to bid
  const interestedTeams = teamStats.filter(team => {
    if (!team.purse) return false;
    const nextBidAmount = auctionState.currentBidderId ? auctionState.nextBid : auctionState.currentBid;
    return shouldAIBid(team.purse, team.squadSize, team.overseasCount, currentPlayer, nextBidAmount);
  });

  if (interestedTeams.length === 0) return;

  // Randomly select one AI team to bid (adds unpredictability)
  const biddingTeam = interestedTeams[Math.floor(Math.random() * interestedTeams.length)];

  // Don't bid if AI is already highest bidder
  if (auctionState.currentBidderId === biddingTeam.teamId) return;

  // Place the bid
  const bidAmount = auctionState.currentBidderId ? auctionState.nextBid : auctionState.currentBid;

  if (bidAmount <= biddingTeam.purse) {
    const teamName = rooms.IPL_TEAMS.find(t => t.id === biddingTeam.teamId)?.name || biddingTeam.teamId;

    roomState.auctionState.currentBid = bidAmount;
    roomState.auctionState.nextBid = getNextBid(bidAmount);
    roomState.auctionState.currentBidderId = biddingTeam.teamId;
    roomState.auctionState.currentBidderName = teamName;
    roomState.auctionState.timeLeft = 10;

    broadcastToRoom(roomCode, 'auction_update', roomState.auctionState);
    broadcastToRoom(roomCode, 'new_bid', { teamId: biddingTeam.teamId, teamName, amount: bidAmount, isAI: true });
  }
}

function checkHumanAuctionComplete(roomCode, callback) {
  const roomState = roomAuctionStates.get(roomCode);
  if (!roomState || !roomState.humanTeams || roomState.humanTeams.length === 0) {
    return callback(true); // If no human teams, just fast forward
  }

  const placeholders = roomState.humanTeams.map(() => '?').join(',');
  db.all(
    `SELECT id, purse, (SELECT COUNT(*) FROM players WHERE soldTo = teams.id) as squadSize FROM teams WHERE id IN (${placeholders})`,
    roomState.humanTeams,
    (err, rows) => {
      if (err || !rows) return callback(false);
      let isComplete = true;
      for (const team of rows) {
        if (team.squadSize < 25 && team.purse >= 20) {
          isComplete = false;
          break;
        }
      }
      callback(isComplete);
    }
  );
}

function finishAuctionProcess(roomCode) {
  const roomState = roomAuctionStates.get(roomCode);
  if (roomState) {
    roomState.auctionState = {
      ...roomState.auctionState,
      status: 'FINISHED',
      currentPlayer: null,
      currentSet: 'Auction Finished'
    };
    broadcastToRoom(roomCode, 'auction_update', roomState.auctionState);
  }
  broadcastToRoom(roomCode, 'AUCTION_FINISHED', { roomCode });
}

function calculateTeamNeed(squadSize, overseasCount, role, isOverseas) {
  let score = 50;
  if (squadSize < 15) score += 20;
  if (role === 'Wicket Keeper') score += 15;
  if (role === 'All-Rounder') score += 10;
  if (isOverseas && overseasCount >= 7) score -= 40;
  return score;
}

function fastForwardAIAuction(roomCode) {
  const roomState = roomAuctionStates.get(roomCode);
  if (!roomState) return;

  roomState.auctionState = {
    ...roomState.auctionState,
    status: 'FINISHED',
    currentPlayer: null,
    currentSet: 'Simulating remaining AI teams... This takes a few seconds.'
  };
  broadcastToRoom(roomCode, 'auction_update', roomState.auctionState);

  db.all('SELECT * FROM players WHERE status IN ("AVAILABLE", "UNSOLD")', [], (err, remainingPlayers) => {
    if (err || !remainingPlayers || remainingPlayers.length === 0) {
      finishAuctionProcess(roomCode);
      return;
    }

    const availablePlayers = remainingPlayers.sort((a, b) => {
      const ra = (a.battingRating || 50) + (a.bowlingRating || 50);
      const rb = (b.battingRating || 50) + (b.bowlingRating || 50);
      return rb - ra;
    });

    if (!roomState.aiTeams || roomState.aiTeams.length === 0) {
      finishAuctionProcess(roomCode);
      return;
    }

    db.all(`SELECT id, purse, (SELECT COUNT(*) FROM players WHERE soldTo = teams.id) as squadSize, (SELECT COUNT(*) FROM players WHERE soldTo = teams.id AND country != 'India') as overseasCount FROM teams WHERE id IN (${roomState.aiTeams.map(() => '?').join(',')})`, roomState.aiTeams, (err, aiTeamsStats) => {

      if (err || !aiTeamsStats) {
        finishAuctionProcess(roomCode);
        return;
      }

      db.serialize(() => {
        db.run('BEGIN TRANSACTION');

        for (const player of availablePlayers) {
          let bestTeam = null;
          let highestNeed = -1;
          for (const team of aiTeamsStats) {
            if (team.squadSize >= 25 || team.purse < player.basePrice) continue;
            if (player.country !== 'India' && team.overseasCount >= 8) continue;

            const needScore = calculateTeamNeed(team.squadSize, team.overseasCount, player.role, player.country !== 'India');
            if (needScore > highestNeed) {
              highestNeed = needScore;
              bestTeam = team;
            }
          }

          if (bestTeam && highestNeed > 0) {
            bestTeam.squadSize++;
            if (player.country !== 'India') bestTeam.overseasCount++;
            bestTeam.purse -= player.basePrice;

            db.run('UPDATE players SET soldTo = ?, currentBid = ?, status = "SOLD" WHERE id = ?',
              [bestTeam.id, player.basePrice, player.id]);
            db.run('UPDATE teams SET purse = ? WHERE id = ?', [bestTeam.purse, bestTeam.id]);
          }
        }

        db.run('COMMIT', () => {
          finishAuctionProcess(roomCode);
        });
      });
    });
  });
}

function loadNextPlayer(roomCode) {
  const roomState = roomAuctionStates.get(roomCode);
  if (!roomState) return;

  checkHumanAuctionComplete(roomCode, (isComplete) => {
    if (isComplete) {
      fastForwardAIAuction(roomCode);
      return;
    }

    if (roomState.playersInSet.length === 0) {
      if (roomState.currentSetIndex >= SETS_ORDER.length) {
        finishAuctionProcess(roomCode);
        return;
      }

      // Gap during set break
      const nextSetName = SETS_ORDER[roomState.currentSetIndex];
      roomState.auctionState.status = 'SET_BREAK';
      roomState.auctionState.currentSet = `NEXT SET: ${nextSetName}`;
      roomState.auctionState.timeLeft = 8;
      broadcastToRoom(roomCode, 'auction_update', roomState.auctionState);

      setTimeout(() => {
        db.all('SELECT * FROM players WHERE status = "AVAILABLE" AND setName = ?', [nextSetName], (err, playersInSet) => {
          if (playersInSet && playersInSet.length > 0) {
            roomState.playersInSet = shuffle([...playersInSet]);
            roomState.auctionState.currentSet = nextSetName;
            roomState.currentSetIndex++;
            startNextPlayer(roomCode);
          } else {
            roomState.currentSetIndex++;
            loadNextPlayer(roomCode);
          }
        });
      }, 8000);

    } else {
      startNextPlayer(roomCode);
    }
  });
}

function startNextPlayer(roomCode) {
  const roomState = roomAuctionStates.get(roomCode);
  if (!roomState) return;

  const player = roomState.playersInSet.pop();
  roomState.auctionState = {
    ...roomState.auctionState,
    status: 'BIDDING',
    currentPlayer: player,
    currentBid: player.basePrice,
    nextBid: getNextBid(player.basePrice),
    currentBidderId: null,
    currentBidderName: null,
    timeLeft: 20
  };

  db.run('UPDATE players SET status = "IN_AUCTION" WHERE id = ?', [player.id]);
  broadcastToRoom(roomCode, 'auction_update', roomState.auctionState);

  // Schedule AI bid consideration after a short delay
  setTimeout(() => processAIBids(roomCode), 2000 + Math.random() * 3000);
}

function processSale(roomCode) {
  const roomState = roomAuctionStates.get(roomCode);
  if (!roomState) return;

  const { currentPlayer, currentBid, currentBidderId, currentBidderName } = roomState.auctionState;
  if (!currentPlayer) return;

  if (currentBidderId) {
    roomState.auctionState.status = 'SOLD';
    broadcastToRoom(roomCode, 'auction_update', roomState.auctionState);

    db.serialize(() => {
      db.run('BEGIN TRANSACTION');
      let errOccurred = false;

      db.run('UPDATE players SET soldTo = ?, currentBid = ?, status = "SOLD" WHERE id = ?',
        [currentBidderId, currentBid, currentPlayer.id], function (err) { if (err) errOccurred = true; });

      db.run('UPDATE teams SET purse = purse - ? WHERE id = ?', [currentBid, currentBidderId], function (err) {
        if (err) errOccurred = true;

        if (errOccurred) {
          db.run('ROLLBACK');
          console.error('Failed to process sale for ' + currentPlayer.name);
        } else {
          db.run('COMMIT');
          broadcastToRoom(roomCode, 'player_sold', {
            player: currentPlayer,
            toTeam: currentBidderId,
            toTeamName: currentBidderName,
            amount: currentBid
          });
          setTimeout(() => loadNextPlayer(roomCode), 3000);
        }
      });
    });
  } else {
    roomState.auctionState.status = 'UNSOLD';
    broadcastToRoom(roomCode, 'auction_update', roomState.auctionState);

    db.run('UPDATE players SET status = "UNSOLD" WHERE id = ?', [currentPlayer.id], () => {
      broadcastToRoom(roomCode, 'player_unsold', { player: currentPlayer });
      setTimeout(() => loadNextPlayer(roomCode), 3000);
    });
  }
}

function startRoomAuctionTimer(roomCode) {
  // Clear existing interval if any
  if (roomAuctionIntervals.has(roomCode)) {
    clearInterval(roomAuctionIntervals.get(roomCode));
  }

  const interval = setInterval(() => {
    const roomState = roomAuctionStates.get(roomCode);
    const room = rooms.getRoom(roomCode);

    // Stop timer if room no longer exists, auction state is missing, or everyone left
    if (!roomState || !room || room.players.length === 0) {
      clearInterval(interval);
      if (!room || room.players.length === 0) {
        roomAuctionStates.delete(roomCode);
      }
      return;
    }

    const { status } = roomState.auctionState;

    if (status === 'BIDDING' || status === 'SET_BREAK') {
      roomState.auctionState.timeLeft -= 1;

      if (roomState.auctionState.timeLeft <= 0) {
        if (status === 'BIDDING') {
          processSale(roomCode);
        }
      } else {
        broadcastToRoom(roomCode, 'auction_update', roomState.auctionState);

        // AI bid consideration during bidding
        if (status === 'BIDDING' && roomState.auctionState.timeLeft % 3 === 0) {
          processAIBids(roomCode);
        }
      }
    }

    if (status === 'FINISHED') {
      clearInterval(interval);
      roomAuctionIntervals.delete(roomCode);
    }
  }, 1000);

  roomAuctionIntervals.set(roomCode, interval);
}

// ==================== SOCKET.IO CONNECTION HANDLER ====================
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

  // ==================== ROOM MANAGEMENT ====================

  socket.on('CREATE_ROOM', ({ userName }) => {
    const { room, odId } = rooms.createRoom(userName, socket.id);
    socket.join(room.id);
    socket.emit('ROOM_CREATED', { roomCode: room.id, odId });
    socket.emit('ROOM_UPDATE', rooms.getRoomState(room.id));
  });

  socket.on('JOIN_ROOM', ({ roomCode, userName }) => {
    const result = rooms.joinRoom(roomCode, userName, socket.id);

    if (result.error) {
      socket.emit('error', result.error);
      return;
    }

    socket.join(result.room.id);
    socket.emit('ROOM_JOINED', { roomCode: result.room.id, odId: result.odId });

    // Notify all players in room
    io.to(result.room.id).emit('ROOM_UPDATE', rooms.getRoomState(result.room.id));
    io.to(result.room.id).emit('PLAYER_JOINED', { name: userName, odId: result.odId });
  });

  socket.on('RECONNECT_ROOM', ({ roomCode, odId, userName }) => {
    const room = rooms.getRoom(roomCode);
    if (!room) {
      socket.emit('error', 'Room not found');
      return;
    }

    rooms.updatePlayerConnection(odId, socket.id, true);
    socket.join(roomCode);
    socket.emit('ROOM_UPDATE', rooms.getRoomState(roomCode));

    // If auction is in progress, send current state
    const auctionState = roomAuctionStates.get(roomCode);
    if (auctionState) {
      socket.emit('auction_update', auctionState.auctionState);
    }
  });

  socket.on('SELECT_TEAM', ({ roomCode, teamId, odId }) => {
    const result = rooms.selectTeam(roomCode, odId, teamId);
    if (result.error) {
      socket.emit('error', result.error);
      return;
    }

    io.to(roomCode).emit('ROOM_UPDATE', rooms.getRoomState(roomCode));
  });

  socket.on('KICK_PLAYER', ({ roomCode, targetOdId, odId }) => {
    const result = rooms.kickPlayer(roomCode, odId, targetOdId);
    if (result.error) {
      socket.emit('error', result.error);
      return;
    }

    // Notify kicked player
    const targetSession = rooms.getPlayerSession(targetOdId);
    if (targetSession) {
      io.to(targetSession.socketId).emit('KICKED');
    }

    io.to(roomCode).emit('ROOM_UPDATE', rooms.getRoomState(roomCode));
  });

  socket.on('LEAVE_ROOM', ({ roomCode, odId }) => {
    const result = rooms.leaveRoom(odId);
    if (result && !result.deleted) {
      io.to(roomCode).emit('ROOM_UPDATE', rooms.getRoomState(roomCode));
      io.to(roomCode).emit('PLAYER_LEFT', { name: result.leftPlayer?.name, odId });
    }

    socket.leave(roomCode);
  });


  socket.on('START_TEAM_SELECTION', ({ roomCode, odId }) => {
    const result = rooms.startTeamSelection(roomCode, odId, DEBUG_BYPASS_3_PLAYERS);
    if (result.error) {
      socket.emit('error', result.error);
      return;
    }

    // Notify clients that team selection has started (starts their 15s timers)
    io.to(roomCode).emit('TEAM_SELECTION_STARTED', { roomCode, endTime: result.room.teamSelectionEndTime });
    io.to(roomCode).emit('ROOM_UPDATE', rooms.getRoomState(roomCode));

    // 15 seconds timer for selection
    setTimeout(() => {
      // Time's up! Auto assign remaining players and AI
      const assignedRoom = rooms.autoAssignTeams(roomCode);
      if (!assignedRoom) return;

      io.to(roomCode).emit('TEAMS_FINALIZED', rooms.getRoomState(roomCode));

      // Start auction shortly after
      setTimeout(() => {
        const startResult = rooms.startAuction(roomCode);
        if (startResult.error) return;

        const roomState = createRoomAuctionState(roomCode, startResult.humanTeams, startResult.aiTeams);
        roomAuctionStates.set(roomCode, roomState);

        // Reset database for fresh auction
        db.run('UPDATE players SET status = "AVAILABLE", soldTo = NULL, currentBid = 0');
        db.run('UPDATE teams SET purse = 12000');

        io.to(roomCode).emit('AUCTION_STARTED', { roomCode });
        io.to(roomCode).emit('ROOM_UPDATE', rooms.getRoomState(roomCode));

        // Start the auction after a short delay
        setTimeout(() => {
          roomState.isAuctionActive = true;
          loadNextPlayer(roomCode);
          startRoomAuctionTimer(roomCode);
        }, 2000);
      }, 3000); // Give 3 seconds to see assigned teams
    }, 15000);
  });

  // ==================== AUCTION BIDDING ====================

  socket.on('place_bid', ({ roomCode, teamId }) => {
    const roomState = roomAuctionStates.get(roomCode);
    if (!roomState || roomState.auctionState.status !== 'BIDDING' || !roomState.auctionState.currentPlayer) {
      return;
    }

    const isFirstBid = roomState.auctionState.currentBidderId === null;
    let bidAmount = isFirstBid ? roomState.auctionState.currentBid : roomState.auctionState.nextBid;

    db.get(
      `SELECT purse,
       (SELECT COUNT(*) FROM players WHERE soldTo = ?) as squadSize,
       (SELECT COUNT(*) FROM players WHERE soldTo = ? AND country != "India") as overseasCount
       FROM teams WHERE id = ?`,
      [teamId, teamId, teamId],
      (err, teamStats) => {
        if (err || !teamStats) return;

        if (teamStats.squadSize >= 25) {
          socket.emit('error', 'Squad limit reached!');
          return;
        }
        if (teamStats.overseasCount >= 8 && roomState.auctionState.currentPlayer.country !== 'India') {
          socket.emit('error', 'Foreign limit reached!');
          return;
        }
        if (bidAmount > teamStats.purse) {
          socket.emit('error', 'Not enough purse!');
          return;
        }

        const teamName = rooms.IPL_TEAMS.find(t => t.id === teamId)?.name || teamId;

        roomState.auctionState.currentBid = bidAmount;
        roomState.auctionState.nextBid = getNextBid(bidAmount);
        roomState.auctionState.currentBidderId = teamId;
        roomState.auctionState.currentBidderName = teamName;
        roomState.auctionState.timeLeft = 10;

        broadcastToRoom(roomCode, 'auction_update', roomState.auctionState);
        broadcastToRoom(roomCode, 'new_bid', { teamId, teamName, amount: bidAmount, isAI: false });
      }
    );
  });

  // ==================== LEGACY SINGLE-PLAYER MODE ====================
  // Keep for backward compatibility

  socket.on('START_WHOLE_AUCTION', () => {
    // Legacy single-player mode - create a temporary room
    const { room, odId } = rooms.createRoom('SinglePlayer', socket.id);
    const roomCode = room.id;
    socket.join(roomCode);

    // Select all teams for AI
    const roomState = createRoomAuctionState(roomCode, [], rooms.IPL_TEAMS.map(t => t.id));
    roomAuctionStates.set(roomCode, roomState);

    db.run('UPDATE players SET status = "AVAILABLE", soldTo = NULL, currentBid = 0');
    db.run('UPDATE teams SET purse = 12000');

    roomState.isAuctionActive = true;
    loadNextPlayer(roomCode);
    startRoomAuctionTimer(roomCode);
  });

  // ==================== MATCH SIMULATION ====================

  socket.on('START_MATCH', ({ roomCode, matchId, odId, playingXI, speed }) => {
    const room = rooms.getRoom(roomCode);
    const player = room?.players.find(p => p.odId === odId);
    if (!player) return;

    db.get('SELECT * FROM matches WHERE id = ?', [matchId], (err, match) => {
      if (err || !match) return;

      const myTeamId = player.teamId;
      const opponentTeamId = (match.team1Id === myTeamId) ? match.team2Id : match.team1Id;
      
      const isOpponentHuman = room.players.some(p => p.teamId === opponentTeamId);

      const prepKey = `${roomCode}_${matchId}`;
      let prep = matchPreps.get(prepKey) || { customXIMap: {}, speed };
      prep.customXIMap[myTeamId] = playingXI;

      if (isOpponentHuman && !prep.customXIMap[opponentTeamId]) {
        // Opponent is human but hasn't submitted XI yet!
        matchPreps.set(prepKey, prep);
        socket.emit('WAITING_FOR_OPPONENT');
        return; // Don't simulate yet
      }

      // Both humans submitted (or opponent is AI) -> Simulate!
      matchPreps.delete(prepKey);
      
      simulateMatch(roomCode, matchId, prep.customXIMap, (result) => {
        if (result.error) {
          socket.emit('error', result.error);
          return;
        }
        io.to(roomCode).emit('MATCH_COMPLETED', result);
      });
    });
  });

  socket.on('SIMULATE_MATCH', ({ roomCode, matchId, odId }) => {
    simulateMatch(roomCode, matchId, null, (result) => {
      if (result.error) {
        socket.emit('error', result.error);
        return;
      }
      io.to(roomCode).emit('MATCH_COMPLETED', result);
    });
  });

  // ==================== DISCONNECT ====================

  socket.on('disconnect', () => {
    const session = findSessionBySocket(socket.id);
    if (session) {
      rooms.updatePlayerConnection(session.odId, socket.id, false);
      const roomCode = session.roomId;
      const room = rooms.getRoom(roomCode);
      if (room) {
        io.to(roomCode).emit('ROOM_UPDATE', rooms.getRoomState(roomCode));
      }
    }
    console.log('Client disconnected:', socket.id);
  });
});

// Helper to find session by socket ID
function findSessionBySocket(socketId) {
  return rooms.findSessionBySocket(socketId);
}

// ==================== TOURNAMENT API ENDPOINTS ====================

const MatchEngine = require('./matchEngine');

function selectBestXI(squad) {
  const sorted = squad.sort((a, b) => {
    const ratingA = (a.battingRating || 50) + (a.bowlingRating || 50);
    const ratingB = (b.battingRating || 50) + (b.bowlingRating || 50);
    return ratingB - ratingA;
  });
  const xi = [];
  let overseasCount = 0;
  for (const player of sorted) {
    if (xi.length >= 11) break;
    const isOverseas = player.country !== 'India';
    if (isOverseas && overseasCount >= 4) continue;
    xi.push(player);
    if (isOverseas) overseasCount++;
  }
  return xi;
}

app.post('/api/simulate-random', (req, res) => {
  db.all('SELECT * FROM players WHERE soldTo IS NOT NULL', [], (err, soldPlayers) => {
    const teamSquads = {};
    soldPlayers.forEach(p => {
      if (!teamSquads[p.soldTo]) teamSquads[p.soldTo] = [];
      teamSquads[p.soldTo].push(p);
    });

    const validTeams = Object.keys(teamSquads).filter(t => teamSquads[t].length >= 11);
    if (validTeams.length < 2) return res.status(400).json({ error: 'Need at least 2 teams with 11 players!' });

    const team1Id = validTeams[Math.floor(Math.random() * validTeams.length)];
    let team2Id = validTeams[Math.floor(Math.random() * validTeams.length)];
    while (team1Id === team2Id && validTeams.length > 1) {
      team2Id = validTeams[Math.floor(Math.random() * validTeams.length)];
    }

    const team1 = rooms.IPL_TEAMS.find(t => t.id === team1Id);
    const team2 = rooms.IPL_TEAMS.find(t => t.id === team2Id);

    const engine = new MatchEngine(team1, team2, selectBestXI(teamSquads[team1Id]), selectBestXI(teamSquads[team2Id]));
    res.json(engine.simulateMatch());
  });
});

// Create tournament after auction ends
app.post('/api/room/:roomCode/tournament/create', (req, res) => {
  const { roomCode } = req.params;
  const room = rooms.getRoom(roomCode);

  if (!room) {
    return res.status(404).json({ error: 'Room not found' });
  }

  // Create tournament
  db.run(
    'INSERT INTO tournaments (name, year, status, roomCode) VALUES (?, ?, ?, ?)',
    ['IPL 2026', 2026, 'LEAGUE', roomCode],
    function (err) {
      if (err) return res.status(500).json({ error: 'Failed to create tournament' });

      const tournamentId = this.lastID;

      // Initialize standings for all 10 teams
      const teams = rooms.IPL_TEAMS;
      const stmtStandings = db.prepare(
        'INSERT INTO standings (tournamentId, teamId) VALUES (?, ?)'
      );

      teams.forEach(team => {
        stmtStandings.run(tournamentId, team.id);
      });
      stmtStandings.finalize();

      // Generate league stage schedule (each team plays every other team once = 45 matches)
      const matches = [];
      let matchNumber = 1;

      for (let i = 0; i < teams.length; i++) {
        for (let j = i + 1; j < teams.length; j++) {
          matches.push({
            tournamentId,
            matchNumber: matchNumber++,
            team1Id: teams[i].id,
            team2Id: teams[j].id,
            stage: 'league'
          });
        }
      }

      // Shuffle matches for variety
      for (let i = matches.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [matches[i], matches[j]] = [matches[j], matches[i]];
        matches[i].matchNumber = i + 1;
        matches[j].matchNumber = matches.length - i;
      }

      // Re-number after shuffle
      matches.forEach((m, idx) => m.matchNumber = idx + 1);

      const stmtMatch = db.prepare(
        'INSERT INTO matches (tournamentId, matchNumber, team1Id, team2Id, stage) VALUES (?, ?, ?, ?, ?)'
      );

      matches.forEach(m => {
        stmtMatch.run(m.tournamentId, m.matchNumber, m.team1Id, m.team2Id, m.stage);
      });
      stmtMatch.finalize();

      // Update room status
      rooms.startTournament(roomCode, tournamentId);

      res.json({ success: true, tournamentId, matchCount: matches.length });
    }
  );
});

// Get tournament overview
app.get('/api/room/:roomCode/tournament', (req, res) => {
  const { roomCode } = req.params;
  const { odId } = req.query;

  db.get('SELECT * FROM tournaments WHERE roomCode = ? ORDER BY id DESC LIMIT 1', [roomCode], (err, tournament) => {
    if (err || !tournament) {
      return res.json({ tournament: null, standings: [], upcomingMatches: [], recentResults: [] });
    }

    // Get player's team
    const room = rooms.getRoom(roomCode);
    let myTeamId = null;
    if (room && odId) {
      const player = room.players.find(p => p.odId === odId);
      myTeamId = player?.teamId;
    }

    // Get standings
    db.all(`
      SELECT s.*, t.name as teamName, t.logoUrl
      FROM standings s
      JOIN teams t ON s.teamId = t.id
      WHERE s.tournamentId = ?
      ORDER BY s.points DESC, s.nrr DESC
    `, [tournament.id], (err, standings) => {

      // Get upcoming matches
      db.all(`
        SELECT m.*, t1.name as team1Name, t1.logoUrl as team1Logo, t2.name as team2Name, t2.logoUrl as team2Logo
        FROM matches m
        JOIN teams t1 ON m.team1Id = t1.id
        JOIN teams t2 ON m.team2Id = t2.id
        WHERE m.tournamentId = ? AND m.status = 'SCHEDULED'
        ORDER BY m.matchNumber
        LIMIT 6
      `, [tournament.id], (err, upcomingMatches) => {

        // Mark matches that involve player's team
        if (upcomingMatches) {
          upcomingMatches.forEach(m => {
            m.isMyMatch = m.team1Id === myTeamId || m.team2Id === myTeamId;
          });
        }

        // Get recent results
        db.all(`
          SELECT m.*, t1.name as team1Name, t1.logoUrl as team1Logo, t2.name as team2Name, t2.logoUrl as team2Logo, w.name as winnerName
          FROM matches m
          JOIN teams t1 ON m.team1Id = t1.id
          JOIN teams t2 ON m.team2Id = t2.id
          LEFT JOIN teams w ON m.winnerId = w.id
          WHERE m.tournamentId = ? AND m.status = 'COMPLETED'
          ORDER BY m.matchNumber DESC
          LIMIT 6
        `, [tournament.id], (err, recentResults) => {

          res.json({
            tournament,
            standings: standings || [],
            upcomingMatches: upcomingMatches || [],
            recentResults: recentResults || [],
            myTeam: myTeamId ? rooms.IPL_TEAMS.find(t => t.id === myTeamId) : null
          });
        });
      });
    });
  });
});

// Get full standings
app.get('/api/room/:roomCode/standings', (req, res) => {
  const { roomCode } = req.params;
  const { odId } = req.query;

  const room = rooms.getRoom(roomCode);
  let myTeamId = null;
  if (room && odId) {
    const player = room.players.find(p => p.odId === odId);
    myTeamId = player?.teamId;
  }

  db.get('SELECT id FROM tournaments WHERE roomCode = ? ORDER BY id DESC LIMIT 1', [roomCode], (err, tournament) => {
    if (!tournament) return res.json({ standings: [] });

    db.all(`
      SELECT s.*, t.name as teamName, t.logoUrl
      FROM standings s
      JOIN teams t ON s.teamId = t.id
      WHERE s.tournamentId = ?
      ORDER BY s.points DESC, s.nrr DESC
    `, [tournament.id], (err, standings) => {
      res.json({ standings: standings || [], myTeamId });
    });
  });
});

// Get match schedule
app.get('/api/room/:roomCode/schedule', (req, res) => {
  const { roomCode } = req.params;
  const { odId } = req.query;

  const room = rooms.getRoom(roomCode);
  let myTeamId = null;
  if (room && odId) {
    const player = room.players.find(p => p.odId === odId);
    myTeamId = player?.teamId;
  }

  db.get('SELECT id FROM tournaments WHERE roomCode = ? ORDER BY id DESC LIMIT 1', [roomCode], (err, tournament) => {
    if (!tournament) return res.json({ matches: [] });

    db.all(`
      SELECT m.*, t1.name as team1Name, t1.logoUrl as team1Logo, t2.name as team2Name, t2.logoUrl as team2Logo, w.name as winnerName
      FROM matches m
      JOIN teams t1 ON m.team1Id = t1.id
      JOIN teams t2 ON m.team2Id = t2.id
      LEFT JOIN teams w ON m.winnerId = w.id
      WHERE m.tournamentId = ?
      ORDER BY m.matchNumber
    `, [tournament.id], (err, matches) => {
      res.json({ matches: matches || [], myTeamId });
    });
  });
});

// Get team squad
app.get('/api/room/:roomCode/team/:teamId', (req, res) => {
  const { roomCode, teamId } = req.params;

  db.get('SELECT * FROM teams WHERE id = ?', [teamId], (err, team) => {
    if (!team) return res.status(404).json({ error: 'Team not found' });

    db.all('SELECT * FROM players WHERE soldTo = ? ORDER BY currentBid DESC', [teamId], (err, players) => {
      const overseas = players?.filter(p => p.country !== 'India').length || 0;

      res.json({
        team,
        players: players || [],
        stats: {
          squadSize: players?.length || 0,
          overseas,
          indian: (players?.length || 0) - overseas,
          purseRemaining: team.purse
        }
      });
    });
  });
});

// Get single match details
app.get('/api/match/:matchId', (req, res) => {
  const { matchId } = req.params;

  db.get(`
    SELECT m.*, t1.name as team1Name, t1.logoUrl as team1Logo, t2.name as team2Name, t2.logoUrl as team2Logo, w.name as winnerName
    FROM matches m
    JOIN teams t1 ON m.team1Id = t1.id
    JOIN teams t2 ON m.team2Id = t2.id
    LEFT JOIN teams w ON m.winnerId = w.id
    WHERE m.id = ?
  `, [matchId], (err, match) => {
    if (err || !match) {
      return res.status(404).json({ error: 'Match not found' });
    }
    res.json({ match });
  });
});

function simulateMatch(roomCode, matchId, customXIMap, callback) {
  db.get(`
    SELECT m.*, t1.name as team1Name, t2.name as team2Name
    FROM matches m
    JOIN teams t1 ON m.team1Id = t1.id
    JOIN teams t2 ON m.team2Id = t2.id
    WHERE m.id = ?
  `, [matchId], (err, match) => {
    if (err || !match) {
      return callback({ error: 'Match not found' });
    }

    if (match.status === 'COMPLETED') {
      return callback({ error: 'Match already completed' });
    }

    // Get team squads
    db.all('SELECT * FROM players WHERE soldTo = ?', [match.team1Id], (err, team1Players) => {
      db.all('SELECT * FROM players WHERE soldTo = ?', [match.team2Id], (err, team2Players) => {

        // Use custom XI if provided, otherwise auto-select best XI
        const team1XI = (customXIMap && customXIMap[match.team1Id])
          ? team1Players.filter(p => customXIMap[match.team1Id].includes(p.id))
          : selectBestXI(team1Players);

        const team2XI = (customXIMap && customXIMap[match.team2Id])
          ? team2Players.filter(p => customXIMap[match.team2Id].includes(p.id))
          : selectBestXI(team2Players);

        // Create match engine and simulate
        const engine = new MatchEngine(
          { id: match.team1Id, name: match.team1Name },
          { id: match.team2Id, name: match.team2Name },
          team1XI,
          team2XI
        );

        const result = engine.simulateMatch();

        // Update match in database
        const winnerId = result.winner;
        const firstInnings = result.firstInnings;
        const secondInnings = result.secondInnings;

        // Determine scores based on batting order
        let t1Score, t1Wickets, t1Overs, t2Score, t2Wickets, t2Overs;
        if (firstInnings.teamId === match.team1Id) {
          t1Score = firstInnings.runs;
          t1Wickets = firstInnings.wickets;
          t1Overs = firstInnings.overs;
          t2Score = secondInnings.runs;
          t2Wickets = secondInnings.wickets;
          t2Overs = secondInnings.overs;
        } else {
          t2Score = firstInnings.runs;
          t2Wickets = firstInnings.wickets;
          t2Overs = firstInnings.overs;
          t1Score = secondInnings.runs;
          t1Wickets = secondInnings.wickets;
          t1Overs = secondInnings.overs;
        }

        db.run(`
          UPDATE matches SET
            team1Score = ?, team1Wickets = ?, team1Overs = ?,
            team2Score = ?, team2Wickets = ?, team2Overs = ?,
            winnerId = ?, status = 'COMPLETED',
            tossWinnerId = ?, tossDecision = ?
          WHERE id = ?
        `, [t1Score, t1Wickets, t1Overs, t2Score, t2Wickets, t2Overs, winnerId, result.toss.winner, result.toss.decision, matchId], (err) => {
          if (err) {
            return callback({ error: 'Failed to update match' });
          }

          // Update standings
          updateStandings(match.tournamentId, match.team1Id, match.team2Id, t1Score, t1Overs, t2Score, t2Overs, winnerId, () => {
            // Check if playoffs should begin
            checkPlayoffs(match.tournamentId, roomCode);

            callback({
              matchId,
              ...result,
              team1Score: t1Score,
              team1Wickets: t1Wickets,
              team1Overs: t1Overs,
              team2Score: t2Score,
              team2Wickets: t2Wickets,
              team2Overs: t2Overs
            });
          });
        });
      });
    });
  });
}

function selectBestXI(players) {
  if (!players || players.length < 11) {
    // Fill with default players if squad incomplete
    const defaults = [];
    for (let i = players?.length || 0; i < 11; i++) {
      defaults.push({
        id: -i,
        name: `Player ${i + 1}`,
        battingRating: 40,
        bowlingRating: 40,
        role: 'All-Rounder'
      });
    }
    players = [...(players || []), ...defaults];
  }

  // Sort by overall rating and pick best 11
  const sorted = [...players].sort((a, b) => {
    const aTotal = (a.battingRating || 0) + (a.bowlingRating || 0);
    const bTotal = (b.battingRating || 0) + (b.bowlingRating || 0);
    return bTotal - aTotal;
  });

  // Ensure balance: need at least 5 bowlers and 1 keeper if available
  const bowlers = sorted.filter(p => p.role === 'Bowler');
  const keepers = sorted.filter(p => p.role === 'Wicketkeeper');
  const batters = sorted.filter(p => p.role === 'Batter');
  const allrounders = sorted.filter(p => p.role === 'All-Rounder');

  const xi = [];

  // Add wicketkeeper (1)
  if (keepers.length > 0) xi.push(keepers[0]);

  // Add pure batters (4-5)
  batters.slice(0, keepers.length > 0 ? 4 : 5).forEach(p => {
    if (!xi.find(x => x.id === p.id)) xi.push(p);
  });

  // Add all-rounders (2-3)
  allrounders.slice(0, 3).forEach(p => {
    if (!xi.find(x => x.id === p.id) && xi.length < 8) xi.push(p);
  });

  // Add bowlers (4-5)
  bowlers.slice(0, 5).forEach(p => {
    if (!xi.find(x => x.id === p.id) && xi.length < 11) xi.push(p);
  });

  // Fill remaining spots with best available
  sorted.forEach(p => {
    if (!xi.find(x => x.id === p.id) && xi.length < 11) xi.push(p);
  });

  return xi.slice(0, 11);
}

function updateStandings(tournamentId, team1Id, team2Id, t1Score, t1Overs, t2Score, t2Overs, winnerId, callback) {
  // Convert overs to decimal for NRR calculation (e.g., 19.4 -> 19.67)
  const t1OversDecimal = Math.floor(t1Overs) + (t1Overs % 1) * 10 / 6;
  const t2OversDecimal = Math.floor(t2Overs) + (t2Overs % 1) * 10 / 6;

  // Update team1 standings
  db.run(`
    UPDATE standings SET
      played = played + 1,
      won = won + ?,
      lost = lost + ?,
      points = points + ?,
      runsFor = runsFor + ?,
      oversFor = oversFor + ?,
      runsAgainst = runsAgainst + ?,
      oversAgainst = oversAgainst + ?
    WHERE tournamentId = ? AND teamId = ?
  `, [
    winnerId === team1Id ? 1 : 0,
    winnerId === team2Id ? 1 : 0,
    winnerId === team1Id ? 2 : 0,
    t1Score, t1OversDecimal, t2Score, t2OversDecimal,
    tournamentId, team1Id
  ], () => {
    // Update team2 standings
    db.run(`
      UPDATE standings SET
        played = played + 1,
        won = won + ?,
        lost = lost + ?,
        points = points + ?,
        runsFor = runsFor + ?,
        oversFor = oversFor + ?,
        runsAgainst = runsAgainst + ?,
        oversAgainst = oversAgainst + ?
      WHERE tournamentId = ? AND teamId = ?
    `, [
      winnerId === team2Id ? 1 : 0,
      winnerId === team1Id ? 1 : 0,
      winnerId === team2Id ? 2 : 0,
      t2Score, t2OversDecimal, t1Score, t1OversDecimal,
      tournamentId, team2Id
    ], () => {
      // Recalculate NRR for both teams
      recalculateNRR(tournamentId, team1Id);
      recalculateNRR(tournamentId, team2Id);
      callback();
    });
  });
}

function recalculateNRR(tournamentId, teamId) {
  db.get('SELECT * FROM standings WHERE tournamentId = ? AND teamId = ?', [tournamentId, teamId], (err, standing) => {
    if (!standing || standing.oversFor === 0) return;

    const runRateFor = standing.runsFor / standing.oversFor;
    const runRateAgainst = standing.oversAgainst > 0 ? standing.runsAgainst / standing.oversAgainst : 0;
    const nrr = runRateFor - runRateAgainst;

    db.run('UPDATE standings SET nrr = ? WHERE tournamentId = ? AND teamId = ?', [nrr, tournamentId, teamId]);
  });
}

function checkPlayoffs(tournamentId, roomCode) {
  // Check if all league matches are done
  db.get('SELECT COUNT(*) as remaining FROM matches WHERE tournamentId = ? AND stage = "league" AND status = "SCHEDULED"',
    [tournamentId], (err, result) => {
      if (result && result.remaining === 0) {
        // All league matches done, create playoffs
        createPlayoffs(tournamentId, roomCode);
      }
    });
}

function createPlayoffs(tournamentId, roomCode) {
  // Get top 4 teams
  db.all(`
    SELECT teamId FROM standings
    WHERE tournamentId = ?
    ORDER BY points DESC, nrr DESC
    LIMIT 4
  `, [tournamentId], (err, teams) => {
    if (!teams || teams.length < 4) return;

    const [first, second, third, fourth] = teams.map(t => t.teamId);

    // Create playoff matches
    db.serialize(() => {
      // Qualifier 1: 1st vs 2nd
      db.run('INSERT INTO matches (tournamentId, matchNumber, team1Id, team2Id, stage) VALUES (?, 46, ?, ?, "qualifier1")',
        [tournamentId, first, second]);

      // Eliminator: 3rd vs 4th
      db.run('INSERT INTO matches (tournamentId, matchNumber, team1Id, team2Id, stage) VALUES (?, 47, ?, ?, "eliminator")',
        [tournamentId, third, fourth]);

      // Qualifier 2 and Final will be created after those matches
    });

    db.run('UPDATE tournaments SET status = "PLAYOFFS" WHERE id = ?', [tournamentId]);
    io.to(roomCode).emit('PLAYOFFS_STARTED', { teams: [first, second, third, fourth] });
  });
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`IPL Auction Server running on port ${PORT}`));
