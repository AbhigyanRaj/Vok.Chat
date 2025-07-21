const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
require('dotenv').config();

const app = express();
// For production, restrict CORS to your frontend domain
const allowedOrigins = [
  'https://vok-chat.vercel.app',
  'http://localhost:5173' // Uncomment for local development if needed
];

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    methods: ['GET', 'POST']
  }
});

app.use(cors({ origin: allowedOrigins }));
app.use(express.json());

app.get('/', (req, res) => {
  res.send('VokChat backend is running');
});

// In-memory room management
const rooms = {};

io.on('connection', (socket) => {
  console.log('A user connected:', socket.id);

  // Join a room
  socket.on('join', (roomId) => {
    // If room does not exist, create and join
    if (!rooms[roomId]) {
      rooms[roomId] = [socket.id];
      socket.join(roomId);
      console.log(`User ${socket.id} created and joined room ${roomId}`);
      return;
    }
    // If room exists and has 1 user, allow join
    if (rooms[roomId].length === 1) {
      rooms[roomId].push(socket.id);
      socket.join(roomId);
      // Notify others in the room
      socket.to(roomId).emit('user-joined', socket.id);
      console.log(`User ${socket.id} joined room ${roomId}`);
      return;
    }
    // If room is full or invalid, emit error
    socket.emit('session-error', { message: 'Session not found or already full.' });
    console.log(`User ${socket.id} failed to join room ${roomId}: not found or full`);
  });

  // Relay offer
  socket.on('offer', ({ roomId, offer, to }) => {
    if (to) {
      socket.to(to).emit('offer', { from: socket.id, offer });
    } else {
      socket.to(roomId).emit('offer', { from: socket.id, offer });
    }
  });

  // Relay answer
  socket.on('answer', ({ roomId, answer, to }) => {
    if (to) {
      socket.to(to).emit('answer', { from: socket.id, answer });
    } else {
      socket.to(roomId).emit('answer', { from: socket.id, answer });
    }
  });

  // Relay ICE candidates
  socket.on('ice-candidate', ({ roomId, candidate, to }) => {
    if (to) {
      socket.to(to).emit('ice-candidate', { from: socket.id, candidate });
    } else {
      socket.to(roomId).emit('ice-candidate', { from: socket.id, candidate });
    }
  });

  // Handle disconnect
  socket.on('disconnect', () => {
    for (const roomId in rooms) {
      rooms[roomId] = rooms[roomId].filter(id => id !== socket.id);
      // Notify others in the room
      socket.to(roomId).emit('user-left', socket.id);
      if (rooms[roomId].length === 0) delete rooms[roomId];
    }
    console.log('User disconnected:', socket.id);
  });
});

const PORT = process.env.PORT || 5001;
server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
}); 