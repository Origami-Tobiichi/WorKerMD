// app.js - File utama yang menggabungkan server dan start
const express = require('express');
const path = require('path');
const http = require('http');

const app = express();
const PORT = process.env.PORT || 8000;

// Middleware untuk parsing
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Set view engine ke EJS
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Static files
app.use(express.static(path.join(__dirname, 'public')));

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
        pairingCode: global.pairingCode || null,
        packageInfo: packageInfo
    });
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.status(200).json({ 
        status: 'OK', 
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        packageInfo: packageInfo
    });
});

// Error handling untuk view tidak ditemukan
app.use((err, req, res, next) => {
    if (err.message.includes('Failed to lookup view')) {
        return res.json({
            status: 'Bot is running',
            message: 'Web interface not available, but bot is functional',
            port: PORT,
            pairingCode: global.pairingCode || null,
            packageInfo: packageInfo
        });
    }
    next(err);
});

// Route fallback untuk semua request lainnya
app.use('*', (req, res) => {
    res.json({
        status: 'Bot is running',
        message: 'Server is working correctly',
        port: PORT,
        endpoints: {
            home: '/',
            status: '/status',
            health: '/health',
            getPairingCode: '/get-pairing-code',
            setPairingCode: '/set-pairing-code?code=YOUR_CODE'
        }
    });
});

// Create server
const server = http.createServer(app);

// Start server
server.listen(PORT, () => {
    console.log(`🚀 App running on port ${PORT}`);
    console.log(`📱 Access your bot at: http://localhost:${PORT}`);
    console.log(`🩺 Health check at: http://localhost:${PORT}/health`);
    console.log(`📊 Status at: http://localhost:${PORT}/status`);
});

// Handle graceful shutdown
process.on('SIGTERM', () => {
    console.log('SIGTERM received, shutting down gracefully');
    server.close(() => {
        console.log('Process terminated');
    });
});

process.on('SIGINT', () => {
    console.log('SIGINT received, shutting down gracefully');
    server.close(() => {
        console.log('Process terminated');
    });
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

module.exports = app;
