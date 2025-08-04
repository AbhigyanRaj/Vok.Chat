import { useState, useRef, useEffect } from 'react';
import { io } from 'socket.io-client';
import { FiMic, FiMicOff, FiVideo, FiVideoOff, FiPhoneOff, FiCopy, FiCheck, FiRotateCw } from 'react-icons/fi';

const SOCKET_URL = import.meta.env.VITE_BACKEND_URL || 
  (import.meta.env.PROD ? 'https://vok-chat.onrender.com' : 'ws://localhost:5001');

function generateSessionCode() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

function App() {
  const [inSession, setInSession] = useState(false);
  const [sessionCode, setSessionCode] = useState('');
  const [inputCode, setInputCode] = useState('');
  const [joined, setJoined] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const socketRef = useRef(null);
  const localStreamRef = useRef(null);
  const peerConnectionRef = useRef(null);
  const [peerConnected, setPeerConnected] = useState(false);
  const pendingOfferRef = useRef(null);
  const [sessionError, setSessionError] = useState('');
  const [videoPaused, setVideoPaused] = useState(false);
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const [peerVideoPaused, setPeerVideoPaused] = useState(false);
  const [peerMuted, setPeerMuted] = useState(false);
  const videoSenderRef = useRef(null);
  const [copied, setCopied] = useState(false);
  const [cameraFacing, setCameraFacing] = useState('user'); // 'user' or 'environment'
  const [showLeaveMessage, setShowLeaveMessage] = useState('');
  const [leaveMessageTimeout, setLeaveMessageTimeout] = useState(null);

  // ICE servers for STUN (public Google STUN)
  const iceServers = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
    ],
  };

  // Connect to backend and handle room join
  useEffect(() => {
    if (joined && sessionCode) {
      setSessionError('');
      console.log('Connecting to backend at:', SOCKET_URL);
      socketRef.current = io(SOCKET_URL, { transports: ['websocket'] });
      socketRef.current.on('connect', () => {
        console.log('Socket connected:', socketRef.current.id);
        socketRef.current.emit('join', sessionCode);
      });
      socketRef.current.on('session-error', (err) => {
        setSessionError(err.message || 'Session error');
        setInSession(false);
        setJoined(false);
        setSessionCode('');
        setInputCode('');
      });
      socketRef.current.on('connect_error', (err) => {
        console.error('Socket connection error:', err);
      });
      socketRef.current.on('disconnect', (reason) => {
        console.warn('Socket disconnected:', reason);
      });

      // --- WebRTC signaling handlers ---
      socketRef.current.on('user-joined', async (peerId) => {
        console.log('[SIGNAL] user-joined', peerId);
        if (peerConnectionRef.current || !localStreamRef.current) {
          console.log('[SIGNAL] Not ready to create offer (peerConnection or localStream missing)');
          return;
        }
        await createPeerConnection();
        setTimeout(async () => {
          if (!peerConnectionRef.current) return;
          const offer = await peerConnectionRef.current.createOffer();
          await peerConnectionRef.current.setLocalDescription(offer);
          console.log('[SIGNAL] Sending offer', offer);
          socketRef.current.emit('offer', { roomId: sessionCode, offer, to: peerId });
        }, 100);
      });

      socketRef.current.on('offer', async ({ from, offer }) => {
        console.log('[SIGNAL] Received offer', offer);
        if (!localStreamRef.current) {
          console.log('[SIGNAL] Local stream not ready, buffering offer');
          pendingOfferRef.current = { from, offer };
          return;
        }
        await handleOffer(from, offer);
      });

      socketRef.current.on('answer', async ({ from, answer }) => {
        console.log('[SIGNAL] Received answer', answer);
        if (!peerConnectionRef.current) await createPeerConnection();
        if (!peerConnectionRef.current) return;
        await peerConnectionRef.current.setRemoteDescription(new window.RTCSessionDescription(answer));
      });

      socketRef.current.on('ice-candidate', async ({ from, candidate }) => {
        console.log('[SIGNAL] Received ICE candidate', candidate);
        try {
          await peerConnectionRef.current.addIceCandidate(new window.RTCIceCandidate(candidate));
        } catch (err) {
          console.error('Error adding received ice candidate', err);
        }
      });

      socketRef.current.on('user-left', (data) => {
        console.log('[SIGNAL] user-left', data);
        setPeerConnected(false);
        if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
        if (peerConnectionRef.current) {
          peerConnectionRef.current.close();
          peerConnectionRef.current = null;
        }
        
        // Show leave message
        const message = data?.message || 'Peer left the room';
        setShowLeaveMessage(message);
        
        // Clear previous timeout
        if (leaveMessageTimeout) {
          clearTimeout(leaveMessageTimeout);
        }
        
        // Hide message after 3 seconds
        const timeout = setTimeout(() => {
          setShowLeaveMessage('');
        }, 3000);
        setLeaveMessageTimeout(timeout);
      });

      return () => {
        socketRef.current.disconnect();
      };
    }
  }, [joined, sessionCode]);

  async function handleOffer(from, offer) {
    if (!peerConnectionRef.current) await createPeerConnection();
    if (!peerConnectionRef.current) return;
    await peerConnectionRef.current.setRemoteDescription(new window.RTCSessionDescription(offer));
    const answer = await peerConnectionRef.current.createAnswer();
    await peerConnectionRef.current.setLocalDescription(answer);
    console.log('[SIGNAL] Sending answer', answer);
    socketRef.current.emit('answer', { roomId: sessionCode, answer, to: from });
  }

  // Get user media and show local video
  useEffect(() => {
    if (joined) {
      navigator.mediaDevices.getUserMedia({ video: true, audio: true })
        .then(stream => {
          localStreamRef.current = stream;
          if (localVideoRef.current) {
            localVideoRef.current.srcObject = stream;
          }
          // Process any pending offer immediately after local stream is ready
          if (pendingOfferRef.current) {
            const { from, offer } = pendingOfferRef.current;
            pendingOfferRef.current = null;
            handleOffer(from, offer);
          }
        })
        .catch(err => {
          console.error('Error accessing media devices.', err);
        });
    } else {
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(track => track.stop());
        localStreamRef.current = null;
      }
    }
  }, [joined]);

  async function createPeerConnection() {
    if (!localStreamRef.current) {
      console.log('[PEER] Waiting for local stream...');
      setTimeout(createPeerConnection, 100);
      return;
    }
    peerConnectionRef.current = new window.RTCPeerConnection(iceServers);
    setPeerConnected(true);
    // Add local tracks
    localStreamRef.current.getTracks().forEach(track => {
      const sender = peerConnectionRef.current.addTrack(track, localStreamRef.current);
      if (track.kind === 'video') {
        videoSenderRef.current = sender;
      }
    });
    peerConnectionRef.current.onicecandidate = (event) => {
      if (event.candidate) {
        console.log('[PEER] Sending ICE candidate', event.candidate);
        socketRef.current.emit('ice-candidate', {
          roomId: sessionCode,
          candidate: event.candidate,
          to: null,
        });
      }
    };
    peerConnectionRef.current.ontrack = (event) => {
      console.log('[PEER] Received remote track', event.streams[0]);
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = event.streams[0];
      }
    };
    peerConnectionRef.current.onconnectionstatechange = () => {
      console.log('[PEER] Connection state:', peerConnectionRef.current.connectionState);
      if (peerConnectionRef.current.connectionState === 'disconnected' || peerConnectionRef.current.connectionState === 'closed') {
        setPeerConnected(false);
        if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
      }
    };
  }

  useEffect(() => {
    if (localStreamRef.current) {
      localStreamRef.current.getAudioTracks().forEach(track => {
        track.enabled = !isMuted;
      });
    }
  }, [isMuted]);

  // Send pause/mute state to peer
  useEffect(() => {
    if (socketRef.current && joined) {
      socketRef.current.emit('media-state', {
        videoPaused,
        muted: isMuted,
        roomId: sessionCode,
      });
    }
  }, [videoPaused, isMuted, joined, sessionCode]);

  // Listen for peer's media state
  useEffect(() => {
    if (socketRef.current && joined) {
      socketRef.current.on('media-state', (state) => {
        setPeerVideoPaused(!!state.videoPaused);
        setPeerMuted(!!state.muted);
      });
    }
  }, [joined]);

  // Pause video track for peer, and replaceTrack on resume
  useEffect(() => {
    if (localStreamRef.current) {
      const videoTrack = localStreamRef.current.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoPaused;
        if (!videoPaused && videoSenderRef.current) {
          videoSenderRef.current.replaceTrack(videoTrack);
        }
      }
      localStreamRef.current.getAudioTracks().forEach(track => {
        track.enabled = !isMuted;
      });
    }
  }, [videoPaused, isMuted]);

  // Ensure local video element always shows the stream after pause/resume
  useEffect(() => {
    if (localVideoRef.current && localStreamRef.current) {
      if (!videoPaused) {
        // If the video track is stopped, reacquire the stream
        const videoTrack = localStreamRef.current.getVideoTracks()[0];
        if (!videoTrack || videoTrack.readyState === 'ended') {
          navigator.mediaDevices.getUserMedia({ video: true, audio: true })
            .then(stream => {
              // Replace the video track in the peer connection
              const newVideoTrack = stream.getVideoTracks()[0];
              if (videoSenderRef.current && newVideoTrack) {
                videoSenderRef.current.replaceTrack(newVideoTrack);
              }
              // Replace the track in the local stream
              localStreamRef.current.removeTrack(videoTrack);
              localStreamRef.current.addTrack(newVideoTrack);
              localVideoRef.current.srcObject = localStreamRef.current;
            });
        } else {
          localVideoRef.current.srcObject = localStreamRef.current;
        }
      }
    }
  }, [videoPaused]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (leaveMessageTimeout) {
        clearTimeout(leaveMessageTimeout);
      }
    };
  }, [leaveMessageTimeout]);

  // Camera rotation function
  async function rotateCamera() {
    if (!localStreamRef.current) return;
    
    try {
      // Stop current video track
      const currentVideoTrack = localStreamRef.current.getVideoTracks()[0];
      if (currentVideoTrack) {
        currentVideoTrack.stop();
      }
      
      // Switch camera facing mode
      const newFacingMode = cameraFacing === 'user' ? 'environment' : 'user';
      setCameraFacing(newFacingMode);
      
      // Get new video stream with different camera
      const newStream = await navigator.mediaDevices.getUserMedia({
        video: { 
          facingMode: newFacingMode,
          width: { ideal: 1280 },
          height: { ideal: 720 }
        },
        audio: true
      });
      
      // Replace video track in local stream
      const newVideoTrack = newStream.getVideoTracks()[0];
      const oldVideoTrack = localStreamRef.current.getVideoTracks()[0];
      
      if (oldVideoTrack) {
        localStreamRef.current.removeTrack(oldVideoTrack);
      }
      localStreamRef.current.addTrack(newVideoTrack);
      
      // Update local video element
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = localStreamRef.current;
      }
      
      // Update peer connection if connected
      if (peerConnectionRef.current && videoSenderRef.current) {
        videoSenderRef.current.replaceTrack(newVideoTrack);
      }
      
      // Stop the temporary stream
      newStream.getTracks().forEach(track => {
        if (track !== newVideoTrack) track.stop();
      });
      
      console.log(`Camera rotated to ${newFacingMode} mode`);
    } catch (error) {
      console.error('Error rotating camera:', error);
      // Fallback: try to get any available camera
      try {
        const fallbackStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        const newVideoTrack = fallbackStream.getVideoTracks()[0];
        const oldVideoTrack = localStreamRef.current.getVideoTracks()[0];
        
        if (oldVideoTrack) {
          localStreamRef.current.removeTrack(oldVideoTrack);
        }
        localStreamRef.current.addTrack(newVideoTrack);
        
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = localStreamRef.current;
        }
        
        if (peerConnectionRef.current && videoSenderRef.current) {
          videoSenderRef.current.replaceTrack(newVideoTrack);
        }
        
        fallbackStream.getTracks().forEach(track => {
          if (track !== newVideoTrack) track.stop();
        });
      } catch (fallbackError) {
        console.error('Fallback camera rotation failed:', fallbackError);
      }
    }
  }

  function handleEndCall() {
    setInSession(false);
    setJoined(false);
    setSessionCode('');
    setInputCode('');
    setPeerConnected(false);
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => track.stop());
      localStreamRef.current = null;
    }
  }

  // UI for session code generation and joining
  if (!inSession) {
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
            // style={{ fontFamily: 'Monument Extended, sans-serif' }}
            onClick={() => {
              const code = generateSessionCode();
              setSessionCode(code);
              setInSession(true);
              setJoined(true);
            }}
          >
            Start a Call
          </button>
          <div className="w-full flex flex-row items-center justify-center gap-2 sm:gap-4 max-w-xs sm:max-w-lg mx-auto mb-6">
            <input
              className="flex-1 px-4 py-2 sm:px-6 sm:py-2 rounded-full text-white text-base sm:text-lg bg-black border border-white/20 focus:border-white outline-none text-center font-sans min-w-0"
              placeholder="Enter Session Code"
              value={inputCode}
              onChange={e => setInputCode(e.target.value.toUpperCase())}
              onKeyDown={e => e.key === 'Enter' && inputCode.trim() && (() => { setSessionCode(inputCode.trim()); setInSession(true); setJoined(true); })()}
            />
            <button
              className="px-4 py-2 sm:px-6 sm:py-2 bg-white text-black font-bold text-base sm:text-lg rounded-full shadow hover:bg-gray-200 transition font-monument"
              // style={{ fontFamily: 'Monument Extended, sans-serif' }}
              onClick={() => { setSessionCode(inputCode.trim()); setInSession(true); setJoined(true); }}
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
      </div>
    );
  }

  // Minimal participant list for 1:1
  const minimalParticipants = [
    {
      id: 'me',
      name: 'You',
      videoRef: localVideoRef,
      isMe: true,
      paused: videoPaused,
      muted: isMuted,
    },
    {
      id: 'peer',
      name: 'Peer',
      videoRef: remoteVideoRef,
      isMe: false,
      paused: peerVideoPaused,
      muted: peerMuted,
    },
  ];

  // Video call UI
  return (
    <div className="min-h-screen w-full bg-black flex flex-col justify-between items-center font-sans text-white">
      {/* Session code with copy icon */}
      <div className="flex-1 flex flex-col items-center justify-center w-full max-w-7xl mx-auto py-8">
        <div className="mb-8 text-center flex flex-col items-center">
          <span className="text-base opacity-70 flex items-center gap-2">
            Session Code:
            <span className="font-mono font-bold text-lg opacity-100 bg-black px-3 py-1 rounded-lg tracking-widest border border-white/10 flex items-center gap-2">
              {sessionCode}
              <button
                className="ml-2 p-1 rounded hover:bg-white/10 transition focus:outline-none"
                onClick={() => {
                  navigator.clipboard.writeText(sessionCode);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1200);
                }}
                title="Copy code"
                style={{ lineHeight: 0 }}
              >
                {copied ? <FiCheck className="text-green-400" size={18} /> : <FiCopy className="opacity-60" size={18} />}
              </button>
            </span>
          </span>
        </div>
        {/* Videos side-by-side (desktop) or stacked (mobile), maximized */}
        <div className="flex flex-col md:flex-row gap-8 w-full h-[60vh] md:h-[70vh] items-center justify-center">
          {minimalParticipants.map((p) => (
            <div key={p.id} className="flex flex-col items-center w-full md:w-1/2 h-full">
              <div className="relative rounded-2xl shadow-xl border border-white/10 bg-[#181818] overflow-hidden w-full h-full flex items-center justify-center min-h-[220px]">
                {/* Show video if not paused, else show placeholder */}
                {(!p.paused) ? (
                  <video
                    ref={p.videoRef}
                    autoPlay
                    muted={p.isMe}
                    playsInline
                    className={`w-full h-full object-cover transition-all duration-300`}
                    style={{ background: '#222', borderRadius: '1rem' }}
                  />
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center text-gray-400 text-lg font-bold">
                    <FiVideoOff size={48} className="mb-2" />
                    Video Paused
                  </div>
                )}
                {/* Minimal overlays for mute/pause (only for own tile) */}
                {p.isMe && isMuted && (
                  <div className="absolute top-3 left-3 bg-black/70 rounded-full p-2">
                    <FiMicOff size={20} className="text-red-400" />
                  </div>
                )}
                {p.isMe && videoPaused && (
                  <div className="absolute top-3 right-3 bg-black/70 rounded-full p-2">
                    <FiVideoOff size={20} className="text-yellow-400" />
                  </div>
                )}
                {/* Minimal overlays for peer mute/pause */}
                {!p.isMe && p.muted && (
                  <div className="absolute top-3 left-3 bg-black/70 rounded-full p-2">
                    <FiMicOff size={20} className="text-red-400" />
                  </div>
                )}
                {!p.isMe && p.paused && (
                  <div className="absolute top-3 right-3 bg-black/70 rounded-full p-2">
                    <FiVideoOff size={20} className="text-yellow-400" />
                  </div>
                )}
              </div>
              <span className="text-lg opacity-80 mt-3 tracking-wide font-semibold">{p.name}</span>
            </div>
          ))}
        </div>
      </div>
      {/* Leave message notification */}
      {showLeaveMessage && (
        <div className="fixed top-4 left-1/2 transform -translate-x-1/2 z-50 bg-black/80 text-white px-6 py-3 rounded-lg border border-white/20 shadow-lg">
          <span className="text-sm font-medium">{showLeaveMessage}</span>
        </div>
      )}

      {/* Simple control bar */}
      <div className="w-full flex justify-center items-center gap-6 py-8 bg-black border-t border-white/10">
        <button
          className="flex items-center justify-center w-16 h-16 rounded-full bg-white/10 hover:bg-white/20 text-white shadow-lg focus:outline-none focus:ring-2 focus:ring-blue-400 transition"
          onClick={() => setIsMuted(m => !m)}
          title={isMuted ? 'Unmute microphone' : 'Mute microphone'}
        >
          {isMuted ? <FiMicOff size={32} /> : <FiMic size={32} />}
        </button>
        <button
          className="flex items-center justify-center w-16 h-16 rounded-full bg-white/10 hover:bg-white/20 text-white shadow-lg focus:outline-none focus:ring-2 focus:ring-blue-400 transition"
          onClick={() => setVideoPaused((v) => !v)}
          title={videoPaused ? 'Resume video' : 'Pause video'}
        >
          {videoPaused ? <FiVideoOff size={32} /> : <FiVideo size={32} />}
        </button>
        <button
          className="flex items-center justify-center w-16 h-16 rounded-full bg-white/10 hover:bg-white/20 text-white shadow-lg focus:outline-none focus:ring-2 focus:ring-blue-400 transition"
          onClick={rotateCamera}
          title="Rotate camera"
        >
          <FiRotateCw size={32} />
        </button>
        <button
          className="flex items-center justify-center w-16 h-16 rounded-full bg-red-600 hover:bg-red-700 text-white shadow-lg focus:outline-none focus:ring-2 focus:ring-red-400 transition"
          onClick={handleEndCall}
          title="End call"
        >
          <FiPhoneOff size={32} />
        </button>
      </div>
    </div>
  );
}

export default App;
