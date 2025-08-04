// TURN Server Configuration
// Add your TURN server credentials here for better connectivity across different networks

export const turnServers = [
  // Example TURN servers (replace with your own)
  // {
  //   urls: 'turn:your-turn-server.com:3478',
  //   username: 'your-username',
  //   credential: 'your-password'
  // },
  // {
  //   urls: 'turn:your-turn-server.com:3478?transport=tcp',
  //   username: 'your-username', 
  //   credential: 'your-password'
  // },
  // {
  //   urls: 'turn:your-turn-server.com:443?transport=tcp',
  //   username: 'your-username',
  //   credential: 'your-password'
  // }
];

// Free TURN servers (limited bandwidth, for testing only)
export const freeTurnServers = [
  {
    urls: 'turn:openrelay.metered.ca:80',
    username: 'openrelayproject',
    credential: 'openrelayproject'
  },
  {
    urls: 'turn:openrelay.metered.ca:443',
    username: 'openrelayproject',
    credential: 'openrelayproject'
  },
  {
    urls: 'turn:openrelay.metered.ca:443?transport=tcp',
    username: 'openrelayproject',
    credential: 'openrelayproject'
  }
];

// STUN servers for basic connectivity
export const stunServers = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
  { urls: 'stun:stun3.l.google.com:19302' },
  { urls: 'stun:stun4.l.google.com:19302' },
  { urls: 'stun:stun.ekiga.net' },
  { urls: 'stun:stun.ideasip.com' },
  { urls: 'stun:stun.schlund.de' },
  { urls: 'stun:stun.stunprotocol.org:3478' },
  { urls: 'stun:stun.voiparound.com' },
  { urls: 'stun:stun.voipbuster.com' },
  { urls: 'stun:stun.voipstunt.com' },
  { urls: 'stun:stun.voxgratia.org' },
  { urls: 'stun:stun.xten.com' }
];

// Combined ICE servers configuration
export const getIceServers = (useTurnServers = false) => {
  const servers = [...stunServers];
  
  if (useTurnServers) {
    // Add your custom TURN servers here
    servers.push(...turnServers);
    
    // Add free TURN servers as fallback (limited bandwidth)
    servers.push(...freeTurnServers);
  }
  
  return {
    iceServers: servers,
    iceCandidatePoolSize: 10,
  };
}; 