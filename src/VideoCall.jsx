import { useState, useRef, useEffect } from 'react';
import { io } from 'socket.io-client';
import { FiMic, FiMicOff, FiVideo, FiVideoOff, FiPhoneOff, FiCopy, FiCheck, FiRotateCw, FiShare2 } from 'react-icons/fi';
import { getIceServers } from './turnConfig';

const SOCKET_URL = import.meta.env.VITE_BACKEND_URL || 
  (import.meta.env.PROD ? 'https://vok-chat.onrender.com' : 'ws://localhost:5001');

function VideoCall({ sessionCode, onEndCall }) {
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
  const [peerVideoPaused, setPeerVideoPaused] = useState(false);
  const [peerMuted, setPeerMuted] = useState(false);
  const videoSenderRef = useRef(null);
  const [copied, setCopied] = useState(false);
  const [cameraFacing, setCameraFacing] = useState('user');
  const [showLeaveMessage, setShowLeaveMessage] = useState('');
  const [leaveMessageTimeout, setLeaveMessageTimeout] = useState(null);
  const [connectionQuality, setConnectionQuality] = useState('unknown');
  const connectionQualityIntervalRef = useRef(null);
  const [videoQuality, setVideoQuality] = useState('high');
  const [showQualityNotification, setShowQualityNotification] = useState(false);
  const [qualityNotificationMessage, setQualityNotificationMessage] = useState('');
  const qualityNotificationTimeoutRef = useRef(null);

  // Optimized ICE servers with multiple STUN and TURN servers for better connectivity
  const iceServers = getIceServers(true);

  // Generate shareable URL
  const shareableUrl = `${window.location.origin}/${sessionCode}`;

  // Copy link function
  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareableUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy link:', err);
    }
  };

  // Share function
  const shareLink = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Join my video call',
          text: 'Click the link to join my video call',
          url: shareableUrl,
        });
      } catch (err) {
        console.error('Failed to share:', err);
      }
    } else {
      // Fallback to copy
      copyLink();
    }
  };

  // Connect to backend and handle room join
  useEffect(() => {
    if (sessionCode) {
      setSessionError('');
      console.log('Connecting to backend at:', SOCKET_URL);
      socketRef.current = io(SOCKET_URL, { transports: ['websocket'] });
      socketRef.current.on('connect', () => {
        console.log('Socket connected:', socketRef.current.id);
        socketRef.current.emit('join', sessionCode);
        setJoined(true);
      });
      socketRef.current.on('session-error', (err) => {
        setSessionError(err.message || 'Session error');
        onEndCall();
      });
      socketRef.current.on('connect_error', (err) => {
        console.error('Socket connection error:', err);
      });
      socketRef.current.on('disconnect', (reason) => {
        console.warn('Socket disconnected:', reason);
      });

      // WebRTC signaling handlers
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
        
        const message = data?.message || 'Peer left the room';
        setShowLeaveMessage(message);
        
        if (leaveMessageTimeout) {
          clearTimeout(leaveMessageTimeout);
        }
        
        const timeout = setTimeout(() => {
          setShowLeaveMessage('');
        }, 3000);
        setLeaveMessageTimeout(timeout);
      });

      return () => {
        socketRef.current.disconnect();
      };
    }
  }, [sessionCode, onEndCall]);

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
          latency: { ideal: 0.1 },
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
        .catch(err => {
          console.error('Error accessing media devices.', err);
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
    
    peerConnectionRef.current = new window.RTCPeerConnection({
      ...iceServers,
      iceTransportPolicy: 'all',
      bundlePolicy: 'max-bundle',
      rtcpMuxPolicy: 'require',
      iceCandidatePoolSize: 10,
    });
    
    setPeerConnected(true);
    
    localStreamRef.current.getTracks().forEach(track => {
      const sender = peerConnectionRef.current.addTrack(track, localStreamRef.current);
      if (track.kind === 'video') {
        videoSenderRef.current = sender;
        if (sender.getParameters) {
          const params = sender.getParameters();
          if (params.encodings) {
            params.encodings.forEach(encoding => {
              encoding.maxBitrate = 1000000;
              encoding.maxFramerate = 30;
              encoding.scaleResolutionDownBy = 1;
            });
            sender.setParameters(params).catch(console.error);
          }
        }
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
    
    peerConnectionRef.current.oniceconnectionstatechange = () => {
      console.log('[PEER] ICE connection state:', peerConnectionRef.current.iceConnectionState);
      
      if (peerConnectionRef.current.iceConnectionState === 'connected' || 
          peerConnectionRef.current.iceConnectionState === 'completed') {
        startConnectionQualityMonitoring();
      } else {
        stopConnectionQualityMonitoring();
        setConnectionQuality('unknown');
      }
    };
  }

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
        adaptVideoQuality(newQuality, avgRtt, avgJitter, avgPacketLoss);
      });
    }, 2000);
  }

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
      
      if (qualityNotificationTimeoutRef.current) {
        clearTimeout(qualityNotificationTimeoutRef.current);
      }
      qualityNotificationTimeoutRef.current = setTimeout(() => {
        setShowQualityNotification(false);
      }, 3000);
      
      applyVideoQualitySettings(newVideoQuality);
    }
  }

  function applyVideoQualitySettings(quality) {
    if (!peerConnectionRef.current || !videoSenderRef.current) return;
    
    try {
      const params = videoSenderRef.current.getParameters();
      if (params.encodings) {
        params.encodings.forEach(encoding => {
          switch (quality) {
            case 'high':
              encoding.maxBitrate = 1000000;
              encoding.maxFramerate = 30;
              encoding.scaleResolutionDownBy = 1;
              break;
            case 'medium':
              encoding.maxBitrate = 500000;
              encoding.maxFramerate = 20;
              encoding.scaleResolutionDownBy = 1.5;
              break;
            case 'low':
              encoding.maxBitrate = 200000;
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

  useEffect(() => {
    if (socketRef.current && joined) {
      socketRef.current.emit('media-state', {
        videoPaused,
        muted: isMuted,
        roomId: sessionCode,
      });
    }
  }, [videoPaused, isMuted, joined, sessionCode]);

  useEffect(() => {
    if (socketRef.current && joined) {
      socketRef.current.on('media-state', (state) => {
        setPeerVideoPaused(!!state.videoPaused);
        setPeerMuted(!!state.muted);
      });
    }
  }, [joined]);

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

  async function rotateCamera() {
    if (!localStreamRef.current) return;
    
    try {
      const currentVideoTrack = localStreamRef.current.getVideoTracks()[0];
      if (currentVideoTrack) {
        currentVideoTrack.stop();
      }
      
      const newFacingMode = cameraFacing === 'user' ? 'environment' : 'user';
      setCameraFacing(newFacingMode);
      
      const newStream = await navigator.mediaDevices.getUserMedia({
        video: { 
          facingMode: newFacingMode,
          width: { ideal: 1280 },
          height: { ideal: 720 }
        },
        audio: true
      });
      
      const newVideoTrack = newStream.getVideoTracks()[0];
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
      
      newStream.getTracks().forEach(track => {
        if (track !== newVideoTrack) track.stop();
      });
      
      console.log(`Camera rotated to ${newFacingMode} mode`);
    } catch (error) {
      console.error('Error rotating camera:', error);
    }
  }

  function handleEndCall() {
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => track.stop());
      localStreamRef.current = null;
    }
    if (socketRef.current) {
      socketRef.current.disconnect();
    }
    onEndCall();
  }

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

  return (
    <div className="min-h-screen w-full bg-black flex flex-col justify-between items-center font-sans text-white">
      {/* Session code with copy icon */}
      <div className="flex-1 flex flex-col items-center justify-center w-full max-w-7xl mx-auto py-8">
        <div className="mb-8 text-center flex flex-col items-center">
          <span className="text-base opacity-70 flex items-center gap-2 mb-4">
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
          
          {/* Share buttons */}
          <div className="flex items-center gap-3">
            <button
              className="flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg transition-all duration-200"
              onClick={copyLink}
              title="Copy link"
            >
              <FiCopy size={16} />
              <span className="text-sm">Copy Link</span>
            </button>
            <button
              className="flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg transition-all duration-200"
              onClick={shareLink}
              title="Share link"
            >
              <FiShare2 size={16} />
              <span className="text-sm">Share</span>
            </button>
          </div>
        </div>
        
        {/* Videos side-by-side (desktop) or stacked (mobile), maximized */}
        <div className="flex flex-col md:flex-row gap-8 w-full h-[60vh] md:h-[70vh] items-center justify-center">
          {/* Local Video */}
          <div className="flex flex-col items-center w-full md:w-1/2 h-full">
            <div className="relative rounded-2xl shadow-xl border border-white/10 bg-[#181818] overflow-hidden w-full h-full flex items-center justify-center min-h-[220px]">
              {(!videoPaused) ? (
                <video
                  ref={localVideoRef}
                  autoPlay
                  muted
                  playsInline
                  className="w-full h-full object-cover transition-all duration-300"
                  style={{ background: '#222', borderRadius: '1rem' }}
                />
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center text-gray-400 text-lg font-bold">
                  <FiVideoOff size={48} className="mb-2" />
                  Video Paused
                </div>
              )}
              {/* Local Status Overlays */}
              {isMuted && (
                <div className="absolute top-3 left-3 bg-black/70 rounded-full p-2">
                  <FiMicOff size={20} className="text-red-400" />
                </div>
              )}
              {videoPaused && (
                <div className="absolute top-3 right-3 bg-black/70 rounded-full p-2">
                  <FiVideoOff size={20} className="text-yellow-400" />
                </div>
              )}
            </div>
            <span className="text-lg opacity-80 mt-3 tracking-wide font-semibold">You</span>
          </div>

          {/* Remote Video */}
          <div className="flex flex-col items-center w-full md:w-1/2 h-full">
            <div className="relative rounded-2xl shadow-xl border border-white/10 bg-[#181818] overflow-hidden w-full h-full flex items-center justify-center min-h-[220px]">
              {(!peerVideoPaused) ? (
                <video
                  ref={remoteVideoRef}
                  autoPlay
                  playsInline
                  className="w-full h-full object-cover transition-all duration-300"
                  style={{ background: '#222', borderRadius: '1rem' }}
                />
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center text-gray-400 text-lg font-bold">
                  <FiVideoOff size={48} className="mb-2" />
                  Video Paused
                </div>
              )}
              {/* Peer Status Overlays */}
              {peerMuted && (
                <div className="absolute top-3 left-3 bg-black/70 rounded-full p-2">
                  <FiMicOff size={20} className="text-red-400" />
                </div>
              )}
              {peerVideoPaused && (
                <div className="absolute top-3 right-3 bg-black/70 rounded-full p-2">
                  <FiVideoOff size={20} className="text-yellow-400" />
                </div>
              )}
            </div>
            <span className="text-lg opacity-80 mt-3 tracking-wide font-semibold">Peer</span>
          </div>
        </div>
      </div>

      {/* Simple control bar */}
      <div className="w-full flex justify-center items-center gap-8 py-8 bg-black border-t border-white/10">
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

export default VideoCall; 