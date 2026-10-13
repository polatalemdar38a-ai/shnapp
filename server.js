const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" }
});

const activeUsers = new Map();

io.on('connection', (socket) => {
  console.log('Kullanıcı bağlandı:', socket.id);

  socket.on('register_user', (userId) => {
    activeUsers.set(userId, socket.id);
    console.log(`SHNAPP Kullanıcısı aktif: ${userId} (${socket.id})`);
  });

  socket.on('send_message', (data) => {
    const recipientSocketId = activeUsers.get(data.receiverId);
    if (recipientSocketId) {
      io.to(recipientSocketId).emit('receive_message', data);
    }
  });

  // WebRTC Sinyalleşme
  socket.on('call_user', (data) => {
    const recipientSocketId = activeUsers.get(data.to);
    if (recipientSocketId) {
      io.to(recipientSocketId).emit('incoming_call', {
        from: socket.id,
        callerId: data.callerId,
        offer: data.offer,
        isAudioOnly: data.isAudioOnly
      });
    }
  });

  socket.on('make_answer', (data) => {
    io.to(data.to).emit('call_answered', { answer: data.answer });
  });

  socket.on('ice_candidate', (data) => {
    io.to(data.to).emit('ice_candidate', { candidate: data.candidate });
  });

  socket.on('disconnect', () => {
    for (let [userId, sockId] of activeUsers.entries()) {
      if (sockId === socket.id) {
        activeUsers.delete(userId);
        break;
      }
    }
    console.log('Kullanıcı ayrıldı:', socket.id);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`SHNAPP Sunucusu ${PORT} portunda çalışıyor.`);
});