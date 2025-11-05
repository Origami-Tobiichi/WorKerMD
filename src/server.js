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

// State management untuk pairing
const pairingState = {
    code: null,
    timestamp: null,
    status: 'waiting', // waiting, scanning, paired, expired
    qrCode: null
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
        uptime: '2311 second',
        pairingCode: pairingState.code,
        pairingStatus: pairingState.status
    });
});

// Endpoint untuk QR Code (jika menggunakan QR)
app.get('/qr', async (req, res) => {
    try {
        if (pairingState.qrCode) {
            res.setHeader('content-type', 'image/png');
            res.send(pairingState.qrCode);
        } else {
            res.status(404).send('QR not available');
        }
    } catch (error) {
        res.status(404).send('QR not available');
    }
});

// Endpoint untuk set pairing code (dipanggil oleh bot)
app.post('/set-pairing-code', (req, res) => {
    const { code, status = 'waiting', qrCode = null } = req.body;
    
    if (code) {
        pairingState.code = code;
        pairingState.timestamp = new Date();
        pairingState.status = status;
        pairingState.qrCode = qrCode;
        
        console.log('Pairing code received:', code, 'Status:', status);
        
        // Auto expire setelah 5 menit
        setTimeout(() => {
            if (pairingState.code === code && pairingState.status !== 'paired') {
                pairingState.status = 'expired';
                console.log('Pairing code expired:', code);
            }
        }, 5 * 60 * 1000);
        
        res.json({ 
            success: true, 
            code: code,
            status: status,
            timestamp: pairingState.timestamp
        });
    } else {
        res.status(400).json({ 
            success: false, 
            error: 'No code provided' 
        });
    }
});

// Endpoint untuk update status pairing
app.post('/update-pairing-status', (req, res) => {
    const { status, code } = req.body;
    
    if (pairingState.code === code || code === undefined) {
        pairingState.status = status;
        console.log('Pairing status updated:', status, 'for code:', code || pairingState.code);
        
        res.json({ 
            success: true, 
            status: status,
            code: pairingState.code
        });
    } else {
        res.status(400).json({ 
            success: false, 
            error: 'Invalid code or no active pairing session' 
        });
    }
});

// Endpoint untuk get pairing code (dipanggil oleh frontend)
app.get('/get-pairing-code', (req, res) => {
    res.json({ 
        code: pairingState.code,
        status: pairingState.status,
        timestamp: pairingState.timestamp,
        expiresIn: pairingState.timestamp ? 
            Math.max(0, 5 * 60 * 1000 - (new Date() - pairingState.timestamp)) : 0
    });
});

// Endpoint untuk reset pairing
app.post('/reset-pairing', (req, res) => {
    pairingState.code = null;
    pairingState.timestamp = null;
    pairingState.status = 'waiting';
    pairingState.qrCode = null;
    
    console.log('Pairing reset');
    res.json({ success: true, message: 'Pairing reset successfully' });
});

// WebSocket atau SSE untuk real-time updates (opsional)
app.get('/pairing-events', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    
    // Send initial state
    res.write(`data: ${JSON.stringify(pairingState)}\n\n`);
    
    // Check for updates every second
    const interval = setInterval(() => {
        res.write(`data: ${JSON.stringify(pairingState)}\n\n`);
    }, 1000);
    
    req.on('close', () => {
        clearInterval(interval);
        res.end();
    });
});

// Status page
app.get('/status', (req, res) => {
    res.json({ 
        status: 'Bot is running', 
        port: PORT,
        pairing: pairingState
    });
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.status(200).json({ 
        status: 'OK', 
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        pairing: {
            hasActivePairing: pairingState.code !== null,
            status: pairingState.status
        }
    });
});

// Error handling
app.use((err, req, res, next) => {
    if (err.message.includes('Failed to lookup view')) {
        return res.json({
            status: 'Bot is running',
            message: 'Web interface not available, but bot is functional',
            port: PORT,
            pairing: pairingState
        });
    }
    next(err);
});

// HANYA ekspor app, jangan start server di sini
module.exports = { app, PORT, pairingState };
