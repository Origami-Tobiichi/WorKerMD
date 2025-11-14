class BehaviorManager {
    constructor() {
        this.lastActionTime = Date.now();
        this.activityPattern = [];
        this.isActive = false;
        this.behaviorInterval = null;
        this.typingStates = new Map();
        this.readingStates = new Map();
    }

    // Simulasi pola aktivitas manusia yang kompleks
    generateHumanPattern() {
        const patterns = [
            { type: 'typing', duration: 1500, pause: 800, probability: 0.3 },
            { type: 'online', duration: 45000, pause: 0, probability: 0.4 },
            { type: 'reading', duration: 7000, pause: 3000, probability: 0.2 },
            { type: 'away', duration: 120000, pause: 0, probability: 0.1 }
        ];

        // Weighted random selection
        const totalProbability = patterns.reduce((sum, pattern) => sum + pattern.probability, 0);
        let random = Math.random() * totalProbability;
        
        for (const pattern of patterns) {
            if (random < pattern.probability) {
                return pattern;
            }
            random -= pattern.probability;
        }
        
        return patterns[0];
    }

    // Update status presence secara acak dengan variasi
    async updateRandomPresence(bot, jid = null) {
        if (!bot || !this.isActive) return;

        const presences = [
            { type: 'available', duration: 30000 },
            { type: 'composing', duration: 5000 },
            { type: 'recording', duration: 3000 },
            { type: 'paused', duration: 10000 }
        ];

        const presence = presences[Math.floor(Math.random() * presences.length)];
        
        try {
            if (jid) {
                await bot.sendPresenceUpdate(presence.type, jid);
            } else {
                await bot.sendPresenceUpdate(presence.type);
            }
            
            // Log hanya sesekali untuk menghindari spam console
            if (Math.random() < 0.1) {
                console.log(`🔄 Updated presence to: ${presence.type}${jid ? ` for ${jid}` : ''}`);
            }
        } catch (error) {
            // Silent fail untuk presence updates
        }
    }

    // Simulasi mengetik untuk percakapan
    async simulateTyping(bot, jid, duration = 2000) {
        if (!bot || !jid) return;

        try {
            await bot.sendPresenceUpdate('composing', jid);
            this.typingStates.set(jid, Date.now());

            // Auto stop typing setelah duration
            setTimeout(async () => {
                if (this.typingStates.get(jid) === Date.now() - duration) {
                    await bot.sendPresenceUpdate('paused', jid);
                    this.typingStates.delete(jid);
                }
            }, duration);

        } catch (error) {
            // Silent fail untuk typing simulation
        }
    }

    // Mulai simulasi perilaku manusia yang advanced
    startHumanBehavior(bot) {
        if (this.isActive) return;
        
        this.isActive = true;
        console.log('👤 Starting advanced human behavior simulation...');

        this.behaviorInterval = setInterval(async () => {
            if (!this.isActive || !bot) {
                clearInterval(this.behaviorInterval);
                return;
            }

            const pattern = this.generateHumanPattern();
            
            switch (pattern.type) {
                case 'typing':
                    // Pilih random chat untuk simulasi typing
                    const chats = Object.keys(bot.chats || {});
                    if (chats.length > 0) {
                        const randomChat = chats[Math.floor(Math.random() * chats.length)];
                        await this.simulateTyping(bot, randomChat, pattern.duration);
                    }
                    break;
                    
                case 'online':
                    await this.updateRandomPresence(bot);
                    break;
                    
                case 'reading':
                    // Simulasi membaca pesan dengan delay acak
                    await new Promise(resolve => setTimeout(resolve, pattern.duration));
                    break;
                    
                case 'away':
                    await bot.sendPresenceUpdate('unavailable');
                    break;
            }

            // Random delay antara pattern
            const randomDelay = pattern.pause + Math.random() * 5000;
            await new Promise(resolve => setTimeout(resolve, randomDelay));
            
        }, 45000 + Math.random() * 90000); // Random interval 45-135 detik

        // Additional random presence updates
        setInterval(async () => {
            if (this.isActive && bot) {
                await this.updateRandomPresence(bot);
            }
        }, 120000 + Math.random() * 120000); // Every 2-4 minutes
    }

    // Stop simulasi perilaku
    stopHumanBehavior() {
        this.isActive = false;
        if (this.behaviorInterval) {
            clearInterval(this.behaviorInterval);
            this.behaviorInterval = null;
        }
        this.typingStates.clear();
        this.readingStates.clear();
        console.log('👤 Stopped human behavior simulation');
    }

    // Validasi input untuk mencegah spam dengan pattern detection
    validateInput(input, type = 'general') {
        if (!input || typeof input !== 'string') return false;

        const maxLengths = {
            general: 1000,
            phone: 20,
            name: 100,
            message: 4000,
            command: 50
        };

        const maxLength = maxLengths[type] || maxLengths.general;
        if (input.length > maxLength) {
            console.log(`⚠️ Input too long: ${input.length} characters`);
            return false;
        }

        // Advanced spam pattern detection
        const spamPatterns = {
            general: [
                { pattern: /(\w)\1{8,}/, description: 'Repeated characters' }, // Karakter berulang
                { pattern: /[^\w\s\d.,!?@#$%^&*()\-_+=:;'"<>\/\\|{}\[\]`~\n]/gi, description: 'Special characters' }, // Karakter khusus
                { pattern: /(http|https|ftp|www\.)/gi, description: 'URLs' }, // URL
                { pattern: /(\b\w+\b)(?:\s+\1){2,}/, description: 'Repeated words' }, // Kata berulang
                { pattern: /[\u{1F600}-\u{1F64F}]/gu, threshold: 10, description: 'Too many emojis' }, // Emoji berlebihan
                { pattern: /[A-Z]{5,}/, description: 'All caps words' } // KATA BESAR
            ],
            phone: [
                { pattern: /[^\d+]/, description: 'Non-digit characters' },
                { pattern: /^[+]?[1-9]\d{0,14}$/, inverse: true, description: 'Invalid phone format' }
            ],
            message: [
                { pattern: /^(.{50,}?){10,}/, description: 'Long text without spaces' },
                { pattern: /[\u{1F600}-\u{1F64F}]/gu, threshold: 15, description: 'Too many emojis' }
            ]
        };

        const patterns = spamPatterns[type] || spamPatterns.general;
        let spamScore = 0;

        for (const { pattern, threshold = 1, inverse = false, description } of patterns) {
            const matches = input.match(pattern);
            if (matches) {
                if (inverse) {
                    spamScore += 10; // High score for inverse patterns
                    console.log(`🚨 Spam detected (${description}): ${input.substring(0, 50)}...`);
                    return false;
                }
                
                const matchCount = matches.length;
                if (matchCount >= threshold) {
                    spamScore += matchCount;
                    console.log(`⚠️ Suspicious pattern (${description}): ${matchCount} matches`);
                }
            }
        }

        // Threshold untuk deteksi spam
        const spamThresholds = {
            general: 5,
            message: 8,
            command: 2
        };

        if (spamScore >= (spamThresholds[type] || spamThresholds.general)) {
            console.log(`🚨 High spam score: ${spamScore} for input: ${input.substring(0, 50)}...`);
            return false;
        }

        return true;
    }

    // Analisis pattern pesan untuk deteksi spam yang lebih baik
    analyzeMessagePattern(messages) {
        if (!Array.isArray(messages) || messages.length < 3) return { isSuspicious: false, reason: '' };

        const recentMessages = messages.slice(-5); // Ambil 5 pesan terakhir
        const patterns = {
            sameLength: 0,
            sameTimeInterval: 0,
            similarContent: 0
        };

        for (let i = 1; i < recentMessages.length; i++) {
            const current = recentMessages[i];
            const previous = recentMessages[i - 1];

            // Cek panjang pesan yang sama
            if (current.length === previous.length) {
                patterns.sameLength++;
            }

            // Cek interval waktu (jika tersedia timestamp)
            if (current.timestamp && previous.timestamp) {
                const timeDiff = Math.abs(current.timestamp - previous.timestamp);
                if (timeDiff < 2000) { // Kurang dari 2 detik
                    patterns.sameTimeInterval++;
                }
            }

            // Cek konten yang similar (sederhana)
            if (current.substring(0, 10) === previous.substring(0, 10)) {
                patterns.similarContent++;
            }
        }

        // Hitung skor suspicious
        let suspiciousScore = 0;
        if (patterns.sameLength >= 3) suspiciousScore += 2;
        if (patterns.sameTimeInterval >= 3) suspiciousScore += 3;
        if (patterns.similarContent >= 2) suspiciousScore += 2;

        return {
            isSuspicious: suspiciousScore >= 4,
            reason: suspiciousScore >= 4 ? 'Repetitive message pattern detected' : '',
            score: suspiciousScore,
            patterns
        };
    }
}

module.exports = BehaviorManager;