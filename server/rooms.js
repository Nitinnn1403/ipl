// Room management for multiplayer lobbies
const crypto = require('crypto');

// In-memory room storage (can be moved to DB for persistence)
const rooms = new Map();
const playerSessions = new Map(); // odId -> { roomId, socketId }

// Generate 6-character room code
function generateRoomCode() {
  return crypto.randomBytes(3).toString('hex').toUpperCase();
}

// Generate unique player session ID
function generateSessionId() {
  return crypto.randomBytes(8).toString('hex');
}

// IPL Teams available for selection
const IPL_TEAMS = [
  { id: 'CSK', name: 'Chennai Super Kings', logoUrl: 'https://upload.wikimedia.org/wikipedia/en/2/2b/Chennai_Super_Kings_Logo.svg' },
  { id: 'MI', name: 'Mumbai Indians', logoUrl: 'https://upload.wikimedia.org/wikipedia/en/c/cd/Mumbai_Indians_Logo.svg' },
  { id: 'RCB', name: 'Royal Challengers Bangalore', logoUrl: 'https://upload.wikimedia.org/wikipedia/en/1/1c/Royal_Challengers_Bangalore_logo.svg' },
  { id: 'KKR', name: 'Kolkata Knight Riders', logoUrl: 'https://upload.wikimedia.org/wikipedia/en/4/4c/Kolkata_Knight_Riders_Logo.svg' },
  { id: 'SRH', name: 'Sunrisers Hyderabad', logoUrl: 'https://upload.wikimedia.org/wikipedia/en/8/81/Sunrisers_Hyderabad.svg' },
  { id: 'DC', name: 'Delhi Capitals', logoUrl: 'https://upload.wikimedia.org/wikipedia/en/2/2f/Delhi_Capitals.svg' },
  { id: 'RR', name: 'Rajasthan Royals', logoUrl: 'https://upload.wikimedia.org/wikipedia/en/6/60/Rajasthan_Royals_Logo.svg' },
  { id: 'PBKS', name: 'Punjab Kings', logoUrl: 'https://upload.wikimedia.org/wikipedia/en/d/d4/Punjab_Kings_Logo.svg' },
  { id: 'LSG', name: 'Lucknow Super Giants', logoUrl: 'https://upload.wikimedia.org/wikipedia/en/a/a9/Lucknow_Super_Giants_IPL_Logo.svg' },
  { id: 'GT', name: 'Gujarat Titans', logoUrl: 'https://upload.wikimedia.org/wikipedia/en/0/09/Gujarat_Titans_Logo.svg' },
];

function createRoom(hostName, hostSocketId) {
  const roomCode = generateRoomCode();
  const odId = generateSessionId();

  const room = {
    id: roomCode,
    status: 'LOBBY', // LOBBY, AUCTION, TOURNAMENT, FINISHED
    hostOdId: odId,
    createdAt: new Date().toISOString(),
    players: [{
      odId,
      name: hostName,
      teamId: null,
      isHost: true,
      isConnected: true,
      socketId: hostSocketId
    }],
    aiTeams: [], // Teams controlled by AI
    auctionState: null,
    tournamentState: null
  };

  rooms.set(roomCode, room);
  playerSessions.set(odId, { roomId: roomCode, socketId: hostSocketId });

  return { room, odId };
}

function joinRoom(roomCode, playerName, socketId) {
  const room = rooms.get(roomCode.toUpperCase());

  if (!room) {
    return { error: 'Room not found' };
  }

  if (room.status !== 'LOBBY') {
    return { error: 'Game already in progress' };
  }

  if (room.players.length >= 10) {
    return { error: 'Room is full' };
  }

  const odId = generateSessionId();

  room.players.push({
    odId,
    name: playerName,
    teamId: null,
    isHost: false,
    isConnected: true,
    socketId
  });

  playerSessions.set(odId, { roomId: roomCode.toUpperCase(), socketId });

  return { room, odId };
}

function selectTeam(roomCode, odId, teamId) {
  const room = rooms.get(roomCode);
  if (!room) return { error: 'Room not found' };

  if (room.status !== 'LOBBY' && room.status !== 'TEAM_SELECTION') {
    return { error: 'Team selection is closed' };
  }

  // Check if team is already taken by another player
  if (teamId) {
    const teamTaken = room.players.some(p => p.teamId === teamId && p.odId !== odId);
    if (teamTaken) {
      return { error: 'Team already selected by another player' };
    }
  }

  const player = room.players.find(p => p.odId === odId);
  if (player) {
    player.teamId = teamId;
  }

  return { room };
}

function leaveRoom(odId) {
  const session = playerSessions.get(odId);
  if (!session) return null;

  const room = rooms.get(session.roomId);
  if (!room) return null;

  const playerIndex = room.players.findIndex(p => p.odId === odId);
  if (playerIndex === -1) return null;

  const player = room.players[playerIndex];
  room.players.splice(playerIndex, 1);
  playerSessions.delete(odId);

  // If host left, assign new host or delete room
  if (player.isHost && room.players.length > 0) {
    room.players[0].isHost = true;
    room.hostOdId = room.players[0].odId;
  }

  // Delete empty rooms
  if (room.players.length === 0) {
    rooms.delete(session.roomId);
    return { deleted: true, roomId: session.roomId };
  }

  return { room, leftPlayer: player };
}

function kickPlayer(roomCode, hostOdId, targetOdId) {
  const room = rooms.get(roomCode);
  if (!room) return { error: 'Room not found' };

  const host = room.players.find(p => p.odId === hostOdId);
  if (!host || !host.isHost) {
    return { error: 'Only host can kick players' };
  }

  return leaveRoom(targetOdId);
}

function getAvailableTeams(roomCode) {
  const room = rooms.get(roomCode);
  if (!room) return [];

  const takenTeamIds = room.players.map(p => p.teamId).filter(Boolean);
  return IPL_TEAMS.filter(t => !takenTeamIds.includes(t.id));
}

function getRoomState(roomCode) {
  const room = rooms.get(roomCode);
  if (!room) return null;

  return {
    id: room.id,
    status: room.status,
    players: room.players.map(p => ({
      odId: p.odId,
      name: p.name,
      teamId: p.teamId,
      teamName: IPL_TEAMS.find(t => t.id === p.teamId)?.name || null,
      isHost: p.isHost,
      isConnected: p.isConnected
    })),
    availableTeams: getAvailableTeams(roomCode),
    allTeams: IPL_TEAMS
  };
}

function startTeamSelection(roomCode, hostOdId, debugBypass = false) {
  const room = rooms.get(roomCode);
  if (!room) return { error: 'Room not found' };

  const host = room.players.find(p => p.odId === hostOdId);
  if (!host || !host.isHost) {
    return { error: 'Only host can start team selection' };
  }

  if (room.players.length < 3 && !debugBypass) {
    return { error: 'Need at least 3 players to start (unless DEBUG bypassed)' };
  }

  room.status = 'TEAM_SELECTION';
  room.teamSelectionEndTime = Date.now() + 15000; // 15 seconds
  return { room };
}

function autoAssignTeams(roomCode) {
  const room = rooms.get(roomCode);
  if (!room) return null;

  const available = getAvailableTeams(roomCode);
  
  room.players.forEach(p => {
    if (!p.teamId && available.length > 0) {
      const idx = Math.floor(Math.random() * available.length);
      p.teamId = available[idx].id;
      available.splice(idx, 1);
    }
  });

  // Assign AI to remaining teams
  const humanTeamIds = room.players.map(p => p.teamId).filter(Boolean);
  room.aiTeams = IPL_TEAMS.filter(t => !humanTeamIds.includes(t.id)).map(t => t.id);

  return room;
}

function startAuction(roomCode) {
  const room = rooms.get(roomCode);
  if (!room) return { error: 'Room not found' };

  room.status = 'AUCTION';
  return { room, humanTeams: room.players.map(p => p.teamId), aiTeams: room.aiTeams };
}

function getRoom(roomCode) {
  return rooms.get(roomCode);
}

function updatePlayerConnection(odId, socketId, isConnected) {
  const session = playerSessions.get(odId);
  if (!session) return null;

  const room = rooms.get(session.roomId);
  if (!room) return null;

  const player = room.players.find(p => p.odId === odId);
  if (player) {
    player.isConnected = isConnected;
    player.socketId = socketId;
    session.socketId = socketId;
  }

  return room;
}

function getPlayerSession(odId) {
  return playerSessions.get(odId);
}

function setRoomStatus(roomCode, status) {
  const room = rooms.get(roomCode);
  if (room) {
    room.status = status;
  }
  return room;
}

function startTournament(roomCode, tournamentId) {
  const room = rooms.get(roomCode);
  if (room) {
    room.status = 'TOURNAMENT';
    room.tournamentId = tournamentId;
  }
  return room;
}

function findSessionBySocket(socketId) {
  for (const [odId, session] of playerSessions.entries()) {
    if (session.socketId === socketId) {
      return { odId, ...session };
    }
  }
  return null;
}

module.exports = {
  createRoom,
  joinRoom,
  selectTeam,
  leaveRoom,
  kickPlayer,
  getAvailableTeams,
  getRoomState,
  startTeamSelection,
  autoAssignTeams,
  startAuction,
  startTournament,
  getRoom,
  updatePlayerConnection,
  getPlayerSession,
  setRoomStatus,
  findSessionBySocket,
  IPL_TEAMS,
  generateRoomCode
};
