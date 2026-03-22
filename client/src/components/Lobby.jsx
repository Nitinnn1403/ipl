import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { socket } from '../socket';

const Lobby = () => {
  const { roomCode } = useParams();
  const navigate = useNavigate();
  const [roomState, setRoomState] = useState(null);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  const odId = localStorage.getItem('odId');
  const userName = localStorage.getItem('userName');

  useEffect(() => {
    if (!odId || !userName) {
      navigate('/');
      return;
    }

    // Reconnect to room
    socket.emit('RECONNECT_ROOM', { roomCode, odId, userName });

    // Listen for room updates
    socket.on('ROOM_UPDATE', (state) => {
      setRoomState(state);
    });

    socket.on('PLAYER_JOINED', ({ name }) => {
      // Could add notification toast
    });

    socket.on('PLAYER_LEFT', ({ name }) => {
      // Could add notification toast
    });

    socket.on('TEAM_SELECTION_STARTED', ({ roomCode, endTime }) => {
      navigate(`/select-team/${roomCode}`, { state: { endTime } });
    });

    socket.on('KICKED', () => {
      localStorage.removeItem('odId');
      localStorage.removeItem('roomCode');
      navigate('/');
    });

    socket.on('error', (msg) => {
      setError(msg);
      setTimeout(() => setError(''), 3000);
    });

    return () => {
      socket.off('ROOM_UPDATE');
      socket.off('PLAYER_JOINED');
      socket.off('PLAYER_LEFT');
      socket.off('AUCTION_STARTED');
      socket.off('KICKED');
      socket.off('error');
    };
  }, [roomCode, odId, userName, navigate]);

  const handleKickPlayer = (targetOdId) => {
    socket.emit('KICK_PLAYER', { roomCode, targetOdId, odId });
  };

  const handleStartAuction = () => {
    socket.emit('START_TEAM_SELECTION', { roomCode, odId });
  };

  const handleLeaveRoom = () => {
    socket.emit('LEAVE_ROOM', { roomCode, odId });
    localStorage.removeItem('odId');
    localStorage.removeItem('roomCode');
    navigate('/');
  };

  const copyRoomCode = () => {
    navigator.clipboard.writeText(roomCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const currentPlayer = roomState?.players.find(p => p.odId === odId);
  const isHost = currentPlayer?.isHost;
  // Based on your rules, need 3 players to start. Debug flag on backend will bypass if enabled.
  const canStart = roomState?.players.length >= 3 || true; // True for testing the debug bypass

  if (!roomState) {
    return (
      <div className="home-container">
        <div className="loader"></div>
        <p>Connecting to room...</p>
      </div>
    );
  }

  return (
    <div className="home-container animate-slide-up">
      <h1 className="title-glow">IPL 2026 Mega Auction</h1>

      {/* Room Code Display */}
      <div
        className="glass-panel"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '15px',
          padding: '15px 25px',
          marginTop: '20px',
          cursor: 'pointer'
        }}
        onClick={copyRoomCode}
      >
        <span style={{ fontSize: '0.9rem', opacity: 0.7 }}>ROOM CODE</span>
        <span style={{ fontSize: '2rem', fontWeight: 'bold', letterSpacing: '4px', color: 'var(--accent-color)' }}>
          {roomCode}
        </span>
        <span style={{ fontSize: '0.8rem', opacity: 0.5 }}>
          {copied ? 'COPIED!' : 'Click to copy'}
        </span>
      </div>

      {error && (
        <div style={{ color: 'var(--error-color)', margin: '15px 0' }}>
          {error}
        </div>
      )}

      <div style={{ display: 'flex', gap: '30px', marginTop: '30px', flexWrap: 'wrap', justifyContent: 'center' }}>
        {/* Players Panel */}
        <div className="glass-panel" style={{ minWidth: '300px', maxWidth: '400px', flex: '1' }}>
          <h3 style={{ marginBottom: '15px', borderBottom: '1px solid var(--border-color)', paddingBottom: '10px' }}>
            Players ({roomState.players.length}/10)
          </h3>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {roomState.players.map((player) => (
              <div
                key={player.odId}
                className="stat-box"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '12px 15px',
                  background: player.odId === odId ? 'rgba(88, 166, 255, 0.1)' : undefined,
                  border: player.odId === odId ? '1px solid var(--accent-color)' : undefined
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span style={{ fontSize: '1.1rem' }}>
                    {player.name}
                    {player.isHost && (
                      <span style={{ marginLeft: '8px', fontSize: '0.7rem', background: 'var(--accent-color)', padding: '2px 6px', borderRadius: '4px' }}>
                        HOST
                      </span>
                    )}
                  </span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  {player.teamId && (
                    <img
                      src={roomState.allTeams.find(t => t.id === player.teamId)?.logoUrl}
                      alt={player.teamId}
                      style={{ width: '30px', height: '30px' }}
                    />
                  )}
                  {!player.teamId && (
                    <span style={{ fontSize: '0.8rem', opacity: 0.5 }}>No team</span>
                  )}
                  {isHost && !player.isHost && (
                    <button
                      className="btn"
                      style={{ padding: '4px 8px', fontSize: '0.7rem', background: 'var(--error-color)' }}
                      onClick={() => handleKickPlayer(player.odId)}
                    >
                      Kick
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>

        </div>

        {/* Removed Team Selection Panel to move to next screen */}
          <div className="glass-panel" style={{ flex: '2', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
            <h2 style={{ marginBottom: '10px' }}>Waiting Room</h2>
            <p style={{ color: 'var(--text-secondary)', textAlign: 'center' }}>
              Wait for your friends to join using code <strong>{roomCode}</strong>. <br/>
              Once everyone is here, the host will start the 15-second Team Selection phase!
            </p>
          </div>
        </div>

      {/* Action Buttons */}
      <div style={{ marginTop: '30px', display: 'flex', gap: '15px', justifyContent: 'center' }}>
        {isHost && (
          <button
            className="btn btn-primary"
            onClick={handleStartAuction}
            disabled={!canStart}
            style={{ padding: '15px 40px', fontSize: '1.2rem' }}
          >
            {canStart ? 'Start Auction' : 'Waiting for more players...'}
          </button>
        )}

        {!isHost && (
          <div style={{ padding: '15px 40px', background: 'var(--bg-primary)', border: '1px solid var(--border-color)', borderRadius: '8px' }}>
            Waiting for host to start...
          </div>
        )}

        <button className="btn" onClick={handleLeaveRoom} style={{ padding: '15px 30px' }}>
          Leave Room
        </button>
      </div>
    </div>
  );
};

export default Lobby;
