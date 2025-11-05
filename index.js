require('./settings');
const fs = require('fs');
const os = require('os');
const pino = require('pino');
const path = require('path');
const axios = require('axios');
const chalk = require('chalk');
const readline = require('readline');
const { Boom } = require('@hapi/boom');
const qrcode = require('qrcode-terminal');
const NodeCache = require('node-cache');
const { toBuffer, toDataURL } = require('qrcode');
const { exec, spawn, execSync } = require('child_process');
const { parsePhoneNumber } = require('awesome-phonenumber');
const { default: WAConnection, useMultiFileAuthState, Browsers, DisconnectReason, makeInMemoryStore, makeCacheableSignalKeyStore, fetchLatestBaileysVersion, proto, jidNormalizedUser, getAggregateVotesInPollMessage } = require('baileys');

const { dataBase } = require('./src/database');
const { app, server, PORT } = require('./src/server');
const { GroupParticipantsUpdate, MessagesUpsert, Solving } = require('./src/message');
const { isUrl, generateMessageTag, getBuffer, getSizeMedia, fetchJson, assertInstalled, sleep } = require('./lib/function');

const print = (label, value) => console.log(`${chalk.green.bold('║')} ${chalk.cyan.bold(label.padEnd(16))}${chalk.yellow.bold(':')} ${value}`);
const pairingCode = process.argv.includes('--qr') ? false : process.argv.includes('--pairing-code') || global.pairing_code;
const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
const question = (text) => new Promise((resolve) => rl.question(text, resolve))
let pairingStarted = false;
let phoneNumber;

// Global variables untuk pairing code
global.pairingCode = null;
global.lastPairingTime = null;

const userInfoSyt = () => {
	try {
		return os.userInfo().username
	} catch (e) {
		return process.env.USER || process.env.USERNAME || 'unknown';
	}
}

global.fetchApi = async (path = '/', query = {}, options) => {
	const urlnya = (options?.name || options ? ((options?.name || options) in global.APIs ? global.APIs[(options?.name || options)] : (options?.name || options)) : global.APIs['hitori'] ? global.APIs['hitori'] : (options?.name || options)) + path + (query ? '?' + decodeURIComponent(new URLSearchParams(Object.entries({ ...query }))) : '')
	const { data } = await axios.get(urlnya, { ...((options?.name || options) ? {} : { headers: { 'accept': 'application/json', 'x-api-key': global.APIKeys[global.APIs['hitori']]}})})
	return data
}

const storeDB = dataBase(global.tempatStore);
const database = dataBase(global.tempatDB);
const msgRetryCounterCache = new NodeCache();

assertInstalled(process.platform === 'win32' ? 'where ffmpeg' : 'command -v ffmpeg', 'FFmpeg', 0);
console.log(chalk.greenBright('✅  All external dependencies are satisfied'));
console.log(chalk.green.bold(`╔═════[${`${chalk.cyan(userInfoSyt())}@${chalk.cyan(os.hostname())}`}]═════`));
print('OS', `${os.platform()} ${os.release()} ${os.arch()}`);
print('Uptime', `${Math.floor(os.uptime() / 3600)} h ${Math.floor((os.uptime() % 3600) / 60)} m`);
print('Shell', process.env.SHELL || process.env.COMSPEC || 'unknown');
print('CPU', os.cpus()[0]?.model.trim() || 'unknown');
print('Memory', `${(os.freemem()/1024/1024).toFixed(0)} MiB / ${(os.totalmem()/1024/1024).toFixed(0)} MiB`);
print('Script version', `v${require('./package.json').version}`);
print('Node.js', process.version);
print('Baileys', `v${require('./package.json').dependencies.baileys}`);
print('Date & Time', new Date().toLocaleString('en-US', { timeZone: 'Asia/Jakarta', hour12: false }));
console.log(chalk.green.bold('╚' + ('═'.repeat(30))));
server.listen(PORT, () => {
	console.log('App listened on port', PORT);
});

/*
	* Create By Naze
	* Follow https://github.com/nazedev
	* Whatsapp : https://whatsapp.com/channel/0029VaWOkNm7DAWtkvkJBK43
*/

async function startNazeBot() {
	const { state, saveCreds } = await useMultiFileAuthState('nazedev');
	const { version, isLatest } = await fetchLatestBaileysVersion();
	const level = pino({ level: 'silent' });
	
	try {
		const loadData = await database.read()
		const storeLoadData = await storeDB.read()
		if (!loadData || Object.keys(loadData).length === 0) {
			global.db = {
				hit: {},
				set: {},
				cmd: {},
				store: {},
				users: {},
				game: {},
				groups: {},
				database: {},
				premium: [],
				sewa: [],
				...(loadData || {}),
			}
			await database.write(global.db)
		} else {
			global.db = loadData
		}
		if (!storeLoadData || Object.keys(storeLoadData).length === 0) {
			global.store = {
				contacts: {},
				presences: {},
				messages: {},
				groupMetadata: {},
				...(storeLoadData || {}),
			}
			await storeDB.write(global.store)
		} else {
			global.store = storeLoadData
		}
		
		setInterval(async () => {
			if (global.db) await database.write(global.db)
			if (global.store) await storeDB.write(global.store)
		}, 30 * 1000)
	} catch (e) {
		console.log(e)
		process.exit(1)
	}
	
	store.loadMessage = function (remoteJid, id) {
		const messages = store.messages?.[remoteJid]?.array;
		if (!messages) return null;
		return messages.find(msg => msg?.key?.id === id) || null;
	}
	
	const getMessage = async (key) => {
		if (store) {
			const msg = await store.loadMessage(key.remoteJid, key.id);
			return msg?.message || ''
		}
		return {
			conversation: 'Halo Saya Naze Bot'
		}
	}
	
	const naze = WAConnection({
		logger: level,
		getMessage,
		syncFullHistory: true,
		maxMsgRetryCount: 15,
		msgRetryCounterCache,
		retryRequestDelayMs: 10,
		defaultQueryTimeoutMs: 0,
		connectTimeoutMs: 60000,
		browser: Browsers.ubuntu('Chrome'),
		generateHighQualityLinkPreview: true,
		shouldSyncHistoryMessage: msg => {
			console.log(`\x1b[32mMemuat Chat [${msg.progress || 0}%]\x1b[39m`);
			return !!msg.syncType;
		},
		transactionOpts: {
			maxCommitRetries: 10,
			delayBetweenTriesMs: 10,
		},
		appStateMacVerification: {
			patch: true,
			snapshot: true,
		},
		auth: {
			creds: state.creds,
			keys: makeCacheableSignalKeyStore(state.keys, level),
		},
	})
	
	// Auto-set phone number jika tersedia di config
	if (pairingCode && !phoneNumber && !naze.authState.creds.registered) {
		if (global.number_bot) {
			phoneNumber = global.number_bot.replace(/[^0-9]/g, '');
			console.log(chalk.blue('📱 Using bot number from config:'), chalk.green(phoneNumber));
		} else {
			async function getPhoneNumber() {
				phoneNumber = process.env.BOT_NUMBER || await question('Please type your WhatsApp number : ');
				phoneNumber = phoneNumber.replace(/[^0-9]/g, '')
				
				if (!parsePhoneNumber('+' + phoneNumber).valid && phoneNumber.length < 6) {
					console.log(chalk.bgBlack(chalk.redBright('Start with your Country WhatsApp code') + chalk.whiteBright(',') + chalk.greenBright(' Example : 62xxx')));
					await getPhoneNumber()
				}
			}
			await getPhoneNumber();
		}
		
		if (phoneNumber) {
			console.log('Phone number captured. Waiting for Connection...\n' + chalk.blueBright('Estimated time: around 2 ~ 5 minutes'));
		}
	}

	await Solving(naze, store)
	
	naze.ev.on('creds.update', saveCreds)
	
	// Pairing Code Handler - VERSI DIPERBAIKI
	naze.ev.on('connection.update', async (update) => {
		const { qr, connection, lastDisconnect, isNewLogin, receivedPendingNotifications } = update;
		
		if (!naze.authState.creds.registered) {
			console.log('Connection: ', connection || false);
		}

		// GENERATE PAIRING CODE - LOGIC YANG DIPERBAIKI
		if ((connection === 'connecting' || connection === 'open') && 
			pairingCode && 
			phoneNumber && 
			!naze.authState.creds.registered && 
			!pairingStarted) {
			
			pairingStarted = true;
			console.log(chalk.blue('🔑 Starting pairing code process...'));
			
			setTimeout(async () => {
				try {
					console.log(chalk.blue('📞 Requesting pairing code from WhatsApp...'));
					let code = await naze.requestPairingCode(phoneNumber);
					
					if (code) {
						console.log(chalk.green('✅ Pairing Code Generated:'), chalk.bold.white(code));
						console.log(chalk.yellow('⏰ Expires in 15 seconds'));
						
						// Simpan di global variable
						global.pairingCode = code;
						global.lastPairingTime = Date.now();
						
						// Kirim ke web server
						try {
							const response = await axios.get(`http://localhost:${PORT}/set-pairing-code?code=${code}`, {
								timeout: 3000
							});
							
							if (response.data && response.data.success) {
								console.log(chalk.green('🌐 Pairing code sent to web interface successfully'));
								
								// Juga kirim ke endpoint generate untuk web form
								try {
									await axios.post(`http://localhost:${PORT}/generate-pairing-code`, {
										number: phoneNumber,
										code: code
									}, {
										timeout: 2000
									});
								} catch (e) {
									// Ignore error untuk endpoint ini
								}
							} else {
								console.log(chalk.yellow('⚠️  Web server responded but failed to save pairing code'));
							}
						} catch (webError) {
							console.log(chalk.yellow('⚠️  Web server not available, but pairing code is ready:'), chalk.bold.green(code));
							console.log(chalk.yellow('   Use this code in your WhatsApp app to pair your device'));
						}
					}
				} catch (error) {
					console.log(chalk.red('❌ Failed to generate pairing code:'), error.message);
					console.log(chalk.yellow('🔄 Retrying in 10 seconds...'));
					pairingStarted = false; // Reset untuk coba lagi
					
					setTimeout(() => {
						if (!naze.authState.creds.registered) {
							pairingStarted = false;
						}
					}, 10000);
				}
			}, 3000);
		}
		
		if (connection === 'close') {
			const reason = new Boom(lastDisconnect?.error)?.output.statusCode
			if (reason === DisconnectReason.connectionLost) {
				console.log('Connection to Server Lost, Attempting to Reconnect...');
				startNazeBot()
			} else if (reason === DisconnectReason.connectionClosed) {
				console.log('Connection closed, Attempting to Reconnect...');
				startNazeBot()
			} else if (reason === DisconnectReason.restartRequired) {
				console.log('Restart Required...');
				startNazeBot()
			} else if (reason === DisconnectReason.timedOut) {
				console.log('Connection Timed Out, Attempting to Reconnect...');
				startNazeBot()
			} else if (reason === DisconnectReason.badSession) {
				console.log('Delete Session and Scan again...');
				startNazeBot()
			} else if (reason === DisconnectReason.connectionReplaced) {
				console.log('Close current Session first...');
			} else if (reason === DisconnectReason.loggedOut) {
				console.log('Scan again and Run...');
				exec('rm -rf ./nazedev/*')
				process.exit(1)
			} else if (reason === DisconnectReason.forbidden) {
				console.log('Connection Failure, Scan again and Run...');
				exec('rm -rf ./nazedev/*')
				process.exit(1)
			} else if (reason === DisconnectReason.multideviceMismatch) {
				console.log('Scan again...');
				exec('rm -rf ./nazedev/*')
				process.exit(0)
			} else {
				naze.end(`Unknown DisconnectReason : ${reason}|${connection}`)
			}
		}
		
		if (connection == 'open') {
			console.log('Connected to : ' + JSON.stringify(naze.user, null, 2));
			let botNumber = await naze.decodeJid(naze.user.id);
			if (global.db?.set[botNumber] && !global.db?.set[botNumber]?.join) {
				if (my.ch.length > 0 && my.ch.includes('@newsletter')) {
					if (my.ch) await naze.newsletterMsg(my.ch, { type: 'follow' }).catch(e => {})
					db.set[botNumber].join = true
				}
			}
			
			// Clear pairing code setelah berhasil connect
			if (global.pairingCode) {
				console.log(chalk.green('✅ Connection established, clearing pairing code'));
				global.pairingCode = null;
				global.lastPairingTime = null;
				
				// Clear pairing code di web server juga
				try {
					await axios.get(`http://localhost:${PORT}/clear-pairing-code`, {
						timeout: 2000
					});
				} catch (e) {
					// Ignore error
				}
			}
		}
		
		if (qr) {
			if (!pairingCode) {
				qrcode.generate(qr, { small: true })
			}
			app.use('/qr', async (req, res) => {
				res.setHeader('content-type', 'image/png')
				res.end(await toBuffer(qr))
			});
		}
		
		if (isNewLogin) console.log(chalk.green('New device login detected...'))
		if (receivedPendingNotifications == 'true') {
			console.log('Please wait About 1 Minute...')
			naze.ev.flush()
		}
	});
	
	// Debug pairing code status setiap 15 detik
	const pairingDebugInterval = setInterval(() => {
		if (pairingCode && phoneNumber && !naze?.authState?.creds?.registered) {
			console.log(chalk.blue('🔍 Pairing Debug:'), 
				'Number:', phoneNumber, 
				'| Started:', pairingStarted,
				'| Registered:', naze.authState.creds.registered,
				'| Code:', global.pairingCode || 'None'
			);
		}
		
		// Clear interval jika sudah terdaftar
		if (naze.authState.creds.registered) {
			clearInterval(pairingDebugInterval);
		}
	}, 15000);
	
	naze.ev.on('contacts.update', (update) => {
		for (let contact of update) {
			let trueJid;
			if (!trueJid) continue;
			if (contact.id.endsWith('@lid')) {
				trueJid = naze.findJidByLid(contact.id, store);
			} else {
				trueJid = jidNormalizedUser(contact.id);
			}
			store.contacts[trueJid] = {
				...store.contacts[trueJid],
				id: trueJid,
				name: contact.notify
			}
			if (contact.id.endsWith('@lid')) {
				store.contacts[trueJid].lid = jidNormalizedUser(contact.id);
			}
		}
	});
	
	naze.ev.on('call', async (call) => {
		let botNumber = await naze.decodeJid(naze.user.id);
		if (global.db?.set[botNumber]?.anticall) {
			for (let id of call) {
				if (id.status === 'offer') {
					let msg = await naze.sendMessage(id.from, { text: `Saat Ini, Kami Tidak Dapat Menerima Panggilan ${id.isVideo ? 'Video' : 'Suara'}.\nJika @${id.from.split('@')[0]} Memerlukan Bantuan, Silakan Hubungi Owner :)`, mentions: [id.from]});
					await naze.sendContact(id.from, global.owner, msg);
					await naze.rejectCall(id.id, id.from)
				}
			}
		}
	});
	
	naze.ev.on('messages.upsert', async (message) => {
		await MessagesUpsert(naze, message, store);
	});
	
	naze.ev.on('group-participants.update', async (update) => {
		await GroupParticipantsUpdate(naze, update, store);
	});
	
	naze.ev.on('groups.update', (update) => {
		for (const n of update) {
			if (store.groupMetadata[n.id]) {
				Object.assign(store.groupMetadata[n.id], n);
			} else store.groupMetadata[n.id] = n;
		}
	});
	
	naze.ev.on('presence.update', ({ id, presences: update }) => {
		store.presences[id] = store.presences?.[id] || {};
		Object.assign(store.presences[id], update);
	});
	
	setInterval(async () => {
		if (naze?.user?.id) await naze.sendPresenceUpdate('available', naze.decodeJid(naze.user.id)).catch(e => {})
	}, 10 * 60 * 1000);

	return naze
}

startNazeBot()

// Process Exit
const cleanup = async (signal) => {
	console.log(`Received ${signal}. Menyimpan database...`)
	if (global.db) await database.write(global.db)
	if (global.store) await storeDB.write(global.store)
	server.close(() => {
		console.log('Server closed. Exiting...')
		process.exit(0)
	})
}

process.on('SIGINT', () => cleanup('SIGINT'))
process.on('SIGTERM', () => cleanup('SIGTERM'))
process.on('exit', () => cleanup('exit'))

server.on('error', (error) => {
	if (error.code === 'EADDRINUSE') {
		console.log(`Address localhost:${PORT} in use. Please retry when the port is available!`);
		server.close();
	} else console.error('Server error:', error);
});

setInterval(() => {}, 1000 * 60 * 10);
let file = require.resolve(__filename)
fs.watchFile(file, () => {
	fs.unwatchFile(file)
	console.log(chalk.redBright(`Update ${__filename}`))
	delete require.cache[file]
	require(file)
});
