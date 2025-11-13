// app.js - File utama dengan pairing code yang diperbaiki
const express = require('express');
const path = require('path');
const http = require('http');

const app = express();
const PORT = process.env.PORT || 3000;

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

// Simpan pairing codes (gunakan database di production)
let pairingCodes = new Map();
let activePairingCode = null;
let pairingCodeTimestamp = null;

// Routes
app.get('/', (req, res) => {
    // Check if pairing code is expired (15 seconds)
    const isExpired = pairingCodeTimestamp ? (Date.now() - pairingCodeTimestamp) > 15000 : true;
    if (isExpired && activePairingCode) {
        activePairingCode = null;
        pairingCodeTimestamp = null;
    }

    res.render('index', { 
        title: 'Naze Bot',
        port: PORT,
        packageInfo: packageInfo,
        bot_name: packageInfo.name,
        version: packageInfo.version,
        author: packageInfo.author,
        description: packageInfo.description,
        uptime: '2311 second',
        pairingCode: activePairingCode,
        isPairingCodeExpired: isExpired
    });
});

// Endpoint untuk generate pairing code (dari web form)
app.post('/generate-pairing-code', (req, res) => {
    try {
        const { number } = req.body;
        
        if (!number) {
            return res.json({ 
                success: false, 
                message: 'WhatsApp number is required' 
            });
        }

        // Validasi format nomor
        const cleanNumber = number.replace(/\D/g, '');
        if (cleanNumber.length < 10) {
            return res.json({ 
                success: false, 
                message: 'Invalid phone number format' 
            });
        }

        // Generate random pairing code (6 digit)
        const pairingCode = Math.floor(100000 + Math.random() * 900000).toString();
        const timestamp = Date.now();
        
        // Simpan pairing code
        pairingCodes.set(cleanNumber, {
            code: pairingCode,
            timestamp: timestamp,
            number: cleanNumber
        });
        
        activePairingCode = pairingCode;
        pairingCodeTimestamp = timestamp;
        
        console.log(`📱 Pairing code generated for ${cleanNumber}: ${pairingCode}`);
        
        res.json({ 
            success: true, 
            code: pairingCode,
            message: 'Pairing code generated successfully',
            timestamp: new Date(timestamp).toISOString()
        });
        
    } catch (error) {
        console.error('Error generating pairing code:', error);
        res.json({ 
            success: false, 
            message: 'Failed to generate pairing code' 
        });
    }
});

// Endpoint untuk menerima pairing code dari bot WhatsApp
app.get('/set-pairing-code', (req, res) => {
    const code = req.query.code;
    if (code) {
        activePairingCode = code;
        pairingCodeTimestamp = Date.now();
        console.log('🔑 Pairing code received from bot:', code);
        res.json({ 
            success: true, 
            code: code,
            message: 'Pairing code set successfully',
            timestamp: new Date().toISOString()
        });
        
        // Simpan juga di global untuk konsistensi
        global.pairingCode = code;
    } else {
        res.json({ 
            success: false, 
            message: 'No code provided' 
        });
    }
});

// Endpoint untuk get pairing code
app.get('/get-pairing-code', (req, res) => {
    // Check expiration
    const isExpired = pairingCodeTimestamp ? (Date.now() - pairingCodeTimestamp) > 15000 : true;
    
    if (isExpired && activePairingCode) {
        activePairingCode = null;
        pairingCodeTimestamp = null;
    }

    res.json({ 
        success: true, 
        code: activePairingCode,
        isExpired: isExpired,
        timestamp: pairingCodeTimestamp ? new Date(pairingCodeTimestamp).toISOString() : null,
        message: activePairingCode ? 'Pairing code available' : 'No active pairing code'
    });
});

// Endpoint untuk set pairing code (manual)
app.get('/set-pairing-code-manual', (req, res) => {
    const code = req.query.code;
    if (code) {
        activePairingCode = code;
        pairingCodeTimestamp = Date.now();
        console.log('Pairing code set manually:', code);
        res.json({ 
            success: true, 
            code: code,
            message: 'Pairing code set successfully'
        });
    } else {
        res.json({ 
            success: false, 
            message: 'No code provided' 
        });
    }
});

// Endpoint untuk clear pairing code
app.get('/clear-pairing-code', (req, res) => {
    activePairingCode = null;
    pairingCodeTimestamp = null;
    pairingCodes.clear();
    res.json({ 
        success: true, 
        message: 'Pairing code cleared' 
    });
});

// Endpoint untuk list semua pairing codes
app.get('/list-pairing-codes', (req, res) => {
    const codes = Array.from(pairingCodes.entries()).map(([number, data]) => ({
        number: number,
        code: data.code,
        timestamp: new Date(data.timestamp).toISOString(),
        isExpired: (Date.now() - data.timestamp) > 15000
    }));
    
    res.json({ 
        success: true, 
        codes: codes,
        activeCode: activePairingCode,
        activeCodeTimestamp: pairingCodeTimestamp ? new Date(pairingCodeTimestamp).toISOString() : null,
        activeCodeExpired: pairingCodeTimestamp ? (Date.now() - pairingCodeTimestamp) > 15000 : true
    });
});

// Endpoint untuk pairing status
app.get('/pairing-status', (req, res) => {
    const isExpired = pairingCodeTimestamp ? (Date.now() - pairingCodeTimestamp) > 15000 : true;
    
    const status = {
        hasPairingCode: !!activePairingCode,
        pairingCode: activePairingCode,
        isExpired: isExpired,
        timestamp: pairingCodeTimestamp ? new Date(pairingCodeTimestamp).toISOString() : null,
        timeRemaining: pairingCodeTimestamp ? Math.max(0, 15000 - (Date.now() - pairingCodeTimestamp)) : 0,
        totalCodes: pairingCodes.size
    };
    
    res.json({
        success: true,
        ...status
    });
});

// QR code endpoint (placeholder)
app.get('/qr', async (req, res) => {
    try {
        res.setHeader('content-type', 'image/png');
        // QR code akan di-handle oleh bot WhatsApp
        res.end();
    } catch (error) {
        res.status(404).send('QR not available');
    }
});

// Status endpoint
app.get('/status', (req, res) => {
    const isExpired = pairingCodeTimestamp ? (Date.now() - pairingCodeTimestamp) > 15000 : true;
    
    res.json({ 
        status: 'Bot is running', 
        port: PORT,
        pairingCode: activePairingCode,
        pairingCodeExpired: isExpired,
        pairingCodesCount: pairingCodes.size,
        packageInfo: packageInfo,
        timestamp: new Date().toISOString()
    });
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.status(200).json({ 
        status: 'OK', 
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        packageInfo: packageInfo,
        pairingCodeActive: !!activePairingCode
    });
});

// Auto-cleanup expired pairing codes setiap 30 detik
setInterval(() => {
    const now = Date.now();
    let cleanedCount = 0;
    
    // Clean expired codes dari map
    for (let [number, data] of pairingCodes.entries()) {
        if (now - data.timestamp > 15000) { // 15 seconds
            pairingCodes.delete(number);
            cleanedCount++;
        }
    }
    
    // Clean active code jika expired
    if (activePairingCode && pairingCodeTimestamp && (now - pairingCodeTimestamp > 15000)) {
        activePairingCode = null;
        pairingCodeTimestamp = null;
        console.log('🔄 Auto-cleared expired pairing code');
    }
    
    if (cleanedCount > 0) {
        console.log(`🔄 Auto-cleaned ${cleanedCount} expired pairing codes`);
    }
}, 30000);

// Error handling untuk view tidak ditemukan
app.use((err, req, res, next) => {
    if (err.message.includes('Failed to lookup view')) {
        return res.json({
            status: 'Bot is running',
            message: 'Web interface not available, but bot is functional',
            port: PORT,
            pairingCode: activePairingCode,
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
            pairingStatus: '/pairing-status',
            generatePairingCode: 'POST /generate-pairing-code',
            getPairingCode: '/get-pairing-code',
            setPairingCode: '/set-pairing-code?code=YOUR_CODE',
            setPairingCodeManual: '/set-pairing-code-manual?code=YOUR_CODE',
            clearPairingCode: '/clear-pairing-code',
            listPairingCodes: '/list-pairing-codes'
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
    console.log(`🔑 Pairing endpoints:`);
    console.log(`   GET  http://localhost:${PORT}/get-pairing-code`);
    console.log(`   GET  http://localhost:${PORT}/set-pairing-code?code=123456`);
    console.log(`   POST http://localhost:${PORT}/generate-pairing-code`);
    console.log(`   GET  http://localhost:${PORT}/pairing-status`);
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
