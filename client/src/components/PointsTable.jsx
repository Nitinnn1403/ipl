import { API_URL } from '../config';
import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

const PointsTable = () => {
  const { roomCode } = useParams();
  const navigate = useNavigate();
  const [standings, setStandings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [myTeamId, setMyTeamId] = useState(null);

  useEffect(() => {
    fetch(`${API_URL}/api/room/${roomCode}/standings`)
      .then(res => res.json())
      .then(data => {
        setStandings(data.standings || []);
        setMyTeamId(data.myTeamId);
        setLoading(false);
      })
      .catch(err => {
        console.error('Failed to fetch standings:', err);
        setLoading(false);
      });
  }, [roomCode]);

  if (loading) {
    return (
      <div className="home-container">
        <div className="loader"></div>
        <p>Loading standings...</p>
      </div>
    );
  }

  return (
    <div className="app-container animate-slide-up">
      <h1 className="title-glow" style={{ textAlign: 'center', marginBottom: '10px' }}>
        IPL 2026
      </h1>
      <h2 style={{ textAlign: 'center', fontWeight: 300, opacity: 0.8, marginBottom: '30px' }}>
        POINTS TABLE
      </h2>

      {/* Navigation */}
      <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', marginBottom: '30px' }}>
        <button className="btn" onClick={() => navigate(`/tournament/${roomCode}`)}>
          Home
        </button>
        <button className="btn btn-primary">
          Points Table
        </button>
        <button className="btn" onClick={() => navigate(`/tournament/${roomCode}/schedule`)}>
          Schedule
        </button>
      </div>

      {/* Points Table */}
      <div className="glass-panel">
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '2px solid var(--border-color)' }}>
              <th style={{ textAlign: 'left', padding: '15px 10px', fontSize: '0.9rem', opacity: 0.7 }}>POS</th>
              <th style={{ textAlign: 'left', padding: '15px 10px', fontSize: '0.9rem', opacity: 0.7 }}>TEAM</th>
              <th style={{ textAlign: 'center', padding: '15px 10px', fontSize: '0.9rem', opacity: 0.7 }}>P</th>
              <th style={{ textAlign: 'center', padding: '15px 10px', fontSize: '0.9rem', opacity: 0.7 }}>W</th>
              <th style={{ textAlign: 'center', padding: '15px 10px', fontSize: '0.9rem', opacity: 0.7 }}>L</th>
              <th style={{ textAlign: 'center', padding: '15px 10px', fontSize: '0.9rem', opacity: 0.7 }}>NR</th>
              <th style={{ textAlign: 'center', padding: '15px 10px', fontSize: '0.9rem', opacity: 0.7 }}>PTS</th>
              <th style={{ textAlign: 'center', padding: '15px 10px', fontSize: '0.9rem', opacity: 0.7 }}>FOR</th>
              <th style={{ textAlign: 'center', padding: '15px 10px', fontSize: '0.9rem', opacity: 0.7 }}>AGAINST</th>
              <th style={{ textAlign: 'right', padding: '15px 10px', fontSize: '0.9rem', opacity: 0.7 }}>NRR</th>
            </tr>
          </thead>
          <tbody>
            {standings.map((team, index) => {
              const isQualified = index < 4;
              const isMyTeam = team.teamId === myTeamId;

              return (
                <tr
                  key={team.teamId}
                  style={{
                    borderBottom: '1px solid rgba(255,255,255,0.05)',
                    background: isMyTeam ? 'rgba(88, 166, 255, 0.1)' : 'transparent',
                    cursor: 'pointer'
                  }}
                  onClick={() => navigate(`/team/${roomCode}/${team.teamId}`)}
                >
                  <td style={{ padding: '15px 10px' }}>
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px'
                    }}>
                      <span style={{
                        width: '30px',
                        height: '30px',
                        borderRadius: '50%',
                        background: isQualified ? 'var(--success-color)' : 'rgba(255,255,255,0.1)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontWeight: 'bold',
                        fontSize: '0.9rem'
                      }}>
                        {index + 1}
                      </span>
                    </div>
                  </td>
                  <td style={{ padding: '15px 10px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <img src={team.logoUrl} alt={team.teamId} style={{ width: '35px', height: '35px' }} />
                      <div>
                        <div style={{ fontWeight: 'bold', fontSize: '1rem' }}>{team.teamName}</div>
                        <div style={{ fontSize: '0.75rem', opacity: 0.6 }}>{team.teamId}</div>
                      </div>
                      {isMyTeam && (
                        <span style={{
                          marginLeft: '8px',
                          fontSize: '0.65rem',
                          background: 'var(--accent-color)',
                          padding: '2px 6px',
                          borderRadius: '4px'
                        }}>
                          YOU
                        </span>
                      )}
                    </div>
                  </td>
                  <td style={{ textAlign: 'center', padding: '15px 10px', fontSize: '1rem' }}>
                    {team.played}
                  </td>
                  <td style={{ textAlign: 'center', padding: '15px 10px', fontSize: '1rem', color: 'var(--success-color)' }}>
                    {team.won}
                  </td>
                  <td style={{ textAlign: 'center', padding: '15px 10px', fontSize: '1rem', color: 'var(--error-color)' }}>
                    {team.lost}
                  </td>
                  <td style={{ textAlign: 'center', padding: '15px 10px', fontSize: '1rem', opacity: 0.6 }}>
                    {team.noResult || 0}
                  </td>
                  <td style={{ textAlign: 'center', padding: '15px 10px' }}>
                    <span style={{
                      fontWeight: 'bold',
                      fontSize: '1.2rem',
                      color: 'var(--accent-color)'
                    }}>
                      {team.points}
                    </span>
                  </td>
                  <td style={{ textAlign: 'center', padding: '15px 10px', fontSize: '0.85rem', opacity: 0.8 }}>
                    {team.runsFor}/{team.oversFor?.toFixed(1) || '0.0'}
                  </td>
                  <td style={{ textAlign: 'center', padding: '15px 10px', fontSize: '0.85rem', opacity: 0.8 }}>
                    {team.runsAgainst}/{team.oversAgainst?.toFixed(1) || '0.0'}
                  </td>
                  <td style={{
                    textAlign: 'right',
                    padding: '15px 10px',
                    fontWeight: 'bold',
                    fontSize: '1rem',
                    color: team.nrr >= 0 ? 'var(--success-color)' : 'var(--error-color)'
                  }}>
                    {team.nrr >= 0 ? '+' : ''}{team.nrr?.toFixed(3) || '0.000'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Legend */}
      <div className="glass-panel" style={{ marginTop: '20px', display: 'flex', gap: '30px', justifyContent: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{
            width: '20px',
            height: '20px',
            borderRadius: '50%',
            background: 'var(--success-color)'
          }}></span>
          <span style={{ fontSize: '0.85rem', opacity: 0.8 }}>Qualified for Playoffs</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '0.85rem', opacity: 0.8 }}>
          <span>P: Played</span>
          <span>W: Won</span>
          <span>L: Lost</span>
          <span>NR: No Result</span>
          <span>NRR: Net Run Rate</span>
        </div>
      </div>

      {/* NRR Explanation */}
      <div className="stat-box" style={{ marginTop: '20px', padding: '15px' }}>
        <h4 style={{ marginBottom: '10px', color: 'var(--accent-color)' }}>How NRR Works</h4>
        <p style={{ fontSize: '0.85rem', opacity: 0.8, lineHeight: 1.6 }}>
          Net Run Rate = (Total Runs Scored / Overs Faced) - (Total Runs Conceded / Overs Bowled)
          <br />
          A positive NRR means a team scores faster than they concede. Higher NRR is better for tiebreakers.
        </p>
      </div>
    </div>
  );
};

export default PointsTable;
