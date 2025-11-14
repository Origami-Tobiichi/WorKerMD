const axios = require('axios');
const { SocksProxyAgent } = require('socks-proxy-agent');
const { HttpsProxyAgent } = require('https-proxy-agent');
const crypto = require('crypto');

class SecurityManager {
    constructor() {
        this.userAgents = this.generateUserAgents();
        this.proxyList = [];
        this.currentProxyIndex = 0;
        this.proxyEnabled = false;
        this.requestTimestamps = [];
        this.maxRequestsPerMinute = global.security?.maxRequestsPerMinute || 30;
        this.consecutiveFailures = 0;
        this.maxConsecutiveFailures = global.security?.maxConsecutiveFailures || 3;
    }

    generateUserAgents() {
        const androidVersions = ['10', '11', '12', '13', '14'];
        const chromeVersions = [
            '91.0.4472.114', '92.0.4515.107', '93.0.4577.82', 
            '94.0.4606.81', '95.0.4638.50', '96.0.4664.45',
            '97.0.4692.99', '98.0.4758.101', '99.0.4844.51',
            '100.0.4896.127', '101.0.4951.64', '102.0.5005.115'
        ];
        
        const devices = [
            { model: 'SM-G973F', name: 'Samsung Galaxy S10' },
            { model: 'SM-G998B', name: 'Samsung Galaxy S21' },
            { model: 'SM-S918B', name: 'Samsung Galaxy S23' },
            { model: 'Pixel 5', name: 'Google Pixel 5' },
            { model: 'Pixel 6', name: 'Google Pixel 6' },
            { model: 'Pixel 7', name: 'Google Pixel 7' },
            { model: 'Mi 11', name: 'Xiaomi Mi 11' },
            { model: 'Redmi Note 11', name: 'Xiaomi Redmi Note 11' },
            { model: 'XQ-AT52', name: 'Sony Xperia 1 II' }
        ];

        const userAgents = devices.map(device => {
            const androidVersion = androidVersions[Math.floor(Math.random() * androidVersions.length)];
            const chromeVersion = chromeVersions[Math.floor(Math.random() * chromeVersions.length)];
            
            return `Mozilla/5.0 (Linux; Android ${androidVersion}; ${device.model}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${chromeVersion} Mobile Safari/537.36`;
        });

        // Tambahkan desktop user agents
        userAgents.push(
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
            'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        );

        return userAgents;
    }

    // Generate random headers untuk setiap request
    generateHeaders() {
        const userAgent = this.userAgents[Math.floor(Math.random() * this.userAgents.length)];
        
        return {
            'User-Agent': userAgent,
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/avif,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.5',
            'Accept-Encoding': 'gzip, deflate, br',
            'Connection': 'keep-alive',
            'Upgrade-Insecure-Requests': '1',
            'Sec-Fetch-Dest': 'document',
            'Sec-Fetch-Mode': 'navigate',
            'Sec-Fetch-Site': 'none',
            'Sec-Fetch-User': '?1',
            'Cache-Control': 'max-age=0',
            'TE': 'Trailers',
            'DNT': Math.random() > 0.5 ? '1' : '0',
            'Sec-GPC': '1',
            'Viewport-Width': Math.random() > 0.5 ? '384' : '412',
            'Width': Math.random() > 0.5 ? '384' : '412'
        };
    }

    // Generate WhatsApp-specific headers
    generateWhatsAppHeaders() {
        const whatsappVersions = ['2.23.16.77', '2.24.8.78', '2.25.2.84', '2.26.1.75'];
        const androidVersions = ['11', '12', '13'];
        const devices = ['Samsung-Galaxy-S21', 'Google-Pixel-6', 'Xiaomi-Mi-11'];
        
        const version = whatsappVersions[Math.floor(Math.random() * whatsappVersions.length)];
        const android = androidVersions[Math.floor(Math.random() * androidVersions.length)];
        const device = devices[Math.floor(Math.random() * devices.length)];
        
        return {
            'User-Agent': `WhatsApp/${version} Android/${android} Device/${device}`,
            'Accept': 'application/json',
            'Accept-Language': 'en-US',
            'X-Requested-With': 'XMLHttpRequest',
            'Connection': 'keep-alive',
            'Origin': 'https://web.whatsapp.com',
            'Referer': 'https://web.whatsapp.com/',
            'Sec-Fetch-Dest': 'empty',
            'Sec-Fetch-Mode': 'cors',
            'Sec-Fetch-Site': 'same-origin',
            'Content-Type': 'application/json'
        };
    }

    // Load proxy list dari berbagai sumber
    async loadProxyList() {
        if (!global.security?.proxyRotation) {
            console.log('🔧 Proxy rotation disabled in settings');
            return;
        }

        try {
            const proxySources = [
                'https://raw.githubusercontent.com/TheSpeedX/SOCKS-List/master/http.txt',
                'https://raw.githubusercontent.com/ShiftyTR/Proxy-List/master/http.txt',
                'https://raw.githubusercontent.com/hookzof/socks5_list/master/proxy.txt'
            ];

            console.log('🔄 Loading proxy list...');

            for (const source of proxySources) {
                try {
                    const response = await axios.get(source, { 
                        timeout: 15000,
                        headers: this.generateHeaders()
                    });
                    
                    const proxies = response.data.split('\n')
                        .filter(line => line.trim() && !line.startsWith('#') && line.includes(':'))
                        .map(line => {
                            const [host, port] = line.trim().split(':');
                            return { host, port: parseInt(port) };
                        })
                        .filter(proxy => proxy.port > 0 && proxy.port < 65536);
                    
                    this.proxyList = [...this.proxyList, ...proxies];
                    console.log(`✅ Loaded ${proxies.length} proxies from ${source}`);
                } catch (error) {
                    console.log(`⚠️ Failed to load proxy list from: ${source}`);
                }
            }

            if (this.proxyList.length > 0) {
                this.proxyEnabled = true;
                console.log(`🎯 Total proxies loaded: ${this.proxyList.length}`);
            } else {
                console.log('⚠️ No proxies loaded, continuing without proxy');
            }
        } catch (error) {
            console.log('❌ Proxy loading failed, continuing without proxy');
        }
    }

    // Dapatkan proxy berikutnya dengan rotasi
    getNextProxy() {
        if (!this.proxyEnabled || this.proxyList.length === 0) {
            return null;
        }

        this.currentProxyIndex = (this.currentProxyIndex + 1) % this.proxyList.length;
        const proxy = this.proxyList[this.currentProxyIndex];
        
        return `http://${proxy.host}:${proxy.port}`;
    }

    // Buat axios instance dengan konfigurasi keamanan
    createSecureAxiosInstance(customHeaders = null) {
        const headers = customHeaders || this.generateHeaders();
        const proxyUrl = this.getNextProxy();
        
        const config = {
            timeout: 25000,
            headers: headers,
            httpsAgent: proxyUrl ? new HttpsProxyAgent(proxyUrl) : undefined,
            httpAgent: proxyUrl ? new HttpsProxyAgent(proxyUrl) : undefined,
            validateStatus: function (status) {
                return status >= 200 && status < 500;
            }
        };

        const instance = axios.create(config);

        // Interceptor untuk rate limiting
        instance.interceptors.request.use(async (config) => {
            await this.checkRateLimit();
            return config;
        });

        // Interceptor untuk error handling dan rotasi
        instance.interceptors.response.use(
            (response) => {
                this.consecutiveFailures = 0; // Reset failure count
                return response;
            },
            (error) => {
                this.consecutiveFailures++;
                
                if (error.response?.status === 429 || error.code === 'ECONNRESET') {
                    console.log('🔄 Rate limited or connection reset, rotating proxy...');
                    this.getNextProxy(); // Rotasi proxy
                }

                if (this.consecutiveFailures >= this.maxConsecutiveFailures) {
                    console.log('🚨 Multiple consecutive failures, taking a break...');
                    this.consecutiveFailures = 0;
                }

                return Promise.reject(error);
            }
        );

        return instance;
    }

    // Rate limiting checker
    async checkRateLimit() {
        if (!global.security?.rateLimitProtection) return;

        const now = Date.now();
        const oneMinuteAgo = now - 60000;

        // Hapus request yang sudah lewat 1 menit
        this.requestTimestamps = this.requestTimestamps.filter(timestamp => timestamp > oneMinuteAgo);

        // Cek jika melebihi batas
        if (this.requestTimestamps.length >= this.maxRequestsPerMinute) {
            const waitTime = this.requestTimestamps[0] + 60000 - now;
            console.log(`⏳ Rate limit reached, waiting ${Math.ceil(waitTime / 1000)}s`);
            await new Promise(resolve => setTimeout(resolve, waitTime));
        }

        this.requestTimestamps.push(now);
    }

    // Human-like delay untuk menghindari pattern detection
    async humanDelay(min = 800, max = 2500) {
        if (!global.security?.humanBehavior) return;
        
        const delay = Math.floor(Math.random() * (max - min + 1)) + min;
        await new Promise(resolve => setTimeout(resolve, delay));
    }

    // Enkripsi data sensitif
    encryptData(data, key = 'nazebot-secure-key-2024') {
        if (!global.security?.requestEncryption) return data;
        
        try {
            const algorithm = 'aes-256-gcm';
            const iv = crypto.randomBytes(16);
            const cipher = crypto.createCipher(algorithm, key);
            
            let encrypted = cipher.update(JSON.stringify(data), 'utf8', 'hex');
            encrypted += cipher.final('hex');
            
            const authTag = cipher.getAuthTag();
            
            return {
                iv: iv.toString('hex'),
                data: encrypted,
                authTag: authTag.toString('hex'),
                encrypted: true
            };
        } catch (error) {
            console.log('❌ Encryption failed, returning plain data');
            return data;
        }
    }

    // Dekripsi data
    decryptData(encryptedData, key = 'nazebot-secure-key-2024') {
        if (!encryptedData.encrypted) return encryptedData;
        
        try {
            const algorithm = 'aes-256-gcm';
            const decipher = crypto.createDecipher(algorithm, key);
            decipher.setAuthTag(Buffer.from(encryptedData.authTag, 'hex'));
            
            let decrypted = decipher.update(encryptedData.data, 'hex', 'utf8');
            decrypted += decipher.final('utf8');
            
            return JSON.parse(decrypted);
        } catch (error) {
            console.log('❌ Decryption failed, returning encrypted data');
            return encryptedData;
        }
    }

    // Validasi input untuk mencegah injection
    validateInput(input, type = 'general') {
        if (!input || typeof input !== 'string') return false;

        const maxLengths = {
            general: 1000,
            phone: 20,
            name: 100,
            message: 4000
        };

        const maxLength = maxLengths[type] || maxLengths.general;
        if (input.length > maxLength) return false;

        // Pattern detection untuk spam
        const spamPatterns = {
            general: [
                /(\w)\1{10,}/, // Karakter berulang
                /[^\w\s\d.,!?@#$%^&*()\-_+=:;'"<>\/\\|{}\[\]`~]/gi, // Karakter khusus berlebihan
                /(http|https|ftp):\/\/[^\s]+/g, // URL
                /(\b\w+\b)\s+\1\s+\1/ // Kata berulang
            ],
            phone: [
                /[^\d+]/g, // Hanya angka dan +
                /^[+]?[1-9]\d{0,14}$/ // Format nomor internasional
            ],
            message: [
                /(.{100,})/ // Teks sangat panjang tanpa spasi
            ]
        };

        const patterns = spamPatterns[type] || spamPatterns.general;
        for (const pattern of patterns) {
            if (pattern.test(input)) return false;
        }

        return true;
    }

    // Generate fingerprint browser acak
    generateBrowserFingerprint() {
        const screenResolutions = [
            '360x640', '375x667', '412x732', '414x736', 
            '390x844', '393x851', '412x915', '428x926'
        ];
        
        const timezones = [
            'Asia/Jakarta', 'Asia/Singapore', 'Asia/Bangkok',
            'Asia/Manila', 'Asia/Ho_Chi_Minh', 'Asia/Kuala_Lumpur'
        ];

        return {
            screenResolution: screenResolutions[Math.floor(Math.random() * screenResolutions.length)],
            timezone: timezones[Math.floor(Math.random() * timezones.length)],
            language: 'en-US',
            platform: 'Linux armv8l',
            hardwareConcurrency: Math.floor(Math.random() * 4) + 2,
            deviceMemory: Math.floor(Math.random() * 4) + 2
        };
    }
}

module.exports = SecurityManager;