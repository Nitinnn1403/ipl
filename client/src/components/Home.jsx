import React from 'react';
import { useNavigate } from 'react-router-dom';

const Home = () => {
  const navigate = useNavigate();

  return (
    <div className="home-container animate-slide-up">
      {/* Hero Section */}
      <div style={{ marginBottom: '2rem' }}>
        <h1 className="title-xl">IPL 2026</h1>
        <p className="subtitle" style={{ marginTop: '1rem' }}>Mega Auction</p>
      </div>

      <p style={{
        maxWidth: '550px',
        color: 'var(--text-secondary)',
        fontSize: '1.1rem',
        lineHeight: 1.7,
        marginBottom: '2rem'
      }}>
        Experience the thrill of the IPL auction with your friends.
        Build your dream team from 500+ real players and compete for the ultimate cricket glory.
      </p>

      {/* Action Buttons */}
      <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap', justifyContent: 'center' }}>
        <button
          className="btn btn-primary btn-lg pulse-btn"
          onClick={() => navigate('/create-room')}
          style={{ minWidth: '200px' }}
        >
          Create Room
        </button>

        <button
          className="btn btn-lg"
          onClick={() => navigate('/join-room')}
          style={{
            minWidth: '200px',
            background: 'transparent',
            border: '2px solid var(--accent-primary)'
          }}
        >
          Join Room
        </button>
      </div>

      {/* Features */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
        gap: '1rem',
        width: '100%',
        maxWidth: '900px',
        marginTop: '4rem'
      }}>
        {[
          { num: '01', text: 'Create a room and share the code with friends' },
          { num: '02', text: 'Pick your IPL franchise - remaining teams are AI-controlled' },
          { num: '03', text: 'Compete in a live auction with 500+ real players' },
          { num: '04', text: 'Play the tournament and lift the IPL trophy' }
        ].map((feature, i) => (
          <div
            key={i}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '1.25rem',
              background: 'var(--glass-bg)',
              border: '1px solid var(--border-color)',
              borderRadius: 'var(--radius-md)',
              padding: '1.25rem 1.5rem',
              transition: 'all 0.3s ease',
              cursor: 'default'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = 'var(--accent-primary)';
              e.currentTarget.style.transform = 'translateX(5px)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = 'var(--border-color)';
              e.currentTarget.style.transform = 'translateX(0)';
            }}
          >
            <span style={{
              fontFamily: 'var(--font-display)',
              fontSize: '1.5rem',
              fontWeight: 800,
              background: 'var(--accent-gradient)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
              minWidth: '45px'
            }}>
              {feature.num}
            </span>
            <span style={{ color: 'var(--text-secondary)', lineHeight: 1.5 }}>
              {feature.text}
            </span>
          </div>
        ))}
      </div>

      {/* Stats */}
      <div style={{
        display: 'flex',
        gap: '3rem',
        marginTop: '3rem',
        flexWrap: 'wrap',
        justifyContent: 'center'
      }}>
        {[
          { value: '500+', label: 'Real Players' },
          { value: '10', label: 'IPL Teams' },
          { value: '45', label: 'League Matches' }
        ].map((stat, i) => (
          <div key={i} style={{ textAlign: 'center' }}>
            <div style={{
              fontFamily: 'var(--font-display)',
              fontSize: '2.5rem',
              fontWeight: 800,
              background: 'var(--accent-gradient)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text'
            }}>
              {stat.value}
            </div>
            <div style={{
              fontSize: '0.8rem',
              color: 'var(--text-muted)',
              textTransform: 'uppercase',
              letterSpacing: '2px',
              marginTop: '0.25rem'
            }}>
              {stat.label}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default Home;
