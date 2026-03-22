import { API_URL } from '../config';
import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { socket } from '../socket';

const Schedule = () => {
  const { roomCode } = useParams();
  const navigate = useNavigate();
  const [matches, setMatches] = useState([]);
  const [filter, setFilter] = useState('all'); // all, upcoming, completed, my
  const [loading, setLoading] = useState(true);
  const [myTeamId, setMyTeamId] = useState(null);

  const odId = localStorage.getItem('odId');

  useEffect(() => {
    fetch(`${API_URL}/api/room/${roomCode}/schedule`)
      .then(res => res.json())
      .then(data => {
        setMatches(data.matches || []);
        setMyTeamId(data.myTeamId);
        setLoading(false);
      })
      .catch(err => {
        console.error('Failed to fetch schedule:', err);
        setLoading(false);
      });

    socket.on('MATCH_COMPLETED', () => {
      fetch(`${API_URL}/api/room/${roomCode}/schedule`)
        .then(res => res.json())
        .then(data => setMatches(data.matches || []));
    });

    return () => {
      socket.off('MATCH_COMPLETED');
    };
  }, [roomCode]);

  const filteredMatches = matches.filter(match => {
    if (filter === 'upcoming') return match.status === 'SCHEDULED';
    if (filter === 'completed') return match.status === 'COMPLETED';
    if (filter === 'my') return match.team1Id === myTeamId || match.team2Id === myTeamId;
    return true;
  });

  const groupedMatches = filteredMatches.reduce((acc, match) => {
    const stage = match.stage || 'league';
    if (!acc[stage]) acc[stage] = [];
    acc[stage].push(match);
    return acc;
  }, {});

  const stageOrder = ['league', 'qualifier1', 'eliminator', 'qualifier2', 'final'];
  const stageNames = {
    league: 'League Stage',
    qualifier1: 'Qualifier 1',
    eliminator: 'Eliminator',
    qualifier2: 'Qualifier 2',
    final: 'Final'
  };

  const handleSimulateMatch = (matchId) => {
    socket.emit('SIMULATE_MATCH', { roomCode, matchId, odId });
  };

  if (loading) {
    return (
      <div className="home-container">
        <div className="loader"></div>
        <p>Loading schedule...</p>
      </div>
    );
  }

  return (
    <div className="app-container animate-slide-up">
      <h1 className="title-glow" style={{ textAlign: 'center', marginBottom: '10px' }}>
        IPL 2026
      </h1>
      <h2 style={{ textAlign: 'center', fontWeight: 300, opacity: 0.8, marginBottom: '30px' }}>
        MATCH SCHEDULE
      </h2>

      {/* Navigation */}
      <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', marginBottom: '20px' }}>
        <button className="btn" onClick={() => navigate(`/tournament/${roomCode}`)}>
          Home
        </button>
        <button className="btn" onClick={() => navigate(`/tournament/${roomCode}/standings`)}>
          Points Table
        </button>
        <button className="btn btn-primary">
          Schedule
        </button>
      </div>

      {/* Filter Tabs */}
      <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', marginBottom: '30px' }}>
        {['all', 'upcoming', 'completed', 'my'].map(f => (
          <button
            key={f}
            className={filter === f ? 'btn btn-primary' : 'btn'}
            style={{ padding: '8px 16px', fontSize: '0.85rem' }}
            onClick={() => setFilter(f)}
          >
            {f === 'my' ? 'My Matches' : f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      {/* Matches by Stage */}
      {stageOrder.map(stage => {
        const stageMatches = groupedMatches[stage];
        if (!stageMatches || stageMatches.length === 0) return null;

        return (
          <div key={stage} style={{ marginBottom: '30px' }}>
            <h3 style={{
              marginBottom: '15px',
              color: stage !== 'league' ? 'var(--accent-color)' : 'inherit',
              fontSize: stage !== 'league' ? '1.3rem' : '1.1rem'
            }}>
              {stageNames[stage]}
            </h3>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))', gap: '15px' }}>
              {stageMatches.map(match => {
                const isMyMatch = match.team1Id === myTeamId || match.team2Id === myTeamId;
                const isCompleted = match.status === 'COMPLETED';

                return (
                  <div
                    key={match.id}
                    className="glass-panel"
                    style={{
                      padding: '20px',
                      border: isMyMatch ? '1px solid var(--accent-color)' : 'none'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '15px' }}>
                      <span style={{ fontSize: '0.8rem', opacity: 0.6 }}>Match {match.matchNumber}</span>
                      <span style={{
                        fontSize: '0.75rem',
                        padding: '3px 8px',
                        borderRadius: '4px',
                        background: isCompleted ? 'var(--success-color)' : 'var(--accent-color)',
                        opacity: isCompleted ? 0.8 : 1
                      }}>
                        {isCompleted ? 'COMPLETED' : 'SCHEDULED'}
                      </span>
                    </div>

                    {/* Team 1 */}
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      marginBottom: '10px',
                      padding: '10px',
                      background: match.winnerId === match.team1Id ? 'rgba(46, 160, 67, 0.2)' : 'transparent',
                      borderRadius: '8px'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <img src={match.team1Logo} alt={match.team1Id} style={{ width: '35px', height: '35px' }} />
                        <div>
                          <div style={{ fontWeight: match.winnerId === match.team1Id ? 'bold' : 'normal' }}>
                            {match.team1Name}
                          </div>
                          {match.team1Id === myTeamId && (
                            <span style={{ fontSize: '0.65rem', color: 'var(--accent-color)' }}>YOUR TEAM</span>
                          )}
                        </div>
                      </div>
                      {isCompleted && (
                        <div style={{ fontWeight: 'bold', fontSize: '1.1rem' }}>
                          {match.team1Score}/{match.team1Wickets}
                          <span style={{ fontSize: '0.8rem', opacity: 0.7, marginLeft: '5px' }}>
                            ({match.team1Overs})
                          </span>
                        </div>
                      )}
                    </div>

                    {/* VS */}
                    <div style={{ textAlign: 'center', margin: '5px 0', fontSize: '0.8rem', opacity: 0.5 }}>
                      VS
                    </div>

                    {/* Team 2 */}
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      marginBottom: '15px',
                      padding: '10px',
                      background: match.winnerId === match.team2Id ? 'rgba(46, 160, 67, 0.2)' : 'transparent',
                      borderRadius: '8px'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <img src={match.team2Logo} alt={match.team2Id} style={{ width: '35px', height: '35px' }} />
                        <div>
                          <div style={{ fontWeight: match.winnerId === match.team2Id ? 'bold' : 'normal' }}>
                            {match.team2Name}
                          </div>
                          {match.team2Id === myTeamId && (
                            <span style={{ fontSize: '0.65rem', color: 'var(--accent-color)' }}>YOUR TEAM</span>
                          )}
                        </div>
                      </div>
                      {isCompleted && (
                        <div style={{ fontWeight: 'bold', fontSize: '1.1rem' }}>
                          {match.team2Score}/{match.team2Wickets}
                          <span style={{ fontSize: '0.8rem', opacity: 0.7, marginLeft: '5px' }}>
                            ({match.team2Overs})
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Result or Action */}
                    {isCompleted ? (
                      <div style={{
                        textAlign: 'center',
                        padding: '10px',
                        background: 'rgba(46, 160, 67, 0.1)',
                        borderRadius: '8px',
                        color: 'var(--success-color)',
                        fontSize: '0.9rem'
                      }}>
                        {match.winnerName} won {match.winMargin}
                      </div>
                    ) : (
                      <div style={{ display: 'flex', gap: '10px' }}>
                        {isMyMatch && (
                          <button
                            className="btn btn-primary"
                            style={{ flex: 1 }}
                            onClick={() => navigate(`/match/${roomCode}/${match.id}`)}
                          >
                            Play Match
                          </button>
                        )}
                        <button
                          className="btn"
                          style={{ flex: isMyMatch ? 0 : 1, padding: '10px 20px' }}
                          onClick={() => handleSimulateMatch(match.id)}
                        >
                          {isMyMatch ? 'Sim' : 'Simulate'}
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      {filteredMatches.length === 0 && (
        <div className="glass-panel" style={{ textAlign: 'center', padding: '40px' }}>
          <p style={{ opacity: 0.6 }}>No matches found for this filter.</p>
        </div>
      )}
    </div>
  );
};

export default Schedule;
