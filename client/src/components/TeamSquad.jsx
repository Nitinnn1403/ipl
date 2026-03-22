import { API_URL } from '../config';
import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

const formatMoney = (lakhs) => {
  if (lakhs >= 100) return `${(lakhs / 100).toFixed(2)} Cr`;
  return `${lakhs} L`;
};

const TeamSquad = () => {
  const { roomCode, teamId } = useParams();
  const navigate = useNavigate();
  const [team, setTeam] = useState(null);
  const [players, setPlayers] = useState([]);
  const [stats, setStats] = useState({});
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    fetch(`${API_URL}/api/room/${roomCode}/team/${teamId}`)
      .then(res => res.json())
      .then(data => {
        setTeam(data.team);
        setPlayers(data.players || []);
        setStats(data.stats || {});
        setLoading(false);
      })
      .catch(err => {
        console.error('Failed to fetch team:', err);
        setLoading(false);
      });
  }, [roomCode, teamId]);

  const filteredPlayers = players.filter(p => {
    if (filter === 'indian') return p.country === 'India';
    if (filter === 'overseas') return p.country !== 'India';
    if (filter === 'batters') return p.role === 'Batter' || p.role === 'Wicketkeeper';
    if (filter === 'bowlers') return p.role === 'Bowler';
    if (filter === 'allrounders') return p.role === 'All-Rounder';
    return true;
  });

  if (loading) {
    return (
      <div className="home-container">
        <div className="loader"></div>
        <p>Loading squad...</p>
      </div>
    );
  }

  if (!team) {
    return (
      <div className="home-container">
        <h2>Team not found</h2>
        <button className="btn" onClick={() => navigate(`/tournament/${roomCode}`)}>
          Back to Tournament
        </button>
      </div>
    );
  }

  return (
    <div className="app-container animate-slide-up">
      {/* Team Header */}
      <div className="glass-panel" style={{ display: 'flex', alignItems: 'center', gap: '20px', marginBottom: '30px' }}>
        <img src={team.logoUrl} alt={team.name} style={{ width: '80px', height: '80px' }} />
        <div>
          <h1 style={{ margin: 0, fontSize: '1.8rem' }}>{team.name}</h1>
          <p style={{ margin: '5px 0 0', opacity: 0.7 }}>{teamId}</p>
        </div>
      </div>

      {/* Quick Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '15px', marginBottom: '30px' }}>
        <div className="stat-box">
          <div style={{ fontSize: '2rem', fontWeight: 'bold', color: 'var(--accent-color)' }}>{stats.squadSize}</div>
          <div style={{ fontSize: '0.85rem', opacity: 0.7 }}>Squad Size</div>
        </div>
        <div className="stat-box">
          <div style={{ fontSize: '2rem', fontWeight: 'bold', color: 'var(--success-color)' }}>{stats.indian}</div>
          <div style={{ fontSize: '0.85rem', opacity: 0.7 }}>Indian</div>
        </div>
        <div className="stat-box">
          <div style={{ fontSize: '2rem', fontWeight: 'bold', color: 'var(--warning-color)' }}>{stats.overseas}</div>
          <div style={{ fontSize: '0.85rem', opacity: 0.7 }}>Overseas</div>
        </div>
        <div className="stat-box">
          <div style={{ fontSize: '2rem', fontWeight: 'bold' }}>{formatMoney(stats.purseRemaining)}</div>
          <div style={{ fontSize: '0.85rem', opacity: 0.7 }}>Purse Left</div>
        </div>
      </div>

      {/* Navigation */}
      <div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
        <button className="btn" onClick={() => navigate(`/tournament/${roomCode}`)}>
          Back to Tournament
        </button>
        <button className="btn" onClick={() => navigate(`/tournament/${roomCode}/standings`)}>
          Points Table
        </button>
      </div>

      {/* Filter Tabs */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', flexWrap: 'wrap' }}>
        {['all', 'indian', 'overseas', 'batters', 'bowlers', 'allrounders'].map(f => (
          <button
            key={f}
            className={filter === f ? 'btn btn-primary' : 'btn'}
            style={{ padding: '6px 12px', fontSize: '0.8rem' }}
            onClick={() => setFilter(f)}
          >
            {f === 'allrounders' ? 'All-Rounders' : f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      {/* Players Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '15px' }}>
        {filteredPlayers.map(player => (
          <div key={player.id} className="glass-panel" style={{ padding: '15px' }}>
            <div style={{ display: 'flex', gap: '15px' }}>
              <img
                src={player.imageUrl}
                alt={player.name}
                style={{ width: '60px', height: '60px', borderRadius: '50%', background: 'rgba(255,255,255,0.1)' }}
              />
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 'bold', fontSize: '1rem', marginBottom: '3px' }}>{player.name}</div>
                <div style={{ fontSize: '0.8rem', opacity: 0.7 }}>
                  {player.role} | {player.country}
                  {player.country !== 'India' && (
                    <span style={{ marginLeft: '5px', color: 'var(--warning-color)' }}>OVERSEAS</span>
                  )}
                </div>
                <div style={{ fontSize: '0.85rem', color: 'var(--accent-color)', marginTop: '5px' }}>
                  Bought for {formatMoney(player.currentBid)}
                </div>
              </div>
            </div>

            {/* Player Ratings */}
            <div style={{ display: 'flex', gap: '15px', marginTop: '15px' }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '0.7rem', opacity: 0.6, marginBottom: '3px' }}>BATTING</div>
                <div style={{ background: 'rgba(255,255,255,0.1)', borderRadius: '4px', overflow: 'hidden', height: '8px' }}>
                  <div
                    style={{
                      width: `${player.battingRating}%`,
                      height: '100%',
                      background: 'linear-gradient(90deg, #22c55e, #16a34a)',
                      transition: 'width 0.3s'
                    }}
                  />
                </div>
                <div style={{ fontSize: '0.75rem', marginTop: '2px' }}>{player.battingRating}</div>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '0.7rem', opacity: 0.6, marginBottom: '3px' }}>BOWLING</div>
                <div style={{ background: 'rgba(255,255,255,0.1)', borderRadius: '4px', overflow: 'hidden', height: '8px' }}>
                  <div
                    style={{
                      width: `${player.bowlingRating}%`,
                      height: '100%',
                      background: 'linear-gradient(90deg, #3b82f6, #2563eb)',
                      transition: 'width 0.3s'
                    }}
                  />
                </div>
                <div style={{ fontSize: '0.75rem', marginTop: '2px' }}>{player.bowlingRating}</div>
              </div>
            </div>

            {player.specialty && (
              <div style={{
                marginTop: '10px',
                fontSize: '0.7rem',
                padding: '3px 8px',
                background: 'rgba(88, 166, 255, 0.2)',
                borderRadius: '4px',
                display: 'inline-block'
              }}>
                {player.specialty}
              </div>
            )}
          </div>
        ))}
      </div>

      {filteredPlayers.length === 0 && (
        <div className="glass-panel" style={{ textAlign: 'center', padding: '40px' }}>
          <p style={{ opacity: 0.6 }}>No players found for this filter.</p>
        </div>
      )}
    </div>
  );
};

export default TeamSquad;
