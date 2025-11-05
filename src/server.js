const express = require('express');
const { createServer } = require('http');
const path = require('path');

const app = express();
const server = createServer(app);
const PORT = process.env.PORT || process.env.SERVER_PORT || 3000;
const packageInfo = require('./package.json');

// Set view engine to EJS
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// Global variables untuk web dashboard
global.botStatus = 'Initializing...';
global.connectionStatus = 'disconnected';
global.qrCode = null;
global.botInfo = null;
global.pairingCode = null;
global.phoneNumber = null;

// Routes
app.get('/', (req, res) => {
    res.render('index', {
        bot_name: packageInfo.name,
        version: packageInfo.version,
        author: packageInfo.author,
        description: packageInfo.description,
        botStatus: global.botStatus,
        connectionStatus: global.connectionStatus,
        qrCode: global.qrCode,
        botInfo: global.botInfo,
        pairingCode: global.pairingCode,
        phoneNumber: global.phoneNumber,
        uptime: process.uptime()
    });
});

app.get('/api/status', (req, res) => {
    res.json({
        bot_name: packageInfo.name,
        version: packageInfo.version,
        author: packageInfo.author,
        description: packageInfo.description,
        status: global.botStatus,
        connection_status: global.connectionStatus,
        bot_info: global.botInfo,
        has_qr: !!global.qrCode,
        pairing_code: global.pairingCode,
        phone_number: global.phoneNumber,
        uptime: Math.floor(process.uptime())
    });
});

app.get('/qr', (req, res) => {
    if (global.qrCode) {
        res.setHeader('content-type', 'image/png');
        res.end(global.qrCode);
    } else {
        res.status(404).json({ error: 'QR code not available' });
    }
});

app.get('/api/restart', (req, res) => {
    if (process.send) {
        process.send('reset');
        res.json({ status: 'success', message: 'Restart command sent' });
    } else {
        res.status(500).json({ status: 'error', message: 'Process not running with IPC' });
    }
});

module.exports = { app, server, PORT };
