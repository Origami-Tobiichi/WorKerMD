const express = require('express');
const path = require('path');
const app = express();
const server = require('http').createServer(app);
const PORT = process.env.PORT || 8000;

// Middleware untuk parsing
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Set view engine ke EJS
app.set('view engine', 'ejs');
app.set('views', path.join(process.cwd(), 'views'));

// Static files
app.use(express.static(path.join(process.cwd(), 'public')));

// Data untuk template EJS
const packageInfo = {
    name: 'hitori',
    version: '1.0.8',
    author: 'Mazeker',
    description: 'Bot WhatsApp Using Lib Balloys Multi worker'
};

// Routes
app.get('/', (req, res) => {
    res.render('index', { 
        title: 'Naze Bot',
        port: PORT,
        packageInfo: packageInfo,
        bot_name: packageInfo.name,
        version: packageInfo.version,
        author: packageInfo.author,
        description: packageInfo.description,
        uptime: '2311 second'
    });
});

app.get('/qr', async (req, res) => {
    try {
        res.setHeader('content-type', 'image/png');
        res.end();
    } catch (error) {
        res.status(404).send('QR not available');
    }
});

// Endpoint untuk pairing code
app.get('/set-pairing-code', (req, res) => {
    const code = req.query.code;
    if (code) {
        console.log('Pairing code received:', code);
        global.pairingCode = code;
        res.json({ success: true, code: code });
    } else {
        res.json({ success: false });
    }
});

app.get('/get-pairing-code', (req, res) => {
    res.json({ code: global.pairingCode || null });
});

// Fallback route
app.get('/status', (req, res) => {
    res.json({ 
        status: 'Bot is running', 
        port: PORT,
        pairingCode: global.pairingCode || null
    });
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.status(200).json({ 
        status: 'OK', 
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
    });
});

// Error handling
app.use((err, req, res, next) => {
    if (err.message.includes('Failed to lookup view')) {
        return res.json({
            status: 'Bot is running',
            message: 'Web interface not available, but bot is functional',
            port: PORT,
            pairingCode: global.pairingCode || null
        });
    }
    next(err);
});

// HANYA ekspor app, jangan start server di sini
module.exports = { app, PORT };
