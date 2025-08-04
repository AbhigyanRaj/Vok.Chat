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

  // Validate session ID format
  useEffect(() => {
    if (sessionId && !/^[A-Z0-9]{6}$/.test(sessionId)) {
      console.error('Invalid session ID format');
      navigate('/');
      return;
    }
    setSessionCode(sessionId);
  }, [sessionId, navigate]);

  const handleEndCall = () => {
    setSessionCode('');
    setInCall(false);
    navigate('/');
  };

  // Show loading or error state if session code is invalid
  if (!sessionCode || !/^[A-Z0-9]{6}$/.test(sessionCode)) {
    return (
      <div className="min-h-screen w-full bg-black flex flex-col justify-center items-center font-sans text-white">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-4">Invalid Session</h1>
          <p className="text-gray-400 mb-6">The session code is invalid or has expired.</p>
          <button
            onClick={() => navigate('/')}
            className="px-6 py-3 bg-white text-black font-bold rounded-full hover:bg-gray-200 transition"
          >
            Go Home
          </button>
        </div>
      </div>
    );
  }

  return <VideoCall sessionCode={sessionCode} onEndCall={handleEndCall} />;
}

export default App;
