const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const app = express();
app.use(express.json({ limit: '10mb' })); // Büyük görseller/fotoğraflar için limit artırıldı
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*", 
    methods: ["GET", "POST"]
app.use(express.static(__dirname));
  }
});

const users = []; 
const rooms = []; 
const messages = [];
const activeSockets = {}; // { username: socketId }

app.post('/api/register', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Tüm alanları doldurun!' });
    
    const existingUser = users.find(u => u.username === username);
    if (existingUser) {
      return res.status(400).json({ error: 'Bu kullanıcı adı zaten alınmış!' });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    users.push({ username, password: hashedPassword, friends: [], requests: [] });
    res.json({ success: true, message: 'Kayıt başarılı!' });
  } catch (err) {
    res.status(500).json({ error: 'Sunucu hatası!' });
  }
});

app.post('/api/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const user = users.find(u => u.username === username);
    if (!user) return res.status(400).json({ error: 'Kullanıcı adı veya şifre hatalı!' });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(400).json({ error: 'Kullanıcı adı veya şifre hatalı!' });

    const token = jwt.sign({ username }, 'gizli_anahtarim', { expiresIn: '1h' });
    res.json({ success: true, token, username });
  } catch (err) {
    res.status(500).json({ error: 'Sunucu hatası!' });
  }
});

app.get('/api/rooms', (req, res) => {
  res.json(rooms);
});

app.post('/api/rooms', (req, res) => {
  const { roomName } = req.body;
  if (roomName && !rooms.includes(roomName)) {
    rooms.push(roomName);
    io.emit('update_rooms', rooms);
    return res.json({ success: true, rooms });
  }
  res.status(400).json({ error: 'Oda adı geçersiz veya zaten var!' });
});

app.post('/api/search-user', (req, res) => {
  const { username, searchTarget } = req.body;
  const targetUser = users.find(u => u.username === searchTarget);
  
  if (!targetUser) return res.status(404).json({ error: 'Kullanıcı bulunamadı!' });
  if (searchTarget === username) return res.status(400).json({ error: 'Kendinizi ekleyemezsiniz!' });

  const currentUser = users.find(u => u.username === username);
  if (currentUser.friends.includes(searchTarget)) {
    return res.status(400).json({ error: 'Zaten arkadaşsınız!' });
  }

  res.json({ success: true, username: targetUser.username });
});

app.post('/api/send-request', (req, res) => {
  const { sender, receiver } = req.body;
  const targetUser = users.find(u => u.username === receiver);
  
  if (targetUser && !targetUser.requests.includes(sender) && !targetUser.friends.includes(sender)) {
    targetUser.requests.push(sender);
    const targetSocketId = activeSockets[receiver];
    if (targetSocketId) {
      io.to(targetSocketId).emit('new_friend_request', { sender });
    }
    return res.json({ success: true, message: 'İstek gönderildi!' });
  }
  res.status(400).json({ error: 'İstek gönderilemedi.' });
});

app.post('/api/user-data', (req, res) => {
  const { username } = req.body;
  const user = users.find(u => u.username === username);
  if (user) {
    // Çevrimiçi olan arkadaşları belirlemek için sunucu tarafında kontrol sağlayabiliriz
    res.json({ friends: user.friends, requests: user.requests });
  } else {
    res.status(404).json({ error: 'Kullanıcı bulunamadı' });
  }
});

app.post('/api/accept-request', (req, res) => {
  const { username, requester } = req.body;
  const user = users.find(u => u.username === username);
  const reqUser = users.find(u => u.username === requester);

  if (user && reqUser) {
    user.requests = user.requests.filter(r => r !== requester);
    if (!user.friends.includes(requester)) user.friends.push(requester);
    if (!reqUser.friends.includes(username)) reqUser.friends.push(username);

    const reqSocketId = activeSockets[requester];
    if (reqSocketId) {
      io.to(reqSocketId).emit('request_accepted', { newFriend: username });
    }

    return res.json({ success: true, friends: user.friends, requests: user.requests });
  }
  res.status(400).json({ error: 'İşlem başarısız' });
});

io.on('connection', (socket) => {
  console.log(`Bağlandı: ${socket.id}`);

  socket.on('register_socket', (username) => {
    activeSockets[username] = socket.id;
    // Herkese çevrimiçi durumlarını bildir
    io.emit('update_online_users', Object.keys(activeSockets));
  });

  socket.on('join_room', (data) => {
    socket.join(data.room);
    const roomMessages = messages.filter(m => m.room === data.room);
    socket.emit('load_chat_history', roomMessages);
  });

  socket.on('send_message', (data) => {
    const newMessage = {
      room: data.room,
      sender: data.username,
      message: data.message,
      image: data.image || null // Görsel desteği
    };
    
    messages.push(newMessage);
    io.to(data.room).emit('receive_message', newMessage);
    io.emit('new_notification', { room: data.room, sender: data.username });
  });

  socket.on('disconnect', () => {
    for (let username in activeSockets) {
      if (activeSockets[username] === socket.id) {
        delete activeSockets[username];
        break;
      }
    }
    // Çevrimdışı güncellemelerini yansıt
    io.emit('update_online_users', Object.keys(activeSockets));
    console.log('Ayrıldı.');
  });
});

const PORT = 3000;
server.listen(PORT, () => {
  console.log(`shnapp Pro V2 Sunucusu çalışıyor: http://localhost:${PORT}`);
});