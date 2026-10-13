const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

const activeUsers = new Map(); // userId -> socketId
const usersDB = new Map();     // userId -> { password, phone, email, profilePic }
const groupsDB = new Map();    // groupId -> { name, members: [] }

io.on('connection', (socket) => {
  console.log('Bağlantı sağlandı:', socket.id);

  // Kayıt Ol
  socket.on('register', (data, callback) => {
    if (usersDB.has(data.userId)) {
      return callback({ success: false, message: 'Bu kullanıcı adı zaten alınmış!' });
    }
    usersDB.set(data.userId, { 
      password: data.password, 
      phone: data.phone, 
      email: data.email, 
      profilePic: data.profilePic || '' 
    });
    callback({ success: true });
  });

  // Giriş Yap
  socket.on('login', (data, callback) => {
    const user = usersDB.get(data.userId);
    if (!user || user.password !== data.password) {
      return callback({ success: false, message: 'Kullanıcı adı veya şifre hatalı!' });
    }
    activeUsers.set(data.userId, socket.id);
    callback({ success: true, profilePic: user.profilePic });
  });

  // Şifre Kurtarma
  socket.on('recover_password', (data, callback) => {
    const user = usersDB.get(data.userId);
    if (!user) return callback({ success: false, message: 'Kullanıcı bulunamadı!' });
    
    if (user.email === data.contact || user.phone === data.contact) {
      callback({ success: true, password: user.password });
    } else {
      callback({ success: false, message: 'Kayıtlı e-posta veya telefon uyuşmuyor!' });
    }
  });

  // Profil Fotoğrafı Güncelleme
  socket.on('update_profile_pic', (data) => {
    const user = usersDB.get(data.userId);
    if (user) {
      user.profilePic = data.profilePic;
      io.to(socket.id).emit('profile_updated', { profilePic: data.profilePic });
    }
  });

  // Grup Oluşturma
  socket.on('create_group', (data) => {
    const groupId = 'g_' + Date.now();
    groupsDB.set(groupId, { name: data.groupName, members: data.members });
    data.members.forEach(memberId => {
      const sockId = activeUsers.get(memberId);
      if (sockId) {
        io.to(sockId).emit('group_created', { groupId, groupName: data.groupName, members: data.members });
      }
    });
  });

  // Mesajlaşma (DM veya Grup)
  socket.on('send_message', (data) => {
    // data: { senderId, receiverId (kişi veya grup ID), message, isGroup }
    if (data.isGroup) {
      const group = groupsDB.get(data.receiverId);
      if (group) {
        group.members.forEach(memberId => {
          if (memberId !== data.senderId) {
            const sockId = activeUsers.get(memberId);
            if (sockId) io.to(sockId).emit('receive_message', data);
          }
        });
      }
    } else {
      const recipientSocketId = activeUsers.get(data.receiverId);
      if (recipientSocketId) {
        io.to(recipientSocketId).emit('receive_message', data);
      }
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
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`SHNAPP Sunucusu ${PORT} portunda çalışıyor.`);
});