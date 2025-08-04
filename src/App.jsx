import { useState, useRef, useEffect } from 'react';
import { io } from 'socket.io-client';
import { FiMic, FiMicOff, FiVideo, FiVideoOff, FiPhoneOff, FiCopy, FiCheck, FiRotateCw } from 'react-icons/fi';
import { getIceServers } from './turnConfig';

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
  const [connectionQuality, setConnectionQuality] = useState('unknown');
  const connectionQualityIntervalRef = useRef(null);
  const [videoQuality, setVideoQuality] = useState('high'); // 'high', 'medium', 'low'
  const [showQualityNotification, setShowQualityNotification] = useState(false);
  const [qualityNotificationMessage, setQualityNotificationMessage] = useState('');
  const qualityNotificationTimeoutRef = useRef(null);

  // Optimized ICE servers with multiple STUN and TURN servers for better connectivity
  const iceServers = getIceServers(true); // Enable TURN servers for better connectivity

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

  // Get user media and show local video with optimized constraints
  useEffect(() => {
    if (joined) {
      const mediaConstraints = {
        video: {
          width: { ideal: 1280, max: 1920 },
          height: { ideal: 720, max: 1080 },
          frameRate: { ideal: 30, max: 30 },
          // Optimize for low latency
          latency: { ideal: 0.1 },
          // Enable hardware acceleration
          deviceId: undefined,
        },
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: { ideal: 48000 },
          channelCount: { ideal: 1 },
        }
      };

      navigator.mediaDevices.getUserMedia(mediaConstraints)
        .then(stream => {
          localStreamRef.current = stream;
          if (localVideoRef.current) {
            localVideoRef.current.srcObject = stream;
            // Optimize video playback
            localVideoRef.current.autoplay = true;
            localVideoRef.current.playsInline = true;
            localVideoRef.current.muted = true; // Always mute local video
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
          // Fallback to basic constraints
          navigator.mediaDevices.getUserMedia({ video: true, audio: true })
            .then(stream => {
              localStreamRef.current = stream;
              if (localVideoRef.current) {
                localVideoRef.current.srcObject = stream;
                localVideoRef.current.autoplay = true;
                localVideoRef.current.playsInline = true;
                localVideoRef.current.muted = true;
              }
              if (pendingOfferRef.current) {
                const { from, offer } = pendingOfferRef.current;
                pendingOfferRef.current = null;
                handleOffer(from, offer);
              }
            })
            .catch(fallbackErr => {
              console.error('Fallback media access failed:', fallbackErr);
            });
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
    
    // Create peer connection with optimized settings
    peerConnectionRef.current = new window.RTCPeerConnection({
      ...iceServers,
      // Optimize for low latency
      iceTransportPolicy: 'all',
      bundlePolicy: 'max-bundle',
      rtcpMuxPolicy: 'require',
      // Optimize connection establishment
      iceCandidatePoolSize: 10,
    });
    
    setPeerConnected(true);
    
    // Add local tracks with optimized constraints
    localStreamRef.current.getTracks().forEach(track => {
      const sender = peerConnectionRef.current.addTrack(track, localStreamRef.current);
      if (track.kind === 'video') {
        videoSenderRef.current = sender;
        // Optimize video encoding for low latency
        if (sender.getParameters) {
          const params = sender.getParameters();
          if (params.encodings) {
            params.encodings.forEach(encoding => {
              encoding.maxBitrate = 1000000; // 1 Mbps max
              encoding.maxFramerate = 30;
              encoding.scaleResolutionDownBy = 1;
            });
            sender.setParameters(params).catch(console.error);
          }
        }
      }
    });
    
    // Optimize ICE gathering
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
        // Optimize video playback for low latency
        remoteVideoRef.current.autoplay = true;
        remoteVideoRef.current.playsInline = true;
      }
    };
    
    peerConnectionRef.current.onconnectionstatechange = () => {
      console.log('[PEER] Connection state:', peerConnectionRef.current.connectionState);
      if (peerConnectionRef.current.connectionState === 'disconnected' || peerConnectionRef.current.connectionState === 'closed') {
        setPeerConnected(false);
        if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
      }
    };
    
    // Monitor ICE connection state for better debugging
    peerConnectionRef.current.oniceconnectionstatechange = () => {
      console.log('[PEER] ICE connection state:', peerConnectionRef.current.iceConnectionState);
      
      // Monitor connection quality
      if (peerConnectionRef.current.iceConnectionState === 'connected' || 
          peerConnectionRef.current.iceConnectionState === 'completed') {
        startConnectionQualityMonitoring();
      } else {
        stopConnectionQualityMonitoring();
        setConnectionQuality('unknown');
      }
    };
  }

  // Monitor connection quality and adapt video quality
  function startConnectionQualityMonitoring() {
    if (connectionQualityIntervalRef.current) return;
    
    connectionQualityIntervalRef.current = setInterval(() => {
      if (!peerConnectionRef.current) return;
      
      const stats = peerConnectionRef.current.getStats();
      stats.then(results => {
        let totalRtt = 0;
        let rttCount = 0;
        let totalJitter = 0;
        let jitterCount = 0;
        let packetLoss = 0;
        let packetLossCount = 0;
        
        results.forEach(report => {
          if (report.type === 'inbound-rtp' && report.mediaType === 'video') {
            if (report.roundTripTime) {
              totalRtt += report.roundTripTime;
              rttCount++;
            }
            if (report.jitter) {
              totalJitter += report.jitter;
              jitterCount++;
            }
            if (report.packetsLost !== undefined) {
              packetLoss += report.packetsLost;
              packetLossCount++;
            }
          }
        });
        
        const avgRtt = rttCount > 0 ? totalRtt / rttCount : 0;
        const avgJitter = jitterCount > 0 ? totalJitter / jitterCount : 0;
        const avgPacketLoss = packetLossCount > 0 ? packetLoss / packetLossCount : 0;
        
        // Determine connection quality
        let newQuality = 'unknown';
        if (avgRtt < 100 && avgJitter < 0.01 && avgPacketLoss < 0.01) {
          newQuality = 'excellent';
        } else if (avgRtt < 200 && avgJitter < 0.02 && avgPacketLoss < 0.05) {
          newQuality = 'good';
        } else if (avgRtt < 500 && avgJitter < 0.05 && avgPacketLoss < 0.1) {
          newQuality = 'fair';
        } else {
          newQuality = 'poor';
        }
        
        setConnectionQuality(newQuality);
        
        // Adapt video quality based on connection
        adaptVideoQuality(newQuality, avgRtt, avgJitter, avgPacketLoss);
      });
    }, 2000); // Check every 2 seconds
  }

  // Adapt video quality based on connection strength
  function adaptVideoQuality(quality, rtt, jitter, packetLoss) {
    let newVideoQuality = videoQuality;
    let notificationMessage = '';
    
    if (quality === 'poor' && videoQuality !== 'low') {
      newVideoQuality = 'low';
      notificationMessage = 'Poor connection detected. Switching to low quality for better performance.';
    } else if (quality === 'fair' && videoQuality === 'high') {
      newVideoQuality = 'medium';
      notificationMessage = 'Connection is fair. Switching to medium quality.';
    } else if (quality === 'good' && videoQuality === 'low') {
      newVideoQuality = 'medium';
      notificationMessage = 'Connection improved. Switching to medium quality.';
    } else if (quality === 'excellent' && videoQuality !== 'high') {
      newVideoQuality = 'high';
      notificationMessage = 'Excellent connection! Switching to high quality.';
    }
    
    if (newVideoQuality !== videoQuality) {
      setVideoQuality(newVideoQuality);
      setQualityNotificationMessage(notificationMessage);
      setShowQualityNotification(true);
      
      // Hide notification after 3 seconds
      if (qualityNotificationTimeoutRef.current) {
        clearTimeout(qualityNotificationTimeoutRef.current);
      }
      qualityNotificationTimeoutRef.current = setTimeout(() => {
        setShowQualityNotification(false);
      }, 3000);
      
      // Apply new video quality settings
      applyVideoQualitySettings(newVideoQuality);
    }
  }

  // Apply video quality settings
  function applyVideoQualitySettings(quality) {
    if (!peerConnectionRef.current || !videoSenderRef.current) return;
    
    try {
      const params = videoSenderRef.current.getParameters();
      if (params.encodings) {
        params.encodings.forEach(encoding => {
          switch (quality) {
            case 'high':
              encoding.maxBitrate = 1000000; // 1 Mbps
              encoding.maxFramerate = 30;
              encoding.scaleResolutionDownBy = 1;
              break;
            case 'medium':
              encoding.maxBitrate = 500000; // 500 Kbps
              encoding.maxFramerate = 20;
              encoding.scaleResolutionDownBy = 1.5;
              break;
            case 'low':
              encoding.maxBitrate = 200000; // 200 Kbps
              encoding.maxFramerate = 15;
              encoding.scaleResolutionDownBy = 2;
              break;
          }
        });
        videoSenderRef.current.setParameters(params).catch(console.error);
        console.log(`[VIDEO] Quality set to ${quality}`);
      }
    } catch (error) {
      console.error('Error applying video quality settings:', error);
    }
  }

  // Initialize video quality when peer connection is established
  useEffect(() => {
    if (peerConnectionRef.current && videoSenderRef.current && connectionQuality !== 'unknown') {
      // Start with medium quality for better initial connection
      if (videoQuality === 'high' && connectionQuality === 'poor') {
        setVideoQuality('medium');
        applyVideoQualitySettings('medium');
      }
    }
  }, [peerConnectionRef.current, videoSenderRef.current, connectionQuality]);

  function stopConnectionQualityMonitoring() {
    if (connectionQualityIntervalRef.current) {
      clearInterval(connectionQualityIntervalRef.current);
      connectionQualityIntervalRef.current = null;
    }
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
      if (qualityNotificationTimeoutRef.current) {
        clearTimeout(qualityNotificationTimeoutRef.current);
      }
      stopConnectionQualityMonitoring();
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
      <div className="min-h-screen w-full bg-black flex flex-col justify-center items-center font-sans text-white px-4 sm:px-6 lg:px-8">
        <div className="w-full max-w-4xl mx-auto flex flex-col justify-center items-center flex-1">
          {/* Hero Section */}
          <div className="text-center mb-8 lg:mb-12">
            <h1 className="text-center mb-6 leading-tight font-black" style={{ fontFamily: 'Monument Extended, sans-serif' }}>
              <span className="block text-4xl sm:text-5xl md:text-6xl lg:text-7xl xl:text-8xl tracking-tight">Connect. Share. Heal.</span>
            </h1>
            <div className="text-base sm:text-lg lg:text-xl text-center font-sans font-normal opacity-80 mb-8 lg:mb-12 max-w-2xl mx-auto">
              Your Thoughts, Fully Protected. End-to-End Encrypted.
            </div>
          </div>

          {/* Action Buttons */}
          <div className="w-full max-w-md mx-auto space-y-6">
            <button
              className="w-full px-6 py-4 bg-white text-black font-bold text-lg sm:text-xl rounded-full shadow-lg hover:bg-gray-100 transition-all duration-200 transform hover:scale-105 font-monument"
              onClick={() => {
                const code = generateSessionCode();
                setSessionCode(code);
                setInSession(true);
                setJoined(true);
              }}
            >
              Start a Call
            </button>
            
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-white/20"></div>
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-4 bg-black text-white/60">or join existing call</span>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-3">
              <input
                className="flex-1 px-4 py-3 sm:py-4 rounded-full text-white text-base sm:text-lg bg-black/50 border border-white/20 focus:border-white focus:bg-black/70 outline-none text-center font-sans transition-all duration-200 backdrop-blur-sm"
                placeholder="Enter Session Code"
                value={inputCode}
                onChange={e => setInputCode(e.target.value.toUpperCase())}
                onKeyDown={e => e.key === 'Enter' && inputCode.trim() && (() => { setSessionCode(inputCode.trim()); setInSession(true); setJoined(true); })()}
              />
              <button
                className="px-6 py-3 sm:py-4 bg-white text-black font-bold text-base sm:text-lg rounded-full shadow-lg hover:bg-gray-100 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                onClick={() => { setSessionCode(inputCode.trim()); setInSession(true); setJoined(true); }}
                disabled={!inputCode.trim()}
              >
                Join Call
              </button>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="w-full flex justify-between text-xs sm:text-sm mt-8 lg:mt-12 px-4 opacity-40 font-sans max-w-2xl mx-auto mb-8 lg:mb-12">
          <span className="px-2">Confidential</span>
          <span className="px-2">Supportive</span>
          <span className="px-2">Empowering</span>
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
    <div className="min-h-screen w-full bg-black flex flex-col font-sans text-white relative">
      {/* Top Header - Session Info */}
      <div className="w-full px-4 py-3 bg-black/50 backdrop-blur-sm border-b border-white/10 z-10">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3">
          {/* Session Code */}
          <div className="flex items-center gap-3">
            <span className="text-sm opacity-70">Session:</span>
            <div className="flex items-center gap-2 bg-black/30 px-3 py-1.5 rounded-lg border border-white/10">
              <span className="font-mono font-bold text-sm tracking-wider">{sessionCode}</span>
              <button
                className="p-1 rounded hover:bg-white/10 transition focus:outline-none"
                onClick={() => {
                  navigator.clipboard.writeText(sessionCode);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1200);
                }}
                title="Copy code"
              >
                {copied ? <FiCheck className="text-green-400" size={16} /> : <FiCopy className="opacity-60" size={16} />}
              </button>
            </div>
          </div>

          {/* Connection Status */}
          {peerConnected && connectionQuality !== 'unknown' && (
            <div className="flex items-center gap-3 text-xs">
              <div className="flex items-center gap-1">
                <span className="opacity-70">Connection:</span>
                <span className={`px-2 py-0.5 rounded-full font-medium ${
                  connectionQuality === 'excellent' ? 'bg-green-500/20 text-green-400' :
                  connectionQuality === 'good' ? 'bg-blue-500/20 text-blue-400' :
                  connectionQuality === 'fair' ? 'bg-yellow-500/20 text-yellow-400' :
                  'bg-red-500/20 text-red-400'
                }`}>
                  {connectionQuality.charAt(0).toUpperCase() + connectionQuality.slice(1)}
                </span>
              </div>
              <div className="flex items-center gap-1">
                <span className="opacity-70">Quality:</span>
                <span className={`px-2 py-0.5 rounded-full font-medium ${
                  videoQuality === 'high' ? 'bg-green-500/20 text-green-400' :
                  videoQuality === 'medium' ? 'bg-yellow-500/20 text-yellow-400' :
                  'bg-red-500/20 text-red-400'
                }`}>
                  {videoQuality.charAt(0).toUpperCase() + videoQuality.slice(1)}
                </span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Main Video Area */}
      <div className="flex-1 flex flex-col lg:flex-row w-full max-w-7xl mx-auto p-4 lg:p-6">
        {/* Primary Video (Remote) */}
        <div className="flex-1 flex flex-col lg:flex-row gap-4 lg:gap-6 h-full">
          {/* Remote Video - Large */}
          <div className="flex-1 relative rounded-2xl shadow-2xl border border-white/10 bg-[#181818] overflow-hidden min-h-[300px] lg:min-h-[500px]">
            {(!peerVideoPaused) ? (
              <video
                ref={remoteVideoRef}
                autoPlay
                playsInline
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center text-gray-400">
                <FiVideoOff size={64} className="mb-4 opacity-50" />
                <span className="text-lg font-medium">Video Paused</span>
              </div>
            )}
            
            {/* Peer Status Overlays */}
            {peerMuted && (
              <div className="absolute top-4 left-4 bg-black/70 rounded-full p-2">
                <FiMicOff size={20} className="text-red-400" />
              </div>
            )}
            {peerVideoPaused && (
              <div className="absolute top-4 right-4 bg-black/70 rounded-full p-2">
                <FiVideoOff size={20} className="text-yellow-400" />
              </div>
            )}
            
            {/* Peer Name */}
            <div className="absolute bottom-4 left-4 bg-black/50 backdrop-blur-sm px-3 py-1.5 rounded-lg">
              <span className="text-sm font-medium">Peer</span>
            </div>
          </div>

          {/* Local Video - Small */}
          <div className="w-full lg:w-80 h-48 lg:h-auto lg:flex-shrink-0">
            <div className="relative rounded-xl shadow-xl border border-white/10 bg-[#181818] overflow-hidden w-full h-full">
              {(!videoPaused) ? (
                <video
                  ref={localVideoRef}
                  autoPlay
                  muted
                  playsInline
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center text-gray-400">
                  <FiVideoOff size={32} className="mb-2 opacity-50" />
                  <span className="text-sm font-medium">Video Paused</span>
                </div>
              )}
              
              {/* Local Status Overlays */}
              {isMuted && (
                <div className="absolute top-2 left-2 bg-black/70 rounded-full p-1.5">
                  <FiMicOff size={16} className="text-red-400" />
                </div>
              )}
              {videoPaused && (
                <div className="absolute top-2 right-2 bg-black/70 rounded-full p-1.5">
                  <FiVideoOff size={16} className="text-yellow-400" />
                </div>
              )}
              
              {/* Local Name */}
              <div className="absolute bottom-2 left-2 bg-black/50 backdrop-blur-sm px-2 py-1 rounded text-xs">
                <span className="font-medium">You</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Control Bar */}
      <div className="w-full bg-black/50 backdrop-blur-sm border-t border-white/10 px-4 py-4 lg:py-6">
        <div className="max-w-4xl mx-auto flex flex-wrap justify-center items-center gap-3 lg:gap-4">
          {/* Mute Button */}
          <button
            className="flex items-center justify-center w-14 h-14 lg:w-16 lg:h-16 rounded-full bg-white/10 hover:bg-white/20 text-white shadow-lg focus:outline-none focus:ring-2 focus:ring-blue-400 transition-all duration-200"
            onClick={() => setIsMuted(m => !m)}
            title={isMuted ? 'Unmute microphone' : 'Mute microphone'}
          >
            {isMuted ? <FiMicOff size={24} className="lg:w-8 lg:h-8" /> : <FiMic size={24} className="lg:w-8 lg:h-8" />}
          </button>

          {/* Video Toggle */}
          <button
            className="flex items-center justify-center w-14 h-14 lg:w-16 lg:h-16 rounded-full bg-white/10 hover:bg-white/20 text-white shadow-lg focus:outline-none focus:ring-2 focus:ring-blue-400 transition-all duration-200"
            onClick={() => setVideoPaused((v) => !v)}
            title={videoPaused ? 'Resume video' : 'Pause video'}
          >
            {videoPaused ? <FiVideoOff size={24} className="lg:w-8 lg:h-8" /> : <FiVideo size={24} className="lg:w-8 lg:h-8" />}
          </button>

          {/* Camera Rotate */}
          <button
            className="flex items-center justify-center w-14 h-14 lg:w-16 lg:h-16 rounded-full bg-white/10 hover:bg-white/20 text-white shadow-lg focus:outline-none focus:ring-2 focus:ring-blue-400 transition-all duration-200"
            onClick={rotateCamera}
            title="Rotate camera"
          >
            <FiRotateCw size={24} className="lg:w-8 lg:h-8" />
          </button>

          {/* Quality Toggle */}
          <button
            className="flex items-center justify-center w-14 h-14 lg:w-16 lg:h-16 rounded-full bg-white/10 hover:bg-white/20 text-white shadow-lg focus:outline-none focus:ring-2 focus:ring-blue-400 transition-all duration-200"
            onClick={() => {
              const qualities = ['low', 'medium', 'high'];
              const currentIndex = qualities.indexOf(videoQuality);
              const nextQuality = qualities[(currentIndex + 1) % qualities.length];
              setVideoQuality(nextQuality);
              applyVideoQualitySettings(nextQuality);
              setQualityNotificationMessage(`Manually switched to ${nextQuality} quality.`);
              setShowQualityNotification(true);
              if (qualityNotificationTimeoutRef.current) {
                clearTimeout(qualityNotificationTimeoutRef.current);
              }
              qualityNotificationTimeoutRef.current = setTimeout(() => {
                setShowQualityNotification(false);
              }, 2000);
            }}
            title={`Current: ${videoQuality} quality. Click to cycle.`}
          >
            <div className="text-center">
              <div className="text-xs font-bold">{videoQuality.toUpperCase()}</div>
              <div className="text-xs opacity-70">QUALITY</div>
            </div>
          </button>

          {/* End Call */}
          <button
            className="flex items-center justify-center w-14 h-14 lg:w-16 lg:h-16 rounded-full bg-red-600 hover:bg-red-700 text-white shadow-lg focus:outline-none focus:ring-2 focus:ring-red-400 transition-all duration-200"
            onClick={handleEndCall}
            title="End call"
          >
            <FiPhoneOff size={24} className="lg:w-8 lg:h-8" />
          </button>
        </div>
      </div>

      {/* Notifications */}
      {showLeaveMessage && (
        <div className="fixed top-4 left-1/2 transform -translate-x-1/2 z-50 bg-black/90 text-white px-6 py-3 rounded-lg border border-white/20 shadow-lg backdrop-blur-sm">
          <span className="text-sm font-medium">{showLeaveMessage}</span>
        </div>
      )}

      {showQualityNotification && (
        <div className="fixed top-16 left-1/2 transform -translate-x-1/2 z-50 bg-blue-600/90 text-white px-6 py-3 rounded-lg border border-blue-400/20 shadow-lg backdrop-blur-sm max-w-sm text-center">
          <span className="text-sm font-medium">{qualityNotificationMessage}</span>
        </div>
      )}
    </div>
  );
}

export default App;
