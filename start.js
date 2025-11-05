// start.js - File utama untuk start aplikasi
const { app, PORT } = require('./server');

// Cek jika modul ini di-run langsung (bukan di-require)
if (require.main === module) {
    startServer();
} else {
    // Jika di-require oleh modul lain, hanya ekspor fungsi
    module.exports = { startServer };
}

function startServer() {
    // Start server HANYA di sini
    const server = app.listen(PORT, () => {
        console.log(`🚀 App running on port ${PORT}`);
        console.log(`📱 Access your bot at: http://localhost:${PORT}`);
    }).on('error', (err) => {
        if (err.code === 'EADDRINUSE') {
            console.log(`❌ Port ${PORT} is already in use. Trying alternative port...`);
            // Coba port alternatif
            const alternativePort = PORT + 1;
            const altServer = app.listen(alternativePort, () => {
                console.log(`🚀 App running on alternative port ${alternativePort}`);
                console.log(`📱 Access your bot at: http://localhost:${alternativePort}`);
            });
            setupGracefulShutdown(altServer);
        } else {
            console.error('❌ Server error:', err);
            process.exit(1);
        }
    });

    setupGracefulShutdown(server);
}

function setupGracefulShutdown(server) {
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
        server.close(() => {
            process.exit(1);
        });
    });

    process.on('unhandledRejection', (reason, promise) => {
        console.error('Unhandled Rejection at:', promise, 'reason:', reason);
        server.close(() => {
            process.exit(1);
        });
    });
}

// Jika file ini di-run langsung, jalankan server
if (require.main === module) {
    startServer();
}
