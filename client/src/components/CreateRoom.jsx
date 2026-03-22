import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { socket } from '../socket';

const CreateRoom = () => {
  const [userName, setUserName] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const handleCreate = () => {
    if (!userName.trim()) {
      setError('Please enter your name');
      return;
    }

    setIsCreating(true);
    setError('');

    socket.emit('CREATE_ROOM', { userName: userName.trim() });

    socket.once('ROOM_CREATED', ({ roomCode, odId }) => {
      localStorage.setItem('odId', odId);
      localStorage.setItem('userName', userName.trim());
      localStorage.setItem('roomCode', roomCode);
      navigate(`/lobby/${roomCode}`);
    });

    socket.once('error', (msg) => {
      setError(msg);
      setIsCreating(false);
    });
  };

  return (
    <div className="home-container animate-slide-up">
      {/* Back Button */}
      <button
        className="btn"
        onClick={() => navigate('/')}
        style={{
          position: 'fixed',
          top: '2rem',
          left: '2rem',
          padding: '0.75rem 1.5rem',
          zIndex: 100
        }}
      >
        Back
      </button>

      <div className="glass-panel" style={{
        width: '100%',
        maxWidth: '460px',
        padding: '3rem 2.5rem'
      }}>
        {/* Icon */}
        <div style={{
          width: '80px',
          height: '80px',
          borderRadius: '50%',
          background: 'var(--accent-gradient)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          margin: '0 auto 1.5rem',
          fontSize: '2rem'
        }}>
          +
        </div>

        <h1 style={{
          fontSize: '1.75rem',
          marginBottom: '0.5rem',
          textAlign: 'center'
        }}>
          Create Room
        </h1>
        <p style={{
          color: 'var(--text-muted)',
          textAlign: 'center',
          marginBottom: '2rem',
          fontSize: '0.9rem'
        }}>
          Host a new IPL auction and invite your friends
        </p>

        <div style={{ marginBottom: '1.5rem' }}>
          <label style={{
            display: 'block',
            fontSize: '0.85rem',
            fontWeight: '500',
            color: 'var(--text-secondary)',
            marginBottom: '0.5rem'
          }}>
            Your Name
          </label>
          <input
            type="text"
            value={userName}
            onChange={(e) => setUserName(e.target.value)}
            placeholder="Enter your name"
            className="input-field"
            maxLength={20}
            onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
            autoFocus
            style={{ fontSize: '1.1rem' }}
          />
        </div>

        {error && (
          <div style={{
            color: 'var(--error-color)',
            marginBottom: '1rem',
            fontSize: '0.85rem',
            textAlign: 'center',
            padding: '0.75rem',
            background: 'rgba(239, 68, 68, 0.1)',
            borderRadius: 'var(--radius-sm)',
            border: '1px solid rgba(239, 68, 68, 0.2)'
          }}>
            {error}
          </div>
        )}

        <button
          className="btn btn-primary pulse-btn"
          onClick={handleCreate}
          disabled={isCreating}
          style={{ width: '100%', padding: '1rem', fontSize: '1rem' }}
        >
          {isCreating ? (
            <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span className="loader" style={{ width: 20, height: 20, borderWidth: 2 }}></span>
              Creating Room...
            </span>
          ) : 'Create Room'}
        </button>

        <p style={{
          color: 'var(--text-muted)',
          fontSize: '0.8rem',
          textAlign: 'center',
          marginTop: '1.5rem',
          lineHeight: 1.5
        }}>
          A unique 6-character room code will be generated for you to share with friends
        </p>
      </div>
    </div>
  );
};

export default CreateRoom;
