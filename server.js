const express = require('express');
const app = express();
const http = require('http');
const server = http.createServer(app);
const { Server } = require("socket.io");
const io = new Server(server);

app.use(express.json());
app.use(express.static(__dirname));

// Bellek tabanlı kullanıcı ve arkadaşlık veritabanı
const users = []; // { username, password, friends: [] }

// Kayıt Ol API
app.post('/api/register', (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) return res.json({ success: false, message: "Alanlar boş olamaz!" });
    if (users.find(u => u.username === username)) return res.json({ success: false, message: "Bu kullanıcı adı zaten alınmış!" });
    
    users.push({ username, password, friends: [] });
    res.json({ success: true });
});

// Giriş Yap API
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    const user = users.find(u => u.username === username && u.password === password);
    if (user) {
        res.json({ success: true, username: user.username });
    } else {
        res.json({ success: false, message: "Hatalı kullanıcı adı veya şifre!" });
    }
});

// Kullanıcı Arama API
app.get('/api/search', (req, res) => {
    const query = req.query.q || '';
    const currentUser = req.query.user || '';
    const results = users
        .filter(u => u.username.includes(query) && u.username !== currentUser)
        .map(u => ({ username: u.username }));
    res.json(results);
});

// Arkadaş Ekle API
app.post('/api/add-friend', (req, res) => {
    const { username, friendName } = req.body;
    const user = users.find(u => u.username === username);
    const friend = users.find(u => u.username === friendName);

    if (!user || !friend) return res.json({ success: false, message: "Kullanıcı bulunamadı!" });
    if (user.friends.includes(friendName)) return res.json({ success: false, message: "Zaten arkadaşsınız!" });

    user.friends.push(friendName);
    res.json({ success: true, friends: user.friends });
});

// Arkadaş Listesini Getir
app.get('/api/friends', (req, res) => {
    const username = req.query.user;
    const user = users.find(u => u.username === username);
    if (user) {
        res.json({ success: true, friends: user.friends });
    } else {
        res.json({ success: false, friends: [] });
    }
});

// Socket.io Sohbet Yönetimi
io.on('connection', (socket) => {
    console.log('Bir kullanıcı bağlandı:', socket.id);

    // Odaya katılma (Genel veya DM odası)
    socket.on('join room', (room) => {
        socket.join(room);
        console.log(`Kullanıcı odaya katıldı: ${room}`);
    });

    // Mesajlaşma
    socket.on('chat message', (data) => {
        // data: { room, sender, text }
        io.to(data.room).emit('chat message', data);
    });

    socket.on('disconnect', () => {
        console.log('Kullanıcı ayrıldı:', socket.id);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});