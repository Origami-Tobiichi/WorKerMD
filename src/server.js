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
app.set('views', path.join(__dirname, '../views'));

// Static files
app.use(express.static(path.join(__dirname, '../public')));

// Routes
app.get('/', (req, res) => {
    res.render('index', { 
        title: 'Naze Bot',
        pairingCode: null,
        qrCode: null
    });
});

app.get('/qr', (req, res) => {
    res.render('qr', { 
        title: 'QR Code - Naze Bot'
    });
});

app.get('/pairing', (req, res) => {
    res.render('pairing', { 
        title: 'Pairing Code - Naze Bot'
    });
});

// Endpoint untuk menerima pairing code
app.get('/set-pairing-code', (req, res) => {
    const code = req.query.code;
    if (code) {
        console.log('Pairing code received:', code);
        // Simpan pairing code untuk ditampilkan di web
        global.pairingCode = code;
        res.json({ success: true, code: code });
    } else {
        res.json({ success: false });
    }
});

// Endpoint untuk mendapatkan pairing code
app.get('/get-pairing-code', (req, res) => {
    res.json({ code: global.pairingCode || null });
});

module.exports = { app, server, PORT };
