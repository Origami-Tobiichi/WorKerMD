const path = require('path');
const { spawn } = require('child_process');

// Safe chalk
let chalk;
try {
    chalk = require('chalk');
} catch (error) {
    chalk = { 
        red: (t) => t, 
        yellow: (t) => t, 
        green: (t) => t, 
        blue: (t) => t, 
        bold: (t) => t 
    };
}

function start() {
    let args = [path.join(__dirname, 'index.js'), ...process.argv.slice(2)];
    
    console.log(chalk.blue('🚀 Starting WhatsApp Bot with Web Dashboard...'));
    console.log(chalk.gray('   Using args:'), args.join(' '));
    
    let p = spawn(process.argv[0], args, {
        stdio: ['inherit', 'inherit', 'inherit', 'ipc']
    }).on('message', data => {
        if (data === 'reset') {
            console.log(chalk.yellow('[BOT] Restarting...'));
            p.kill();
            start();
        } else if (data === 'uptime') {
            p.send(process.uptime());
        }
    }).on('exit', (code, signal) => {
        console.log(chalk.yellow(`[BOT] Process exited with code: ${code}, signal: ${signal}`));
        
        if (code !== 0 && code !== null) {
            console.error(chalk.red(`[BOT] Exited with error code: ${code}`));
            console.log(chalk.yellow('[BOT] Restarting in 3 seconds...'));
            setTimeout(start, 3000);
        } else if (code === 0) {
            console.log(chalk.green('[BOT] Process exited cleanly. Goodbye!'));
            process.exit(0);
        } else {
            console.log(chalk.yellow('[BOT] Restarting in 3 seconds...'));
            setTimeout(start, 3000);
        }
    }).on('error', err => {
        console.error(chalk.red('[BOT] Spawn error:'), err);
        console.log(chalk.yellow('[BOT] Restarting in 5 seconds...'));
        setTimeout(start, 5000);
    });
}

// Safe error handlers
process.on('uncaughtException', (err) => {
    console.error('❌ Uncaught Exception:', err.message);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ Unhandled Rejection at:', promise);
});

process.on('SIGINT', () => {
    console.log('\n🛑 Received SIGINT. Shutting down gracefully...');
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('\n🛑 Received SIGTERM. Shutting down gracefully...');
    process.exit(0);
});

// Start the application
console.log(chalk.green('🚀 Starting application...'));
start();