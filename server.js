const express = require('express');
const app = express();
const http = require('http');
const server = http.createServer(app);
const { Server } = require("socket.io");
const io = new Server(server);

app.use(express.json());
app.use(express.static(__dirname));

// Bellek tabanlı veri yapıları
const users = []; // { username, password, friends: [], requests: [], following: [], followers: [], archivedRooms: [] }
const groups = []; // { id, name, creator, members: [] }

app.post('/api/register', (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) return res.json({ success: false, message: "Alanlar boş olamaz!" });
    if (users.find(u => u.username === username)) return res.json({ success: false, message: "Bu kullanıcı adı alınmış!" });
    
    users.push({
        username,
        password,
        friends: [],
        requests: [],
        following: [],
        followers: [],
        archivedRooms: []
    });
    res.json({ success: true });
});

app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    const user = users.find(u => u.username === username && u.password === password);
    if (user) {
        res.json({ success: true, username: user.username });
    } else {
        res.json({ success: false, message: "Hatalı kullanıcı adı veya şifre!" });
    }
});

// Kullanıcı Arama
app.get('/api/search', (req, res) => {
    const query = req.query.q || '';
    const currentUser = req.query.user || '';
    const results = users
        .filter(u => u.username.toLowerCase().includes(query.toLowerCase()) && u.username !== currentUser)
        .map(u => ({ username: u.username }));
    res.json(results);
});

// Arkadaşlık İsteği Gönder (Onay Bekler)
app.post('/api/send-request', (req, res) => {
    const { username, targetUser } = req.body;
    const target = users.find(u => u.username === targetUser);
    if (!target) return res.json({ success: false, message: "Kullanıcı bulunamadı!" });
    if (target.requests.includes(username)) return res.json({ success: false, message: "Zaten istek gönderilmiş!" });
    if (target.friends.includes(username)) return res.json({ success: false, message: "Zaten arkadaşsınız!" });

    target.requests.push(username);
    res.json({ success: true });
});

// Bekleyen İstekleri Listele
app.get('/api/requests', (req, res) => {
    const username = req.query.user;
    const user = users.find(u => u.username === username);
    res.json(user ? user.requests : []);
});

// Arkadaşlık İsteğini Kabul Et
app.post('/api/accept-request', (req, res) => {
    const { username, requester } = req.body;
    const user = users.find(u => u.username === username);
    const reqUser = users.find(u => u.username === requester);

    if (user && reqUser) {
        user.requests = user.requests.filter(r => r !== requester);
        if (!user.friends.includes(requester)) user.friends.push(requester);
        if (!reqUser.friends.includes(username)) reqUser.friends.push(username);
        res.json({ success: true });
    } else {
        res.json({ success: false });
    }
});

// Takip Et / Takipten Çık (Follow / Unfollow)
app.post('/api/toggle-follow', (req, res) => {
    const { username, targetUser } = req.body;
    const user = users.find(u => u.username === username);
    const target = users.find(u => u.username === targetUser);

    if (!user || !target) return res.json({ success: false });

    const isFollowing = user.following.includes(targetUser);
    if (isFollowing) {
        user.following = user.following.filter(f => f !== targetUser);
        target.followers = target.followers.filter(f => f !== username);
    } else {
        user.following.push(targetUser);
        target.followers.push(username);
    }
    res.json({ success: true, isFollowing: !isFollowing });
});

// Profil Detayları (Takipçi/Takip Edilen)
app.get('/api/profile-info', (req, res) => {
    const username = req.query.user;
    const user = users.find(u => u.username === username);
    if (!user) return res.json({ success: false });
    res.json({
        success: true,
        friends: user.friends,
        following: user.following,
        followers: user.followers,
        requests: user.requests
    });
});

// Grup Oluştur
app.post('/api/create-group', (req, res) => {
    const { groupName, creator, members } = req.body;
    if (!groupName) return res.json({ success: false, message: "Grup adı gerekli!" });
    const groupId = 'group_' + Date.now();
    groups.push({
        id: groupId,
        name: groupName,
        creator,
        members: [creator, ...members]
    });
    res.json({ success: true, groupId, groupName });
});

// Kullanıcının Gruplarını Getir
app.get('/api/user-groups', (req, res) => {
    const username = req.query.user;
    const userGroups = groups.filter(g => g.members.includes(username));
    res.json(userGroups);
});

// Sohbet Arşivleme
app.post('/api/archive', (req, res) => {
    const { username, roomId } = req.body;
    const user = users.find(u => u.username === username);
    if (user && !user.archivedRooms.includes(roomId)) {
        user.archivedRooms.push(roomId);
    }
    res.json({ success: true });
});

app.get('/api/archived', (req, res) => {
    const username = req.query.user;
    const user = users.find(u => u.username === username);
    res.json(user ? user.archivedRooms : []);
});

// Socket.io Haberleşme
io.on('connection', (socket) => {
    socket.on('join room', (room) => {
        socket.join(room);
    });

    socket.on('chat message', (data) => {
        io.to(data.room).emit('chat message', data);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});