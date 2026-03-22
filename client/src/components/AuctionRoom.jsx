import { API_URL } from '../config';
import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { socket } from '../socket';

const formatMoney = (lakhs) => {
  if (lakhs >= 100) return `${(lakhs / 100).toFixed(2)} Cr`;
  return `${lakhs} L`;
};

const AuctionRoom = () => {
  const navigate = useNavigate();
  const { roomCode: urlRoomCode } = useParams();
  const roomCode = urlRoomCode || localStorage.getItem('roomCode');
  const teamId = localStorage.getItem('myTeamId');
  const teamName = localStorage.getItem('myTeamName');
  const odId = localStorage.getItem('odId');

  const [auctionState, setAuctionState] = useState({
    status: 'WAITING',
    currentPlayer: null,
    currentBid: 0,
    nextBid: 0,
    currentBidderId: null,
    currentBidderName: null,
    timeLeft: 0,
    currentSet: 'Awaiting Broadcast...'
  });

  const [players, setPlayers] = useState([]);
  const [teams, setTeams] = useState([]);
  const [myTeamData, setMyTeamData] = useState(null);
  const [soldMessage, setSoldMessage] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [recentBids, setRecentBids] = useState([]);
  const [creatingTournament, setCreatingTournament] = useState(false);
  const [selectedSet, setSelectedSet] = useState('');
  const [rightTab, setRightTab] = useState('ALL');

  useEffect(() => {
    if (!teamId && !urlRoomCode) {
      navigate('/');
      return;
    }

    // Join the room socket
    if (roomCode && odId) {
      socket.emit('RECONNECT_ROOM', { roomCode, odId, userName: localStorage.getItem('userName') });
    }

    fetchPlayers();
    fetchTeams();

    socket.on('auction_update', (state) => {
      setAuctionState(state);
      setSoldMessage(null);
      setErrorMsg('');
    });

    socket.on('new_bid', ({ teamId: bidderId, teamName: bidderName, amount, isAI }) => {
      fetchTeams();
      setRecentBids(prev => [{
        teamId: bidderId,
        teamName: bidderName,
        amount,
        isAI,
        timestamp: Date.now()
      }, ...prev.slice(0, 9)]);
    });

    socket.on('player_sold', ({ player, toTeam, toTeamName, amount }) => {
      setSoldMessage(`${player.name} SOLD to ${toTeamName || toTeam} for ${formatMoney(amount)}!`);
      fetchPlayers();
      fetchTeams();
      setRecentBids([]);
      setTimeout(() => setSoldMessage(null), 2500);
    });

    socket.on('player_unsold', ({ player }) => {
      setSoldMessage(`${player.name} UNSOLD`);
      fetchPlayers();
      setRecentBids([]);
      setTimeout(() => setSoldMessage(null), 2500);
    });

    socket.on('AUCTION_FINISHED', ({ roomCode: finishedRoomCode }) => {
      // Auction finished - create tournament
      createTournament();
    });

    socket.on('error', (msg) => {
      setErrorMsg(msg);
      setTimeout(() => setErrorMsg(''), 3000);
    });

    return () => {
      socket.off('auction_update');
      socket.off('new_bid');
      socket.off('player_sold');
      socket.off('player_unsold');
      socket.off('AUCTION_FINISHED');
      socket.off('error');
    };
  }, [roomCode, teamId, odId]);

  const fetchPlayers = () => {
    fetch(`${API_URL}/api/players`)
      .then(res => res.json())
      .then(data => setPlayers(data));
  };

  const fetchTeams = () => {
    fetch(`${API_URL}/api/teams`)
      .then(res => res.json())
      .then(data => {
        setTeams(data);
        if (teamId) {
          const mine = data.find(t => t.id === teamId);
          if (mine) setMyTeamData(mine);
        }
      });
  };

  const kickstartAuction = () => {
    if (roomCode) {
      socket.emit('START_AUCTION', { roomCode, odId });
    } else {
      socket.emit('START_WHOLE_AUCTION');
    }
  };

  const placeBid = () => {
    if (auctionState.status !== 'BIDDING') return;
    socket.emit('place_bid', { roomCode, teamId });
  };

  const createTournament = () => {
    if (creatingTournament) return;
    setCreatingTournament(true);

    fetch(`${API_URL}/api/room/${roomCode}/tournament/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    })
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          setTimeout(() => {
            navigate(`/tournament/${roomCode}`);
          }, 2000);
        }
      })
      .catch(err => {
        console.error('Failed to create tournament:', err);
        setCreatingTournament(false);
      });
  };

  const mySquad = players.filter(p => p.soldTo === teamId);
  const overseasCount = mySquad.filter(p => p.country !== 'India').length;

  return (
    <div className="auction-layout animate-slide-up">
      {/* Sidebar - Auction Info */}
      <div className="sidebar glass-panel">
        <h3 className="title-glow">Live Auction</h3>
        <div style={{ marginTop: '10px', padding: '12px', background: 'rgba(88, 166, 255, 0.1)', borderRadius: '8px', border: '1px solid var(--accent-color)' }}>
          <div className="stat-label">SESSION</div>
          <h2 style={{ color: 'var(--accent-color)', fontSize: '1.2rem' }}>{auctionState.currentSet}</h2>
        </div>

        {auctionState.status === 'WAITING' && (
           <button className="btn btn-primary pulse-btn" onClick={kickstartAuction} style={{ width: '100%', marginTop: '15px' }}>
             START BROADCAST
           </button>
        )}

        {auctionState.status === 'SET_BREAK' && (
          <div style={{ textAlign: 'center', marginTop: '15px' }}>
            <div className="loader"></div>
            <p>Next set in {auctionState.timeLeft}s</p>
          </div>
        )}

        <h4 style={{ marginTop: '20px', borderBottom: '1px solid var(--border-color)', paddingBottom:'5px' }}>Sets Explorer</h4>
        
        <div className="scrollable-list" style={{ marginTop: '10px' }}>
          <div>
            <select 
              className="input-field" 
              style={{ padding: '8px', marginBottom: '10px', fontSize: '0.85rem' }}
              value={selectedSet}
              onChange={e => setSelectedSet(e.target.value)}
            >
              <option value="">-- Select a Set --</option>
              {[...new Set(players.filter(p => p.status === 'AVAILABLE').map(p => p.setName))].sort().map(set => (
                <option key={set} value={set}>{set}</option>
              ))}
            </select>
            {selectedSet && players.filter(p => p.status === 'AVAILABLE' && p.setName === selectedSet).map(p => (
              <div key={p.id} className="stat-box" style={{ marginBottom: '8px', padding: '10px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                  <strong>{p.name}</strong>
                  <span style={{ color: 'var(--text-muted)' }}>{p.role}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Main Stage */}
      <div className="main-stage glass-panel">
        {soldMessage && <div className="sold-overlay">{soldMessage}</div>}

        {auctionState.status === 'FINISHED' ? (
           <div style={{ textAlign: 'center' }}>
             <h1 className="title-glow" style={{ fontSize: '3rem' }}>AUCTION COMPLETE</h1>
             <p style={{ opacity: 0.7, marginTop: '20px', fontSize: '1.2rem' }}>
               {creatingTournament ? 'Setting up the tournament...' : 'All players have been auctioned!'}
             </p>
             {creatingTournament && <div className="loader" style={{ marginTop: '20px' }}></div>}
             <button
               className="btn btn-primary"
               onClick={createTournament}
               disabled={creatingTournament}
               style={{ marginTop: '30px' }}
             >
               {creatingTournament ? 'Creating Tournament...' : 'Start IPL 2026'}
             </button>
           </div>
        ) : auctionState.status !== 'WAITING' && auctionState.currentPlayer ? (
          <div className="player-card">
            {auctionState.status === 'BIDDING' && (
              <div className={`countdown-ring ${auctionState.timeLeft <= 5 ? 'danger-pulse' : ''}`}>
                {auctionState.timeLeft}s
              </div>
            )}

            <div className="player-image-container">
               <img src={auctionState.currentPlayer.imageUrl} alt="Player" className="player-image" />
               <div style={{ position: 'absolute', bottom: '0', left: '0', width: '100%', background: 'linear-gradient(to top, #000 0%, transparent 100%)', padding: '40px 20px 10px' }}>
                  <h1 style={{ fontSize: '3rem', textAlign: 'left' }}>{auctionState.currentPlayer.name}</h1>
                  <p style={{ textAlign: 'left', color: '#58a6ff', fontWeight: 'bold' }}>{auctionState.currentPlayer.role} | {auctionState.currentPlayer.country}</p>
               </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '15px', marginTop: '20px' }}>
              <div className="stat-box">
                <div className="stat-label">BASE PRICE</div>
                <div className="stat-value">{formatMoney(auctionState.currentPlayer.basePrice)}</div>
              </div>
              <div className="stat-box" style={{ background: 'rgba(88, 166, 255, 0.1)', border: '1px solid #58a6ff' }}>
                <div className="stat-label">CURRENT BID</div>
                <div className="stat-value" style={{ color: '#58a6ff', fontSize: '1.8rem' }}>
                   {auctionState.currentBid > 0 ? formatMoney(auctionState.currentBid) : '--'}
                </div>
              </div>
              <div className="stat-box">
                <div className="stat-label">BIDDER</div>
                <div className="stat-value" style={{
                  color: auctionState.currentBidderId === teamId ? 'var(--success-color)' : 'var(--text-primary)',
                  fontSize: '1.2rem',
                  fontWeight: '700'
                }}>
                   {auctionState.currentBidderName || auctionState.currentBidderId || 'None'}
                </div>
              </div>
            </div>

            {errorMsg && <div style={{ color: 'var(--error-color)', marginTop: '10px' }}>{errorMsg}</div>}

            <div style={{ marginTop: '20px' }}>
              <button 
                className="btn btn-primary pulse-btn" 
                onClick={placeBid}
                disabled={auctionState.currentBidderId === teamId || auctionState.status !== 'BIDDING'}
                style={{ width: '100%', height: '70px', fontSize: '1.8rem' }}
              >
                {auctionState.status !== 'BIDDING' ? 'WAIT...' : 
                 auctionState.currentBidderId === teamId ? 'HIGHEST BIDDER' : 
                 `BID ${formatMoney(auctionState.nextBid)}`}
              </button>
            </div>
          </div>
        ) : (
          <div style={{ textAlign: 'center' }}>
            <h1 className="title-glow" style={{ fontSize: '3.5rem' }}>IPL 2026</h1>
            <h2 style={{ opacity: 0.5 }}>MEGA AUCTION</h2>
            <div className="loader" style={{ marginTop: '30px' }}></div>
            <p>Waiting for broadcast...</p>
          </div>
        )}
      </div>

      {/* Right Sidebar - Team */}
      <div className="sidebar glass-panel">
        <h3 className="title-glow">Franchise</h3>
        <div style={{ marginTop: '10px' }}>
          {myTeamData && (
             <div style={{ textAlign: 'center' }}>
               <img src={myTeamData.logoUrl} alt="Logo" style={{ width: '80px', marginBottom: '5px' }} />
               <h4 style={{ fontSize: '1rem' }}>{myTeamData.name}</h4>
               
               <div style={{ padding: '8px 10px', background: 'rgba(46, 160, 67, 0.08)', borderRadius: '8px', border: '1px solid var(--success-color)', margin: '10px 0' }}>
                 <div className="stat-label">PURSE</div>
                 <div className="stat-value" style={{ color: 'var(--success-color)', fontSize: '1.6rem' }}>{formatMoney(myTeamData.purse)}</div>
               </div>
               
               <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                 <div className="stat-box" style={{ padding: '8px' }}>
                   <div className="stat-label">SQUAD</div>
                   <div style={{ fontWeight: 'bold' }}>{players.filter(p => p.soldTo === teamId).length}/25</div>
                 </div>
                 <div className="stat-box" style={{ padding: '8px' }}>
                   <div className="stat-label">FOREIGN</div>
                   <div style={{ fontWeight: 'bold' }}>{players.filter(p => p.soldTo === teamId && p.country !== 'India').length}/8</div>
                 </div>
               </div>
             </div>
          )}
        </div>
        
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '15px', borderBottom: '1px solid var(--border-color)', paddingBottom:'5px' }}>
          <h4>Your Squad</h4>
        </div>
        
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px', marginTop: '10px' }}>
          <button 
            onClick={() => setRightTab('ALL')} 
            style={{ fontSize: '0.7rem', padding: '4px 8px', borderRadius: '12px', border: '1px solid var(--border-color)', background: rightTab === 'ALL' ? 'var(--accent-primary)' : 'transparent', color: rightTab === 'ALL' ? '#fff' : 'var(--text-secondary)', cursor: 'pointer', fontWeight: 600 }}
          >ALL</button>
          {[...new Set(players.filter(p => p.soldTo === teamId).map(p => p.role))].sort().map(role => (
             <button 
               key={role}
               onClick={() => setRightTab(role)} 
               style={{ fontSize: '0.7rem', padding: '4px 8px', borderRadius: '12px', border: '1px solid var(--border-color)', background: rightTab === role ? 'var(--accent-primary)' : 'transparent', color: rightTab === role ? '#fff' : 'var(--text-secondary)', cursor: 'pointer', fontWeight: 600 }}
             >
               {role.toUpperCase()}
             </button>
          ))}
        </div>

        <div className="scrollable-list" style={{ marginTop: '10px', maxHeight: '130px', flex: 'none' }}>
           {players.filter(p => p.soldTo === teamId && (rightTab === 'ALL' || p.role === rightTab)).reverse().map(p => (
             <div key={p.id} className="stat-box" style={{ marginBottom: '6px', padding: '8px', textAlign: 'left', background: 'var(--bg-card)' }}>
               <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.8rem' }}>
                 <strong style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '120px' }}>{p.name}</strong>
                 <span style={{ color: 'var(--success-color)', fontWeight: 600 }}>{formatMoney(p.currentBid)}</span>
               </div>
               {rightTab === 'ALL' && <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginTop: '2px', textTransform: 'uppercase' }}>{p.role}</div>}
             </div>
           ))}
        </div>
        
        <button className="btn" onClick={() => navigate('/simulation')} style={{ marginTop: 'auto', width: '100%', fontSize: '0.85rem' }}>
          Simulator
        </button>
      </div>
    </div>
  );
};

export default AuctionRoom;
