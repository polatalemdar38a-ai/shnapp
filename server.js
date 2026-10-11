const express = require('express');
const app = express();
const http = require('http');
const server = http.createServer(app);
const { Server } = require("socket.io");
const io = new Server(server);

// Middleware
app.use(express.json());
app.use(express.static(__dirname));

// Basit geçici kullanıcı veritabanı (Bellekte saklanır)
const users = [];

// Kayıt Ol API Route
app.post('/api/register', (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
        return res.json({ success: false, message: "Kullanıcı adı ve şifre boş olamaz!" });
    }
    const existingUser = users.find(u => u.username === username);
    if (existingUser) {
        return res.json({ success: false, message: "Bu kullanıcı adı zaten alınmış!" });
    }
    users.push({ username, password });
    res.json({ success: true });
});

// Giriş Yap API Route
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    const user = users.find(u => u.username === username && u.password === password);
    if (user) {
        res.json({ success: true });
    } else {
        res.json({ success: false, message: "Hatalı kullanıcı adı veya şifre!" });
    }
});

// Socket.io Sohbet Yönetimi
io.on('connection', (socket) => {
    console.log('Bir kullanıcı bağlandı:', socket.id);

    socket.on('chat message', (msg) => {
        io.emit('chat message', msg);
    });

    socket.on('disconnect', () => {
        console.log('Kullanıcı ayrıldı:', socket.id);
    });
});

// Sunucuyu Başlat
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});