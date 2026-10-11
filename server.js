const express = require('express');
const app = express();
const http = require('http');
const server = http.createServer(app);
const { Server } = require("socket.io");
const io = new Server(server);

// Statik dosyaları (index.html vb.) ana dizinden sunma ayarı
app.use(express.static(__dirname));

// Socket.io bağlantı yönetimi
io.on('connection', (socket) => {
  console.log('Bir kullanıcı bağlandı:', socket.id);

  // Kullanıcıdan gelen mesajı dinle ve herkese gönder
  socket.on('chat message', (msg) => {
    io.emit('chat message', msg);
  });

  socket.on('disconnect', () => {
    console.log('Kullanıcı ayrıldı:', socket.id);
  });
});

// Render'ın atayacağı portu kullan (yerelde ise 3000 portunu kullanır)
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});