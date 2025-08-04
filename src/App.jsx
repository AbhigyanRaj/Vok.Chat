import { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, useNavigate, useParams } from 'react-router-dom';
import LandingPage from './LandingPage';
import VideoCall from './VideoCall';

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/:sessionId" element={<VideoCallWrapper />} />
      </Routes>
    </Router>
  );
}

function VideoCallWrapper() {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const [sessionCode, setSessionCode] = useState(sessionId);
  const [inCall, setInCall] = useState(true);

  const handleEndCall = () => {
    setSessionCode('');
    setInCall(false);
    navigate('/');
  };

  return <VideoCall sessionCode={sessionCode} onEndCall={handleEndCall} />;
}

export default App;
