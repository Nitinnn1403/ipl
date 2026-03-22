import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { socket } from '../socket';

const JoinRoom = () => {
  const [userName, setUserName] = useState('');
  const [roomCode, setRoomCode] = useState('');
  const [isJoining, setIsJoining] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const handleJoin = () => {
    if (!userName.trim()) {
      setError('Please enter your name');
      return;
    }
    if (!roomCode.trim()) {
      setError('Please enter room code');
      return;
    }
    if (roomCode.trim().length !== 6) {
      setError('Room code must be 6 characters');
      return;
    }

    setIsJoining(true);
    setError('');

    socket.emit('JOIN_ROOM', {
      userName: userName.trim(),
      roomCode: roomCode.trim().toUpperCase()
    });

    socket.once('ROOM_JOINED', ({ roomCode: code, odId }) => {
      localStorage.setItem('odId', odId);
      localStorage.setItem('userName', userName.trim());
      localStorage.setItem('roomCode', code);
      navigate(`/lobby/${code}`);
    });

    socket.once('error', (msg) => {
      setError(msg);
      setIsJoining(false);
    });
  };

  return (
    <div className="home-container animate-slide-up">
      <h1 className="title-glow">Join a Room</h1>
      <p style={{ marginTop: '10px', fontSize: '1.1rem', opacity: 0.8 }}>
        Enter the room code shared by your friend
      </p>

      <div className="glass-panel" style={{ maxWidth: '400px', margin: '30px auto', padding: '30px' }}>
        <div style={{ marginBottom: '20px' }}>
          <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.9rem', color: 'var(--text-muted)' }}>
            Your Name
          </label>
          <input
            type="text"
            value={userName}
            onChange={(e) => setUserName(e.target.value)}
            placeholder="Enter your name"
            className="input-field"
            maxLength={20}
          />
        </div>

        <div style={{ marginBottom: '20px' }}>
          <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.9rem', color: 'var(--text-muted)' }}>
            Room Code
          </label>
          <input
            type="text"
            value={roomCode}
            onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
            placeholder="e.g. ABC123"
            className="input-field"
            maxLength={6}
            style={{ textTransform: 'uppercase', letterSpacing: '4px', textAlign: 'center', fontSize: '1.5rem' }}
            onKeyDown={(e) => e.key === 'Enter' && handleJoin()}
          />
        </div>

        {error && (
          <div style={{ color: 'var(--error-color)', marginBottom: '15px', fontSize: '0.9rem' }}>
            {error}
          </div>
        )}

        <button
          className="btn btn-primary"
          onClick={handleJoin}
          disabled={isJoining}
          style={{ width: '100%', padding: '15px', fontSize: '1.1rem' }}
        >
          {isJoining ? 'Joining...' : 'Join Room'}
        </button>
      </div>

      <button className="btn" onClick={() => navigate('/')} style={{ marginTop: '20px' }}>
        Back to Home
      </button>
    </div>
  );
};

export default JoinRoom;
