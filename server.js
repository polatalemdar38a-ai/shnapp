const express = require('express');
const app = express();
const http = require('http');
const server = http.createServer(app);
const { Server } = require("socket.io");
const io = new Server(server, {
    maxHttpBufferSize: 1e7 // 10MB dosya/ses yükleme desteği
});

app.use(express.json({ limit: '10mb' }));
app.use(express.static(__dirname));

const users = []; // { username, password, bio, showOnline, showReadReceipts, friends: [], requests: [], notifications: [], following: [], followers: [], archivedRooms: [], nicknames: {}, lastSeen: 'Çevrimiçi' }
const groups = []; // { id, name, creator, members: [] }
const activeSockets = {}; // username -> socket.id

app.post('/api/register', (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) return res.json({ success: false, message: "Alanlar boş olamaz!" });
    if (users.find(u => u.username === username)) return res.json({ success: false, message: "Bu kullanıcı adı alınmış!" });
    
    users.push({
        username,
        password,
        bio: "Hey there! I am using SHNAPP.",
        showOnline: true,
        showReadReceipts: true,
        friends: [],
        requests: [],
        notifications: [],
        following: [],
        followers: [],
        archivedRooms: [],
        nicknames: {},
        lastSeen: 'Çevrimiçi'
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

app.get('/api/search', (req, res) => {
    const query = req.query.q || '';
    const currentUser = req.query.user || '';
    const results = users
        .filter(u => u.username.toLowerCase().includes(query.toLowerCase()) && u.username !== currentUser)
        .map(u => ({ username: u.username, bio: u.bio }));
    res.json(results);
});

app.get('/api/profile-info', (req, res) => {
    const username = req.query.user;
    const user = users.find(u => u.username === username);
    if (!user) return res.json({ success: false });
    res.json({
        success: true,
        username: user.username,
        bio: user.bio || "Hey there! I am using SHNAPP.",
        showOnline: user.showOnline !== undefined ? user.showOnline : true,
        showReadReceipts: user.showReadReceipts !== undefined ? user.showReadReceipts : true,
        friends: user.friends,
        following: user.following,
        followers: user.followers,
        requests: user.requests,
        notifications: user.notifications,
        nicknames: user.nicknames || {},
        lastSeen: user.showOnline ? user.lastSeen : ""
    });
});

// Hakkımda ve Gizlilik Tercihlerini Güncelleme API'si
app.post('/api/update-profile-settings', (req, res) => {
    const { username, bio, showOnline, showReadReceipts } = req.body;
    const user = users.find(u => u.username === username);
    if (user) {
        if (bio !== undefined) user.bio = bio;
        if (showOnline !== undefined) user.showOnline = showOnline;
        if (showReadReceipts !== undefined) user.showReadReceipts = showReadReceipts;
        
        io.emit('user status change', { 
            username, 
            status: user.showOnline ? user.lastSeen : "" 
        });
        res.json({ success: true, bio: user.bio, showOnline: user.showOnline, showReadReceipts: user.showReadReceipts });
    } else {
        res.json({ success: false });
    }
});

app.post('/api/send-request', (req, res) => {
    const { username, targetUser } = req.body;
    const target = users.find(u => u.username === targetUser);
    if (!target) return res.json({ success: false, message: "Kullanıcı bulunamadı!" });
    if (target.requests.some(r => r.from === username)) return res.json({ success: false, message: "Zaten istek gönderilmiş!" });
    if (target.friends.includes(username)) return res.json({ success: false, message: "Zaten arkadaşsınız!" });

    const newReq = { from: username, type: 'friend' };
    const newNotif = { text: `@${username} sana arkadaşlık isteği gönderdi.`, date: new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) };
    target.requests.push(newReq);
    target.notifications.unshift(newNotif);

    if (activeSockets[targetUser]) {
        io.to(activeSockets[targetUser]).emit('new notification', { request: newReq, notification: newNotif });
    }
    res.json({ success: true });
});

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
        const newNotif = { text: `@${username} seni takip etmeye başladı.`, date: new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) };
        target.notifications.unshift(newNotif);
        if (activeSockets[targetUser]) {
            io.to(activeSockets[targetUser]).emit('new notification', { notification: newNotif });
        }
    }
    res.json({ success: true, isFollowing: !isFollowing });
});

app.post('/api/accept-request', (req, res) => {
    const { username, requester } = req.body;
    const user = users.find(u => u.username === username);
    const reqUser = users.find(u => u.username === requester);

    if (user && reqUser) {
        user.requests = user.requests.filter(r => r.from !== requester);
        if (!user.friends.includes(requester)) user.friends.push(requester);
        if (!reqUser.friends.includes(username)) reqUser.friends.push(username);
        
        user.notifications.unshift({ text: `@${requester} ile arkadaşlık isteğin onaylandı.`, date: new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) });
        reqUser.notifications.unshift({ text: `@${username} arkadaşlık isteğini onayladı!`, date: new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) });

        if (activeSockets[requester]) io.to(activeSockets[requester]).emit('refresh data');
        res.json({ success: true });
    } else {
        res.json({ success: false });
    }
});

app.post('/api/set-nickname', (req, res) => {
    const { username, targetUser, nickname } = req.body;
    const user = users.find(u => u.username === username);
    if (user) {
        if (!user.nicknames) user.nicknames = {};
        user.nicknames[targetUser] = nickname;
        res.json({ success: true });
    } else {
        res.json({ success: false });
    }
});

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

app.get('/api/user-groups', (req, res) => {
    const username = req.query.user;
    const userGroups = groups.filter(g => g.members.includes(username));
    res.json(userGroups);
});

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

io.on('connection', (socket) => {
    let currentConnectedUser = "";

    socket.on('register user', (username) => {
        currentConnectedUser = username;
        activeSockets[username] = socket.id;
        const user = users.find(u => u.username === username);
        if (user) {
            user.lastSeen = 'Çevrimiçi';
            if (user.showOnline) {
                io.emit('user status change', { username, status: 'Çevrimiçi' });
            }
        }
    });

    socket.on('join room', (room) => {
        socket.join(room);
    });

    socket.on('typing', (data) => {
        socket.to(data.room).emit('user typing', data);
    });

    socket.on('stop typing', (data) => {
        socket.to(data.room).emit('user stop typing', data);
    });

    socket.on('chat message', (data) => {
        const senderUser = users.find(u => u.username === data.sender);
        // Gönderenin mavi tik (okundu bilgisi) ayarı kapalıysa alıcıya bildirilirken gösterilmez
        data.showReadReceipts = senderUser ? senderUser.showReadReceipts : true;
        io.to(data.room).emit('chat message', data);
    });

    socket.on('call-user', (data) => {
        const targetSocket = activeSockets[data.targetUser];
        if (targetSocket) {
            io.to(targetSocket).emit('incoming-call', {
                from: data.from,
                offer: data.offer,
                isVideo: data.isVideo
            });
        }
    });

    socket.on('answer-call', (data) => {
        const targetSocket = activeSockets[data.targetUser];
        if (targetSocket) {
            io.to(targetSocket).emit('call-answered', { answer: data.answer });
        }
    });

    socket.on('ice-candidate', (data) => {
        const targetSocket = activeSockets[data.targetUser];
        if (targetSocket) {
            io.to(targetSocket).emit('ice-candidate', { candidate: data.candidate });
        }
    });

    socket.on('end-call', (data) => {
        const targetSocket = activeSockets[data.targetUser];
        if (targetSocket) {
            io.to(targetSocket).emit('call-ended');
        }
    });

    socket.on('disconnect', () => {
        if (currentConnectedUser) {
            delete activeSockets[currentConnectedUser];
            const timeStr = new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
            const user = users.find(u => u.username === currentConnectedUser);
            if (user) {
                user.lastSeen = `Son görülme: ${timeStr}`;
                if (user.showOnline) {
                    io.emit('user status change', { username: currentConnectedUser, status: `Son görülme: ${timeStr}` });
                }
            }
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});