import React, { useState, useEffect } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { socket } from '../socket';

const TeamSelection = () => {
  const { roomCode } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [roomState, setRoomState] = useState(null);
  const [timeLeft, setTimeLeft] = useState(15);
  const [finalizing, setFinalizing] = useState(false);

  const odId = localStorage.getItem('odId');
  const endTime = location.state?.endTime;

  useEffect(() => {
    if (!odId || !endTime) {
      navigate('/');
      return;
    }

    socket.emit('RECONNECT_ROOM', { roomCode, odId, userName: localStorage.getItem('userName') });

    socket.on('ROOM_UPDATE', (state) => setRoomState(state));
    
    socket.on('TEAMS_FINALIZED', (state) => {
      setRoomState(state);
      setFinalizing(true);
      setTimeLeft(0);
      
      const me = state.players.find(p => p.odId === odId);
      if (me && me.teamId) {
        localStorage.setItem('myTeamId', me.teamId);
        localStorage.setItem('myTeamName', me.teamName || me.teamId);
      }
    });

    socket.on('AUCTION_STARTED', ({ roomCode }) => {
      navigate(`/auction/${roomCode}`);
    });

    const timerInterval = setInterval(() => {
      const remaining = Math.max(0, Math.ceil((endTime - Date.now()) / 1000));
      if (!finalizing) setTimeLeft(remaining);
    }, 100);

    return () => {
      clearInterval(timerInterval);
      socket.off('ROOM_UPDATE');
      socket.off('TEAMS_FINALIZED');
      socket.off('AUCTION_STARTED');
    };
  }, [roomCode, odId, endTime, navigate, finalizing]);

  const handleSelectTeam = (teamId) => {
    if (!finalizing && timeLeft > 0) {
      socket.emit('SELECT_TEAM', { roomCode, teamId, odId });
    }
  };

  if (!roomState) return <div className="home-container"><div className="loader"></div></div>;

  const currentPlayer = roomState.players.find(p => p.odId === odId);

  return (
    <div className="home-container animate-slide-up">
      <h1 className="title-glow">Team Selection Phase</h1>
      
      {!finalizing ? (
        <div style={{ textAlign: 'center', marginBottom: '20px' }}>
          <h2 style={{ fontSize: '3.5rem', fontFamily: 'var(--font-display)', color: timeLeft <= 5 ? 'var(--error-color)' : 'var(--accent-primary)' }}>
            00:{timeLeft.toString().padStart(2, '0')}
          </h2>
          <p style={{ color: 'var(--text-secondary)', fontWeight: 500 }}>Pick your franchise before time runs out!</p>
        </div>
      ) : (
        <div style={{ textAlign: 'center', marginBottom: '20px' }}>
          <h2 style={{ color: 'var(--success-color)', fontSize: '2.5rem' }}>Teams Finalized!</h2>
          <p style={{ color: 'var(--text-secondary)', fontWeight: 500 }}>Remaining slotted to AI. Starting auction...</p>
        </div>
      )}

      {currentPlayer?.teamId && (
        <div className="glass-panel" style={{ width: '100%', maxWidth: '400px', marginBottom: '10px', textAlign: 'center', borderColor: 'var(--success-color)', background: '#ecfdf5' }}>
          <span className="stat-label">YOUR TEAM</span>
          <div style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--success-color)' }}>
            {roomState.allTeams.find(t => t.id === currentPlayer.teamId)?.name}
          </div>
        </div>
      )}

      <div className="teams-grid" style={{ maxWidth: '900px' }}>
        {roomState.allTeams.map((team) => {
          const isSelected = currentPlayer?.teamId === team.id;
          const isTaken = roomState.players.some(p => p.teamId === team.id && p.odId !== odId);

          return (
            <div
              key={team.id}
              className={`team-card ${isSelected ? 'selected' : ''} ${isTaken ? 'disabled' : ''}`}
              onClick={() => !isTaken && !isSelected && handleSelectTeam(team.id)}
              style={{
                opacity: isTaken ? 0.6 : 1,
                cursor: isTaken || finalizing ? 'not-allowed' : 'pointer'
              }}
            >
              <img src={team.logoUrl} alt={team.name} className="team-logo" />
              <div style={{ fontSize: '0.85rem', fontWeight: 600, textAlign: 'center' }}>{team.name}</div>
              {isTaken && (
                <div style={{ fontSize: '0.75rem', color: 'var(--error-color)', marginTop: '5px', fontWeight: 600 }}>
                  Picked by {roomState.players.find(p => p.teamId === team.id)?.name}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default TeamSelection;
