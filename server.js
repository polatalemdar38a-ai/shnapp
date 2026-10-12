const express = require('express');
const app = express();
const http = require('http');
const server = http.createServer(app);
const { Server } = require("socket.io");
const io = new Server(server, {
    maxHttpBufferSize: 5e7
});

app.use(express.json({ limit: '50mb' }));
app.use(express.static(__dirname));

const users = [];
const groups = [];
const activeSockets = {};
const messages = {};
const resetTokens = {};

app.post('/api/register', (req, res) => {
    const { username, password, email, phone } = req.body;
    if (!username || !password) return res.json({ success: false, message: "Kullanıcı adı ve şifre zorunludur!" });
    if (users.find(u => u.username === username)) return res.json({ success: false, message: "Bu kullanıcı adı zaten alınmış!" });

    users.push({
        username,
        password,
        email: email || "",
        phone: phone || "",
        avatar: "",
        bio: "Hey there! I am using SHNAPP.",
        showOnline: true,
        showReadReceipts: true,
        friends: [],
        requests: [],
        notifications: [],
        archivedRooms: [],
        pinnedRooms: [],
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

app.post('/api/forgot-password', (req, res) => {
    const { identity } = req.body;
    const user = users.find(u => u.email === identity || u.phone === identity || u.username === identity);
    if (!user) return res.json({ success: false, message: "Kullanıcı bulunamadı!" });

    const code = Math.floor(100000 + Math.random() * 900000).toString();
    resetTokens[user.username] = code;
    res.json({ success: true, message: `Doğrulama kodunuz oluşturuldu! (Kod: ${code})`, username: user.username });
});

app.post('/api/reset-password', (req, res) => {
    const { username, code, newPassword } = req.body;
    if (resetTokens[username] && resetTokens[username] === code) {
        const user = users.find(u => u.username === username);
        if (user) {
            user.password = newPassword;
            delete resetTokens[username];
            return res.json({ success: true, message: "Şifreniz güncellendi!" });
        }
    }
    res.json({ success: false, message: "Geçersiz doğrulama kodu!" });
});

app.get('/api/profile-info', (req, res) => {
    const username = req.query.user;
    const user = users.find(u => u.username === username);
    if (!user) return res.json({ success: false });
    res.json({
        success: true,
        username: user.username,
        bio: user.bio || "Hey there! I am using SHNAPP.",
        avatar: user.avatar || "",
        email: user.email || "",
        phone: user.phone || "",
        showOnline: user.showOnline !== undefined ? user.showOnline : true,
        showReadReceipts: user.showReadReceipts !== undefined ? user.showReadReceipts : true,
        friends: user.friends || [],
        requests: user.requests || [],
        notifications: user.notifications || [],
        pinnedRooms: user.pinnedRooms || [],
        nicknames: user.nicknames || {},
        lastSeen: user.showOnline ? user.lastSeen : ""
    });
});

app.post('/api/update-profile-settings', (req, res) => {
    const { username, newUsername, bio, avatar, email, phone, showOnline, showReadReceipts } = req.body;
    const user = users.find(u => u.username === username);
    if (!user) return res.json({ success: false, message: "Kullanıcı bulunamadı!" });

    if (newUsername && newUsername !== username) {
        if (users.find(u => u.username === newUsername)) {
            return res.json({ success: false, message: "Bu kullanıcı adı dolu!" });
        }
        user.username = newUsername;
    }

    if (bio !== undefined) user.bio = bio;
    if (avatar !== undefined) user.avatar = avatar;
    if (email !== undefined) user.email = email;
    if (phone !== undefined) user.phone = phone;
    if (showOnline !== undefined) user.showOnline = showOnline;
    if (showReadReceipts !== undefined) user.showReadReceipts = showReadReceipts;

    io.emit('user status change', { username: user.username, status: user.showOnline ? user.lastSeen : "" });
    res.json({ success: true, username: user.username, bio: user.bio, avatar: user.avatar });
});

app.get('/api/search', (req, res) => {
    const query = req.query.q || '';
    const currentUser = req.query.user || '';
    const results = users
        .filter(u => u.username.toLowerCase().includes(query.toLowerCase()) && u.username !== currentUser)
        .map(u => ({ username: u.username, bio: u.bio, avatar: u.avatar }));
    res.json(results);
});

app.post('/api/send-request', (req, res) => {
    const { username, targetUser } = req.body;
    const target = users.find(u => u.username === targetUser);
    const sender = users.find(u => u.username === username);

    if (!target || !sender) return res.json({ success: false, message: "Kullanıcı bulunamadı!" });
    if (target.requests.some(r => r.from === username)) return res.json({ success: false, message: "Zaten istek gönderilmiş!" });
    if (target.friends.includes(username)) return res.json({ success: false, message: "Zaten arkadaşsınız!" });

    const newReq = { from: username, type: 'friend' };
    const newNotif = { text: `@${username} sana arkadaşlık isteği gönderdi.`, date: new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) };
    target.requests.push(newReq);
    target.notifications.unshift(newNotif);

    if (activeSockets[targetUser]) {
        io.to(activeSockets[targetUser]).emit('new notification', { request: newReq, notification: newNotif });
        io.to(activeSockets[targetUser]).emit('refresh data');
    }
    res.json({ success: true });
});

app.post('/api/accept-request', (req, res) => {
    const { username, requester } = req.body;
    const user = users.find(u => u.username === username);
    const reqUser = users.find(u => u.username === requester);

    if (user && reqUser) {
        user.requests = (user.requests || []).filter(r => r.from !== requester);
        if (!user.friends) user.friends = [];
        if (!reqUser.friends) reqUser.friends = [];

        if (!user.friends.includes(requester)) user.friends.push(requester);
        if (!reqUser.friends.includes(username)) reqUser.friends.push(username);

        user.notifications.unshift({ text: `@${requester} ile arkadaş oldunuz.`, date: new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) });
        reqUser.notifications.unshift({ text: `@${username} isteğinizi kabul etti!`, date: new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) });

        if (activeSockets[requester]) io.to(activeSockets[requester]).emit('refresh data');
        if (activeSockets[username]) io.to(activeSockets[username]).emit('refresh data');

        res.json({ success: true });
    } else {
        res.json({ success: false, message: "Kullanıcılar bulunamadı." });
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
    groups.push({ id: groupId, name: groupName, creator, members: [creator, ...members] });
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
    if (user) {
        if (!user.archivedRooms) user.archivedRooms = [];
        if (!user.archivedRooms.includes(roomId)) user.archivedRooms.push(roomId);
    }
    res.json({ success: true });
});

app.get('/api/archived', (req, res) => {
    const username = req.query.user;
    const user = users.find(u => u.username === username);
    res.json(user ? user.archivedRooms || [] : []);
});

app.post('/api/pin', (req, res) => {
    const { username, roomId } = req.body;
    const user = users.find(u => u.username === username);
    if (user) {
        if (!user.pinnedRooms) user.pinnedRooms = [];
        if (user.pinnedRooms.includes(roomId)) {
            user.pinnedRooms = user.pinnedRooms.filter(id => id !== roomId);
        } else {
            user.pinnedRooms.push(roomId);
        }
    }
    res.json({ success: true });
});

io.on('connection', (socket) => {
    let currentConnectedUser = "";

    socket.on('register user', (username) => {
        currentConnectedUser = username;
        activeSockets[username] = socket.id;
        const user = users.find(u => u.username === username);
        if (user) {
            user.lastSeen = 'Çevrimiçi';
            if (user.showOnline) io.emit('user status change', { username, status: 'Çevrimiçi' });
        }
    });

    socket.on('join room', (room) => {
        socket.join(room);
        socket.emit('load history', messages[room] || []);
    });

    socket.on('typing', (data) => socket.to(data.room).emit('user typing', data));
    socket.on('stop typing', (data) => socket.to(data.room).emit('user stop typing', data));

    socket.on('chat message', (data) => {
        const senderUser = users.find(u => u.username === data.sender);
        data.showReadReceipts = senderUser ? senderUser.showReadReceipts : true;
        data.id = 'msg_' + Date.now() + Math.random();

        if (!messages[data.room]) messages[data.room] = [];
        messages[data.room].push(data);

        io.to(data.room).emit('chat message', data);
        socket.to(data.room).emit('trigger unread', { room: data.room, sender: data.sender, payload: data.payload });
    });

    socket.on('delete message', (data) => {
        if (messages[data.room]) {
            messages[data.room] = messages[data.room].filter(m => m.id !== data.msgId);
            io.to(data.room).emit('message deleted', { msgId: data.msgId });
        }
    });

    socket.on('clear-chat', (room) => {
        if (messages[room]) delete messages[room];
    });

    socket.on('call-user', (data) => {
        const targetSocket = activeSockets[data.targetUser];
        if (targetSocket) {
            io.to(targetSocket).emit('incoming-call', { from: data.from, offer: data.offer, isVideo: data.isVideo });
        }
    });

    socket.on('answer-call', (data) => {
        const targetSocket = activeSockets[data.targetUser];
        if (targetSocket) io.to(targetSocket).emit('call-answered', { answer: data.answer });
    });

    socket.on('ice-candidate', (data) => {
        const targetSocket = activeSockets[data.targetUser];
        if (targetSocket) io.to(targetSocket).emit('ice-candidate', { candidate: data.candidate });
    });

    socket.on('end-call', (data) => {
        const targetSocket = activeSockets[data.targetUser];
        if (targetSocket) io.to(targetSocket).emit('call-ended');
    });

    socket.on('disconnect', () => {
        if (currentConnectedUser) {
            delete activeSockets[currentConnectedUser];
            const timeStr = new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
            const user = users.find(u => u.username === currentConnectedUser);
            if (user) {
                user.lastSeen = `Son görülme: ${timeStr}`;
                if (user.showOnline) io.emit('user status change', { username: currentConnectedUser, status: `Son görülme: ${timeStr}` });
            }
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));