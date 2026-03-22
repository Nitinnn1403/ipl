import { API_URL } from '../config';
import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { socket } from '../socket';

const formatMoney = (lakhs) => {
  if (lakhs >= 100) return `₹${(lakhs / 100).toFixed(2)} Cr`;
  return `₹${lakhs} L`;
};

const TournamentHome = () => {
  const { roomCode } = useParams();
  const navigate = useNavigate();
  const [tournament, setTournament] = useState(null);
  const [standings, setStandings] = useState([]);
  const [upcomingMatches, setUpcomingMatches] = useState([]);
  const [recentResults, setRecentResults] = useState([]);
  const [myTeam, setMyTeam] = useState(null);
  const [loading, setLoading] = useState(true);

  const odId = localStorage.getItem('odId');

  useEffect(() => {
    // Fetch tournament data
    fetch(`${API_URL}/api/room/${roomCode}/tournament`)
      .then(res => res.json())
      .then(data => {
        setTournament(data.tournament);
        setStandings(data.standings || []);
        setUpcomingMatches(data.upcomingMatches || []);
        setRecentResults(data.recentResults || []);
        setMyTeam(data.myTeam);
        setLoading(false);
      })
      .catch(err => {
        console.error('Failed to fetch tournament:', err);
        setLoading(false);
      });

    // Listen for match updates
    socket.on('MATCH_COMPLETED', (data) => {
      // Refresh standings and matches
      fetch(`${API_URL}/api/room/${roomCode}/tournament`)
        .then(res => res.json())
        .then(data => {
          setStandings(data.standings || []);
          setUpcomingMatches(data.upcomingMatches || []);
          setRecentResults(data.recentResults || []);
        });
    });

    return () => {
      socket.off('MATCH_COMPLETED');
    };
  }, [roomCode]);

  const handlePlayMatch = (matchId) => {
    navigate(`/match/${roomCode}/${matchId}`);
  };

  const handleSimulateMatch = (matchId) => {
    socket.emit('SIMULATE_MATCH', { roomCode, matchId, odId });
  };

  if (loading) {
    return (
      <div className="home-container">
        <div className="loader"></div>
        <p>Loading tournament...</p>
      </div>
    );
  }

  return (
    <div className="app-container animate-slide-up">
      <h1 className="title-glow" style={{ textAlign: 'center', marginBottom: '10px' }}>
        IPL 2026
      </h1>
      <h2 style={{ textAlign: 'center', fontWeight: 300, opacity: 0.8, marginBottom: '30px' }}>
        {tournament?.status === 'PLAYOFFS' ? 'PLAYOFFS' : 'LEAGUE STAGE'}
      </h2>

      {/* Navigation Tabs */}
      <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', marginBottom: '30px' }}>
        <button className="btn btn-primary" onClick={() => navigate(`/tournament/${roomCode}`)}>
          Home
        </button>
        <button className="btn" onClick={() => navigate(`/tournament/${roomCode}/standings`)}>
          Points Table
        </button>
        <button className="btn" onClick={() => navigate(`/tournament/${roomCode}/schedule`)}>
          Schedule
        </button>
        {myTeam && (
          <button className="btn" onClick={() => navigate(`/team/${roomCode}/${myTeam.id}`)}>
            My Squad
          </button>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '30px' }}>
        {/* Left Column - Upcoming Matches */}
        <div className="glass-panel">
          <h3 style={{ marginBottom: '20px', borderBottom: '1px solid var(--border-color)', paddingBottom: '10px' }}>
            Upcoming Matches
          </h3>

          {upcomingMatches.length === 0 ? (
            <p style={{ opacity: 0.6 }}>No upcoming matches</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
              {upcomingMatches.slice(0, 5).map((match) => (
                <div key={match.id} className="stat-box" style={{ padding: '15px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                    <span style={{ fontSize: '0.8rem', opacity: 0.6 }}>Match {match.matchNumber}</span>
                    <span style={{ fontSize: '0.8rem', opacity: 0.6 }}>{match.stage}</span>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '15px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <img src={match.team1Logo} alt={match.team1Id} style={{ width: '40px', height: '40px' }} />
                      <span style={{ fontWeight: 'bold' }}>{match.team1Name}</span>
                    </div>
                    <span style={{ fontSize: '1.2rem', fontWeight: 'bold', color: 'var(--accent-color)' }}>VS</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <span style={{ fontWeight: 'bold' }}>{match.team2Name}</span>
                      <img src={match.team2Logo} alt={match.team2Id} style={{ width: '40px', height: '40px' }} />
                    </div>
                  </div>

                  {(match.isMyMatch) && (
                    <div style={{ display: 'flex', gap: '10px' }}>
                      <button
                        className="btn btn-primary"
                        style={{ flex: 1, padding: '10px' }}
                        onClick={() => handlePlayMatch(match.id)}
                      >
                        Play Match
                      </button>
                      <button
                        className="btn"
                        style={{ padding: '10px' }}
                        onClick={() => handleSimulateMatch(match.id)}
                      >
                        Simulate
                      </button>
                    </div>
                  )}

                  {!match.isMyMatch && (
                    <button
                      className="btn"
                      style={{ width: '100%', padding: '10px' }}
                      onClick={() => handleSimulateMatch(match.id)}
                    >
                      Simulate Match
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right Column - Points Table Preview */}
        <div className="glass-panel">
          <h3 style={{ marginBottom: '20px', borderBottom: '1px solid var(--border-color)', paddingBottom: '10px' }}>
            Points Table
          </h3>

          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                <th style={{ textAlign: 'left', padding: '10px 5px', fontSize: '0.8rem', opacity: 0.7 }}>#</th>
                <th style={{ textAlign: 'left', padding: '10px 5px', fontSize: '0.8rem', opacity: 0.7 }}>Team</th>
                <th style={{ textAlign: 'center', padding: '10px 5px', fontSize: '0.8rem', opacity: 0.7 }}>P</th>
                <th style={{ textAlign: 'center', padding: '10px 5px', fontSize: '0.8rem', opacity: 0.7 }}>W</th>
                <th style={{ textAlign: 'center', padding: '10px 5px', fontSize: '0.8rem', opacity: 0.7 }}>Pts</th>
                <th style={{ textAlign: 'right', padding: '10px 5px', fontSize: '0.8rem', opacity: 0.7 }}>NRR</th>
              </tr>
            </thead>
            <tbody>
              {standings.slice(0, 10).map((team, index) => (
                <tr
                  key={team.teamId}
                  style={{
                    borderBottom: '1px solid rgba(255,255,255,0.05)',
                    background: myTeam?.id === team.teamId ? 'rgba(88, 166, 255, 0.1)' : 'transparent',
                    borderLeft: index < 4 ? '3px solid var(--success-color)' : 'none'
                  }}
                >
                  <td style={{ padding: '12px 5px', fontSize: '0.9rem' }}>{index + 1}</td>
                  <td style={{ padding: '12px 5px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <img src={team.logoUrl} alt={team.teamId} style={{ width: '25px', height: '25px' }} />
                      <span style={{ fontWeight: myTeam?.id === team.teamId ? 'bold' : 'normal' }}>
                        {team.teamId}
                      </span>
                    </div>
                  </td>
                  <td style={{ textAlign: 'center', padding: '12px 5px' }}>{team.played}</td>
                  <td style={{ textAlign: 'center', padding: '12px 5px' }}>{team.won}</td>
                  <td style={{ textAlign: 'center', padding: '12px 5px', fontWeight: 'bold', color: 'var(--accent-color)' }}>
                    {team.points}
                  </td>
                  <td style={{ textAlign: 'right', padding: '12px 5px', color: team.nrr >= 0 ? 'var(--success-color)' : 'var(--error-color)' }}>
                    {team.nrr >= 0 ? '+' : ''}{team.nrr.toFixed(3)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <button
            className="btn"
            style={{ width: '100%', marginTop: '15px' }}
            onClick={() => navigate(`/tournament/${roomCode}/standings`)}
          >
            View Full Table
          </button>
        </div>
      </div>

      {/* Recent Results */}
      {recentResults.length > 0 && (
        <div className="glass-panel" style={{ marginTop: '30px' }}>
          <h3 style={{ marginBottom: '20px', borderBottom: '1px solid var(--border-color)', paddingBottom: '10px' }}>
            Recent Results
          </h3>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '15px' }}>
            {recentResults.slice(0, 6).map((match) => (
              <div key={match.id} className="stat-box" style={{ padding: '15px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '5px' }}>
                      <img src={match.team1Logo} alt={match.team1Id} style={{ width: '25px', height: '25px' }} />
                      <span style={{ fontWeight: match.winnerId === match.team1Id ? 'bold' : 'normal' }}>
                        {match.team1Id}
                      </span>
                      <span style={{ marginLeft: 'auto' }}>
                        {match.team1Score}/{match.team1Wickets} ({match.team1Overs})
                      </span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <img src={match.team2Logo} alt={match.team2Id} style={{ width: '25px', height: '25px' }} />
                      <span style={{ fontWeight: match.winnerId === match.team2Id ? 'bold' : 'normal' }}>
                        {match.team2Id}
                      </span>
                      <span style={{ marginLeft: 'auto' }}>
                        {match.team2Score}/{match.team2Wickets} ({match.team2Overs})
                      </span>
                    </div>
                  </div>
                </div>
                <div style={{ marginTop: '10px', fontSize: '0.8rem', color: 'var(--success-color)' }}>
                  {match.winnerId} won by {match.winMargin}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default TournamentHome;
