import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Home from './components/Home';
import CreateRoom from './components/CreateRoom';
import JoinRoom from './components/JoinRoom';
import Lobby from './components/Lobby';
import AuctionRoom from './components/AuctionRoom';
import TeamSelection from './components/TeamSelection';
import Simulator from './components/Simulator';
import TournamentHome from './components/TournamentHome';
import PointsTable from './components/PointsTable';
import Schedule from './components/Schedule';
import TeamSquad from './components/TeamSquad';
import MatchView from './components/MatchView';
import './App.css';

function App() {
  return (
    <Router>
      <div className="app-container">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/create-room" element={<CreateRoom />} />
          <Route path="/join-room" element={<JoinRoom />} />
          <Route path="/lobby/:roomCode" element={<Lobby />} />
          <Route path="/select-team/:roomCode" element={<TeamSelection />} />
          <Route path="/auction/:roomCode" element={<AuctionRoom />} />
          <Route path="/auction" element={<AuctionRoom />} />
          <Route path="/simulation" element={<Simulator />} />
          <Route path="/tournament/:roomCode" element={<TournamentHome />} />
          <Route path="/tournament/:roomCode/standings" element={<PointsTable />} />
          <Route path="/tournament/:roomCode/schedule" element={<Schedule />} />
          <Route path="/team/:roomCode/:teamId" element={<TeamSquad />} />
          <Route path="/match/:roomCode/:matchId" element={<MatchView />} />
        </Routes>
      </div>
    </Router>
  );
}

export default App;
