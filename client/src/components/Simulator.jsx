import { API_URL } from '../config';
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

const Simulator = () => {
  const [teams, setTeams] = useState([]);
  const [players, setPlayers] = useState([]);
  const [matchState, setMatchState] = useState(null);
  const [logs, setLogs] = useState([]);
  const [isSimulating, setIsSimulating] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    Promise.all([
      fetch(`${API_URL}/api/teams`).then(r => r.json()),
      fetch(`${API_URL}/api/players`).then(r => r.json())
    ]).then(([teamsData, playersData]) => {
      setTeams(teamsData);
      setPlayers(playersData);
    });
  }, []);

  const getTeamSquad = (teamId) => players.filter(p => p.soldTo === teamId);

  const startSimulation = () => {
    setLogs(["Loading...", "Fetching match from Server engine..."]);
    setIsSimulating(true);

    fetch(`${API_URL}/api/simulate-random`, { method: 'POST' })
      .then(res => res.json())
      .then(data => {
        if (data.error) {
          alert(data.error);
          setIsSimulating(false);
          setLogs([]);
          return;
        }

        setMatchState({
          team1: teams.find(t => t.id === data.firstInnings.teamId),
          team2: teams.find(t => t.id === data.secondInnings.teamId),
          team1Score: 0,
          team2Score: 0,
          team1Wickets: 0,
          team2Wickets: 0,
          currentInning: 1,
          ballsRemaining: 120,
          fullResult: data,
          ballIndex: 0
        });

        setLogs([
          `Toss won by ${data.toss.winner}. Decision: ${data.toss.decision}`,
          `First Innings starting: ${data.firstInnings.teamName} batting.`
        ]);
      })
      .catch(err => {
        console.error(err);
        alert('Failed to simulate match. Ensure backend is running and teams have at least 11 players.');
        setIsSimulating(false);
        setLogs([]);
      });
  };

  useEffect(() => {
    if (!isSimulating || !matchState || !matchState.fullResult) return;

    const timer = setTimeout(() => {
      const { fullResult, currentInning, ballIndex } = matchState;
      const inningsData = currentInning === 1 ? fullResult.firstInnings : fullResult.secondInnings;

      if (ballIndex >= inningsData.ballByBall.length) {
        // End of inning or match
        if (currentInning === 1) {
          setLogs(prev => [...prev, `END OF INNING 1. ${inningsData.teamName} scored ${inningsData.runs}/${inningsData.wickets}. Target: ${fullResult.secondInnings.target}`]);
          setTimeout(() => {
            setMatchState(prev => ({ ...prev, currentInning: 2, ballIndex: 0, ballsRemaining: 120 }));
            setLogs(prev => [...prev, `Second Innings starting: ${fullResult.secondInnings.teamName} chasing ${fullResult.secondInnings.target}.`]);
          }, 3000);
        } else {
          // Match Over
          setLogs(prev => [
            ...prev, 
            `MATCH OVER! ${fullResult.winnerName} wins ${fullResult.margin}!`,
            ...(fullResult.playerOfMatch ? [`Player of the Match: ${fullResult.playerOfMatch.name}`] : [])
          ]);
          setIsSimulating(false);
        }
        return;
      }

      const ball = inningsData.ballByBall[ballIndex];
      const teamPrefix = currentInning === 1 ? matchState.team1.id : matchState.team2.id;
      let eventLog = "";

      if (ball.result === 'W') {
        eventLog = `WICKET! ${ball.batter} out ${ball.dismissal} (b ${ball.bowler})`;
      } else {
        eventLog = `${ball.result} runs to ${ball.batter} (b ${ball.bowler})`;
      }

      const [runs, wickets] = ball.score.split('/');

      setMatchState(prev => {
        const next = { ...prev, ballIndex: ballIndex + 1, ballsRemaining: prev.ballsRemaining - 1 };
        if (currentInning === 1) {
          next.team1Score = parseInt(runs) || 0;
          next.team1Wickets = parseInt(wickets) || 0;
        } else {
          next.team2Score = parseInt(runs) || 0;
          next.team2Wickets = parseInt(wickets) || 0;
        }
        return next;
      });

      setLogs(l => [...l, `[${ball.over}.${ball.ball}] ${teamPrefix}: ${eventLog}`]);

    }, 150); // 150ms per ball for fast simulation

    return () => clearTimeout(timer);
  }, [matchState, isSimulating]);

  return (
    <div className="home-container animate-slide-up" style={{ padding: '20px' }}>
      <h1 className="title-glow">T20 Match Simulator</h1>
      
      {!matchState && (
        <button className="btn btn-primary" onClick={startSimulation} style={{ margin: '20px' }}>
          Simulate Random Match
        </button>
      )}

      {matchState && (
        <div style={{ width: '100%', maxWidth: '800px' }}>
          <div className="glass-panel" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
            <div style={{ textAlign: 'center', width: '30%' }}>
              <img src={matchState.team1.logoUrl} style={{ width: '60px' }} alt="" />
              <h2>{matchState.team1.id}</h2>
              <div className="current-bid-display" style={{ fontSize: '2.5rem' }}>
                {matchState.team1Score}/{matchState.team1Wickets}
              </div>
            </div>
            
            <div style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>VS</div>

            <div style={{ textAlign: 'center', width: '30%' }}>
              <img src={matchState.team2.logoUrl} style={{ width: '60px' }} alt="" />
              <h2>{matchState.team2.id}</h2>
              <div className="current-bid-display" style={{ fontSize: '2.5rem' }}>
                {matchState.team2Score}/{matchState.team2Wickets}
              </div>
            </div>
          </div>

          <div style={{ textAlign: 'center', marginBottom: '20px' }}>
            {matchState.currentInning === 1 
              ? `Inning 1 | Balls left: ${matchState.ballsRemaining}` 
              : `Inning 2 | Target: ${matchState.team1Score + 1} | Balls left: ${matchState.ballsRemaining}`
            }
          </div>

          <div className="glass-panel" style={{ maxHeight: '300px', overflowY: 'auto', textAlign: 'left', display: 'flex', flexDirection: 'column-reverse' }}>
            {logs.slice().reverse().map((log, i) => (
              <div key={i} style={{ padding: '5px', borderBottom: '1px solid var(--border-color)' }}>
                {log}
              </div>
            ))}
          </div>
          
          {!isSimulating && (
            <button className="btn btn-primary" onClick={() => setMatchState(null)} style={{ marginTop: '20px' }}>
              Simulate Another Match
            </button>
          )}
        </div>
      )}

      <button className="btn" onClick={() => navigate('/auction')} style={{ marginTop: '40px' }}>
        Back to Auction Let's Buy Players!
      </button>
    </div>
  );
};

export default Simulator;
