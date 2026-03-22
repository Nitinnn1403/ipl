import { API_URL } from '../config';
import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { socket } from '../socket';

const MatchView = () => {
  const { roomCode, matchId } = useParams();
  const navigate = useNavigate();
  const odId = localStorage.getItem('odId');
  const myTeamId = localStorage.getItem('myTeamId');

  const [match, setMatch] = useState(null);
  const [mySquad, setMySquad] = useState([]);
  const [selectedXI, setSelectedXI] = useState([]);
  const [phase, setPhase] = useState('TEAM_SELECT'); // TEAM_SELECT, TOSS, INNINGS_1, INNINGS_2, RESULT
  const [simulationSpeed, setSimulationSpeed] = useState('normal');
  const [liveScore, setLiveScore] = useState(null);
  const [commentary, setCommentary] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Fetch match details
    fetch(`${API_URL}/api/match/${matchId}`)
      .then(res => res.json())
      .then(data => {
        setMatch(data.match);
        if (data.match && (data.match.team1Id === myTeamId || data.match.team2Id === myTeamId)) {
          // Fetch my squad for team selection
          fetch(`${API_URL}/api/room/${roomCode}/team/${myTeamId}`)
            .then(res => res.json())
            .then(teamData => {
              setMySquad(teamData.players || []);
              // Auto-select best XI
              const bestXI = autoSelectXI(teamData.players || []);
              setSelectedXI(bestXI.map(p => p.id));
              setLoading(false);
            });
        } else {
          setLoading(false);
        }
      })
      .catch(err => {
        console.error('Failed to fetch match:', err);
        setLoading(false);
      });

    socket.on('MATCH_BALL', (ball) => {
      setLiveScore(ball.score);
      setCommentary(prev => [ball, ...prev.slice(0, 49)]);
    });

    socket.on('MATCH_COMPLETED', (result) => {
      setPhase('RESULT');
      setMatch(prev => ({ ...prev, ...result }));
    });

    socket.on('WAITING_FOR_OPPONENT', () => {
      setPhase('WAITING_OPPONENT');
    });

    return () => {
      socket.off('MATCH_BALL');
      socket.off('MATCH_COMPLETED');
      socket.off('WAITING_FOR_OPPONENT');
    };
  }, [matchId, myTeamId, roomCode]);

  const autoSelectXI = (players) => {
    if (!players || players.length < 11) return players || [];

    const sorted = [...players].sort((a, b) => {
      const aTotal = (a.battingRating || 0) + (a.bowlingRating || 0);
      const bTotal = (b.battingRating || 0) + (b.bowlingRating || 0);
      return bTotal - aTotal;
    });

    // Balance the team
    const keepers = sorted.filter(p => p.role === 'Wicketkeeper');
    const batters = sorted.filter(p => p.role === 'Batter');
    const allrounders = sorted.filter(p => p.role === 'All-Rounder');
    const bowlers = sorted.filter(p => p.role === 'Bowler');

    const xi = [];
    if (keepers.length > 0) xi.push(keepers[0]);
    batters.slice(0, keepers.length > 0 ? 4 : 5).forEach(p => xi.push(p));
    allrounders.slice(0, 3).forEach(p => { if (xi.length < 8) xi.push(p); });
    bowlers.slice(0, 5).forEach(p => { if (xi.length < 11) xi.push(p); });
    sorted.forEach(p => { if (xi.length < 11 && !xi.find(x => x.id === p.id)) xi.push(p); });

    return xi.slice(0, 11);
  };

  const togglePlayer = (playerId) => {
    if (selectedXI.includes(playerId)) {
      setSelectedXI(prev => prev.filter(id => id !== playerId));
    } else if (selectedXI.length < 11) {
      setSelectedXI(prev => [...prev, playerId]);
    }
  };

  const isValidXI = () => {
    if (selectedXI.length !== 11) return false;
    const selected = mySquad.filter(p => selectedXI.includes(p.id));
    const overseas = selected.filter(p => p.country !== 'India').length;
    return overseas <= 4;
  };

  const startMatch = () => {
    if (!isValidXI()) return;

    socket.emit('START_MATCH', {
      roomCode,
      matchId,
      odId,
      playingXI: selectedXI,
      speed: simulationSpeed
    });

    setPhase('TOSS');
  };

  const simulateMatch = () => {
    socket.emit('SIMULATE_MATCH', { roomCode, matchId: parseInt(matchId), odId });
    setPhase('INNINGS_1');
  };

  if (loading) {
    return (
      <div className="home-container">
        <div className="loader"></div>
        <p>Loading match...</p>
      </div>
    );
  }

  if (!match) {
    return (
      <div className="home-container">
        <h2>Match not found</h2>
        <button className="btn" onClick={() => navigate(`/tournament/${roomCode}`)}>
          Back to Tournament
        </button>
      </div>
    );
  }

  const isMyMatch = match.team1Id === myTeamId || match.team2Id === myTeamId;

  return (
    <div className="app-container animate-slide-up">
      {/* Match Header */}
      <div className="glass-panel" style={{ marginBottom: '20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
            <img src={match.team1Logo} alt={match.team1Id} style={{ width: '50px', height: '50px' }} />
            <div>
              <div style={{ fontWeight: 'bold', fontSize: '1.2rem' }}>{match.team1Name}</div>
              {liveScore && liveScore.battingTeam === match.team1Id && (
                <div style={{ color: 'var(--accent-color)', fontSize: '1.5rem', fontWeight: 'bold' }}>
                  {liveScore.runs}/{liveScore.wickets} ({liveScore.overs})
                </div>
              )}
            </div>
          </div>

          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: 'var(--accent-color)' }}>VS</div>
            <div style={{ fontSize: '0.8rem', opacity: 0.6 }}>Match {match.matchNumber}</div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '15px', flexDirection: 'row-reverse' }}>
            <img src={match.team2Logo} alt={match.team2Id} style={{ width: '50px', height: '50px' }} />
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontWeight: 'bold', fontSize: '1.2rem' }}>{match.team2Name}</div>
              {liveScore && liveScore.battingTeam === match.team2Id && (
                <div style={{ color: 'var(--accent-color)', fontSize: '1.5rem', fontWeight: 'bold' }}>
                  {liveScore.runs}/{liveScore.wickets} ({liveScore.overs})
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Phase: Team Selection */}
      {phase === 'TEAM_SELECT' && isMyMatch && (
        <div>
          <h2 style={{ marginBottom: '20px' }}>Select Your Playing XI</h2>

          <div style={{ display: 'flex', gap: '20px', marginBottom: '20px' }}>
            <div className="stat-box" style={{ flex: 1 }}>
              <div style={{ fontSize: '2rem', fontWeight: 'bold', color: selectedXI.length === 11 ? 'var(--success-color)' : 'var(--warning-color)' }}>
                {selectedXI.length}/11
              </div>
              <div style={{ fontSize: '0.85rem', opacity: 0.7 }}>Players Selected</div>
            </div>
            <div className="stat-box" style={{ flex: 1 }}>
              <div style={{ fontSize: '2rem', fontWeight: 'bold', color: mySquad.filter(p => selectedXI.includes(p.id) && p.country !== 'India').length > 4 ? 'var(--error-color)' : 'var(--success-color)' }}>
                {mySquad.filter(p => selectedXI.includes(p.id) && p.country !== 'India').length}/4
              </div>
              <div style={{ fontSize: '0.85rem', opacity: 0.7 }}>Overseas Players</div>
            </div>
          </div>

          <div className="glass-panel" style={{ maxHeight: '400px', overflow: 'auto' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '10px' }}>
              {mySquad.map(player => {
                const isSelected = selectedXI.includes(player.id);
                const isOverseas = player.country !== 'India';
                const overseasCount = mySquad.filter(p => selectedXI.includes(p.id) && p.country !== 'India').length;
                const canSelect = isSelected || (selectedXI.length < 11 && (!isOverseas || overseasCount < 4));

                return (
                  <div
                    key={player.id}
                    onClick={() => canSelect && togglePlayer(player.id)}
                    style={{
                      padding: '12px',
                      borderRadius: '8px',
                      cursor: canSelect ? 'pointer' : 'not-allowed',
                      background: isSelected ? 'rgba(46, 160, 67, 0.2)' : 'rgba(255,255,255,0.05)',
                      border: isSelected ? '2px solid var(--success-color)' : '1px solid var(--border-color)',
                      opacity: canSelect ? 1 : 0.5,
                      transition: 'all 0.2s'
                    }}
                  >
                    <div style={{ fontWeight: 'bold', fontSize: '0.9rem' }}>{player.name}</div>
                    <div style={{ fontSize: '0.75rem', opacity: 0.7 }}>
                      {player.role}
                      {isOverseas && <span style={{ color: 'var(--warning-color)', marginLeft: '5px' }}>OS</span>}
                    </div>
                    <div style={{ display: 'flex', gap: '10px', marginTop: '5px', fontSize: '0.7rem' }}>
                      <span>BAT: {player.battingRating}</span>
                      <span>BOWL: {player.bowlingRating}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div style={{ marginTop: '20px', display: 'flex', gap: '15px', justifyContent: 'center' }}>
            <button
              className="btn btn-primary"
              onClick={startMatch}
              disabled={!isValidXI()}
              style={{ padding: '15px 40px', fontSize: '1.1rem' }}
            >
              Start Match
            </button>
            <button
              className="btn"
              onClick={simulateMatch}
              style={{ padding: '15px 30px' }}
            >
              Quick Simulate
            </button>
          </div>
        </div>
      )}

      {/* Phase: Not my match - just simulate */}
      {phase === 'TEAM_SELECT' && !isMyMatch && (
        <div style={{ textAlign: 'center' }}>
          <p style={{ opacity: 0.7, marginBottom: '20px' }}>This is not your team's match.</p>
          <button
            className="btn btn-primary"
            onClick={simulateMatch}
            style={{ padding: '15px 40px', fontSize: '1.1rem' }}
          >
            Simulate Match
          </button>
        </div>
      )}

      {/* Phase: Waiting for opponent */}
      {phase === 'WAITING_OPPONENT' && (
        <div className="glass-panel" style={{ textAlign: 'center', padding: '40px' }}>
          <h2 style={{ marginBottom: '20px', color: 'var(--accent-color)' }}>Waiting on Opponent</h2>
          <div className="loader" style={{ margin: '0 auto' }}></div>
          <p style={{ marginTop: '15px', opacity: 0.7 }}>
            Your friend is still manually selecting their Playing XI... The match will automatically begin simulating the instant their roster is locked!
          </p>
        </div>
      )}

      {/* Phase: Match in Progress */}
      {(phase === 'INNINGS_1' || phase === 'INNINGS_2') && (
        <div className="glass-panel">
          <h3 style={{ marginBottom: '20px' }}>Match in Progress...</h3>
          <div className="loader"></div>
          <p style={{ marginTop: '15px', opacity: 0.7 }}>Simulating cricket action...</p>
        </div>
      )}

      {/* Phase: Result */}
      {phase === 'RESULT' && match.winnerId && (
        <div className="glass-panel" style={{ textAlign: 'center' }}>
          <h2 style={{ color: 'var(--success-color)', marginBottom: '20px' }}>
            {match.winnerName || match.winnerId} Wins!
          </h2>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '30px', marginBottom: '30px' }}>
            <div className="stat-box">
              <div style={{ fontWeight: 'bold', marginBottom: '10px' }}>{match.team1Name}</div>
              <div style={{ fontSize: '2rem', fontWeight: 'bold' }}>
                {match.team1Score}/{match.team1Wickets}
              </div>
              <div style={{ opacity: 0.7 }}>({match.team1Overs} overs)</div>
            </div>
            <div className="stat-box">
              <div style={{ fontWeight: 'bold', marginBottom: '10px' }}>{match.team2Name}</div>
              <div style={{ fontSize: '2rem', fontWeight: 'bold' }}>
                {match.team2Score}/{match.team2Wickets}
              </div>
              <div style={{ opacity: 0.7 }}>({match.team2Overs} overs)</div>
            </div>
          </div>

          <button
            className="btn btn-primary"
            onClick={() => navigate(`/tournament/${roomCode}`)}
            style={{ padding: '12px 30px' }}
          >
            Back to Tournament
          </button>
        </div>
      )}

      {/* Back Navigation */}
      <div style={{ marginTop: '20px', textAlign: 'center' }}>
        <button className="btn" onClick={() => navigate(`/tournament/${roomCode}`)}>
          Back to Tournament Home
        </button>
      </div>
    </div>
  );
};

export default MatchView;
