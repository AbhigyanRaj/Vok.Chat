import { useState } from 'react';
import LandingPage from './LandingPage';
import VideoCall from './VideoCall';

function App() {
  const [sessionCode, setSessionCode] = useState('');
  const [inCall, setInCall] = useState(false);

  const handleStartCall = (code) => {
    setSessionCode(code);
    setInCall(true);
  };

  const handleJoinCall = (code) => {
    setSessionCode(code);
    setInCall(true);
  };

  const handleEndCall = () => {
    setSessionCode('');
    setInCall(false);
  };

  if (inCall) {
    return <VideoCall sessionCode={sessionCode} onEndCall={handleEndCall} />;
  }

  return <LandingPage onStartCall={handleStartCall} onJoinCall={handleJoinCall} />;
}

export default App;
