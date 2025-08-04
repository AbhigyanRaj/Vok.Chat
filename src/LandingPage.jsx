import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

function generateSessionCode() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

function LandingPage() {
  const [inputCode, setInputCode] = useState('');
  const navigate = useNavigate();

  const handleStartCall = () => {
    const code = generateSessionCode();
    navigate(`/${code}`);
  };

  const handleJoinCall = () => {
    if (inputCode.trim()) {
      navigate(`/${inputCode.trim().toUpperCase()}`);
    }
  };

  return (
    <div className="min-h-screen w-full bg-black flex flex-col justify-center items-center font-sans text-white px-2">
      <div className="w-full flex flex-col justify-center items-center flex-1">
        <h1 className="text-center mb-4 leading-tight font-black" style={{ fontFamily: 'Monument Extended, sans-serif' }}>
          <span className="block text-3xl sm:text-5xl md:text-6xl lg:text-7xl xl:text-8xl tracking-tight">Connect. Share. Heal.</span>
        </h1>
        <div className="text-base sm:text-lg text-center font-sans font-normal opacity-80 mb-8 w-full sm:max-w-md mx-auto px-2">
          Your Thoughts, Fully Protected. End-to-End Encrypted.
        </div>
        <button
          className="mb-10 w-full sm:w-auto px-4 py-2 sm:px-6 sm:py-2 bg-white text-black font-bold text-base sm:text-lg rounded-full shadow hover:bg-gray-200 transition font-monument"
          onClick={handleStartCall}
        >
          Start a Call
        </button>
        <div className="w-full flex flex-row items-center justify-center gap-2 sm:gap-4 max-w-xs sm:max-w-lg mx-auto mb-6">
          <input
            className="flex-1 px-4 py-2 sm:px-6 sm:py-2 rounded-full text-white text-base sm:text-lg bg-black border border-white/20 focus:border-white outline-none text-center font-sans min-w-0"
            placeholder="Enter Session Code"
            value={inputCode}
            onChange={e => setInputCode(e.target.value.toUpperCase())}
            onKeyDown={e => e.key === 'Enter' && handleJoinCall()}
          />
          <button
            className="px-4 py-2 sm:px-6 sm:py-2 bg-white text-black font-bold text-base sm:text-lg rounded-full shadow hover:bg-gray-200 transition font-monument"
            onClick={handleJoinCall}
            disabled={!inputCode.trim()}
          >
            Join Call
          </button>
        </div>
      </div>
      <div className="w-full flex justify-between text-xs mt-8 px-4 opacity-40 font-sans max-w-xs sm:max-w-2xl mx-auto mb-10">
        <span>Confidential</span>
        <span>Supportive</span>
        <span>Empowering</span>
      </div>
      <div className="text-xs opacity-30 text-center mb-4">
        Made by Abhigyan • IIIT Delhi
      </div>
    </div>
  );
}

export default LandingPage; 