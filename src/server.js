const express = require('express');
const { createServer } = require('http');
const path = require('path');

const app = express();
const server = createServer(app);
const PORT = process.env.PORT || process.env.SERVER_PORT || 3000;
const packageInfo = require('../package.json');

// Set EJS sebagai view engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Middleware untuk parsing form data
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Global variable untuk pairing code
let currentPairingCode = null;

app.all('/', (req, res) => {
    if (req.headers.accept && req.headers.accept.includes('text/html')) {
        // Render halaman web dengan EJS
        res.render('index', { 
            packageInfo,
            number_bot: process.env.BOT_NUMBER || global.number_bot 
        });
    } else {
        // API response untuk JSON requests
        if (process.send) {
            process.send('uptime');
            process.once('message', (uptime) => {
                res.json({
                    bot_name: packageInfo.name,
                    version: packageInfo.version,
                    author: packageInfo.author,
                    description: packageInfo.description,
                    uptime: `${Math.floor(uptime)} seconds`
                });
            });
        } else res.json({ error: 'Process not running with IPC' });
    }
});

app.all('/process', (req, res) => {
    const { send } = req.query;
    if (!send) return res.status(400).json({ error: 'Missing send query' });
    
    if (process.send) {
        // Handle pairing code request
        if (send.startsWith('pairing:')) {
            const phoneNumber = send.replace('pairing:', '');
            currentPairingCode = null; // Reset previous code
        }
        
        process.send(send);
        res.json({ status: 'Send', data: send });
    } else {
        res.json({ error: 'Process not running with IPC' });
    }
});

// Endpoint untuk mendapatkan status pairing code
app.all('/pairing-status', (req, res) => {
    if (currentPairingCode) {
        res.json({ pairingCode: currentPairingCode });
    } else {
        res.json({ error: 'No pairing code available' });
    }
});

// Endpoint untuk menerima pairing code dari proses bot
app.all('/set-pairing-code', (req, res) => {
    const { code } = req.query;
    if (code) {
        currentPairingCode = code;
        res.json({ status: 'Pairing code set' });
    } else {
        res.status(400).json({ error: 'No code provided' });
    }
});

app.all('/chat', (req, res) => {
    const { message, to } = req.query;
    if (!message || !to) return res.status(400).json({ error: 'Missing message or to query' });
    res.json({ status: 200, mess: 'does not start' });
});

module.exports = { app, server, PORT };
