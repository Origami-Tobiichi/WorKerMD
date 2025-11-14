const SecurityManager = require('./security');

class RequestManager {
    constructor() {
        this.security = new SecurityManager();
        this.requestQueue = [];
        this.isProcessing = false;
        this.consecutiveFailures = 0;
        this.maxConsecutiveFailures = 3;
    }

    // Queue system untuk menghindari spam
    async addToQueue(requestFunc, priority = 1) {
        return new Promise((resolve, reject) => {
            this.requestQueue.push({ requestFunc, priority, resolve, reject });
            if (!this.isProcessing) {
                this.processQueue();
            }
        });
    }

    async processQueue() {
        if (this.isProcessing || this.requestQueue.length === 0) return;
        
        this.isProcessing = true;
        
        // Sort by priority (higher number = higher priority)
        this.requestQueue.sort((a, b) => b.priority - a.priority);
        
        while (this.requestQueue.length > 0) {
            const { requestFunc, resolve, reject } = this.requestQueue.shift();
            
            try {
                await this.security.humanDelay(500, 1500); // Delay antar request
                const result = await requestFunc();
                resolve(result);
            } catch (error) {
                reject(error);
            }
            
            // Delay tambahan untuk request berikutnya
            if (this.requestQueue.length > 0) {
                await this.security.humanDelay(1000, 3000);
            }
        }
        
        this.isProcessing = false;
    }

    // Make secure request dengan queue system
    async makeSecureRequest(url, options = {}) {
        const requestFunc = async () => {
            try {
                await this.security.humanDelay(300, 1200);

                const axiosInstance = this.security.createSecureAxiosInstance(options.headers);
                
                const config = {
                    url,
                    method: options.method || 'GET',
                    data: options.data,
                    params: options.params,
                    timeout: options.timeout || 30000,
                    ...options
                };

                // Encrypt data jika diperlukan
                if (config.data && global.security?.requestEncryption) {
                    config.data = this.security.encryptData(config.data);
                }

                const response = await axiosInstance(config);
                
                // Decrypt response jika diperlukan
                let responseData = response.data;
                if (responseData && responseData.encrypted) {
                    responseData = this.security.decryptData(responseData);
                }

                this.consecutiveFailures = 0; // Reset failure count
                return responseData;

            } catch (error) {
                this.consecutiveFailures++;
                
                if (this.consecutiveFailures >= this.maxConsecutiveFailures) {
                    console.log('🚨 Multiple consecutive failures, taking a longer break...');
                    await this.security.humanDelay(5000, 10000);
                    this.consecutiveFailures = 0;
                }

                throw error;
            }
        };

        return this.addToQueue(requestFunc, options.priority || 1);
    }

    // Optimized request untuk WhatsApp API
    async makeWhatsAppRequest(endpoint, data = {}, options = {}) {
        const whatsappHeaders = this.security.generateWhatsAppHeaders();
        
        return this.makeSecureRequest(endpoint, {
            method: 'POST',
            headers: whatsappHeaders,
            data: data,
            timeout: 20000,
            priority: 2, // Higher priority for WhatsApp requests
            ...options
        });
    }

    // Batch requests untuk mengurangi frequency
    async batchRequests(requests, batchSize = 2, delayBetweenBatches = 2000) {
        const results = [];
        
        for (let i = 0; i < requests.length; i += batchSize) {
            const batch = requests.slice(i, i + batchSize);
            const batchPromises = batch.map(req => 
                this.makeSecureRequest(req.url, { ...req.options, priority: 0 }) // Lower priority for batch
            );
            
            const batchResults = await Promise.allSettled(batchPromises);
            results.push(...batchResults);
            
            // Delay antara batch
            if (i + batchSize < requests.length) {
                await this.security.humanDelay(delayBetweenBatches, delayBetweenBatches + 1000);
            }
        }
        
        return results;
    }

    // Health check untuk koneksi
    async healthCheck() {
        try {
            const testUrls = [
                'https://api64.ipify.org?format=json',
                'https://httpbin.org/ip',
                'https://jsonip.com'
            ];

            for (const url of testUrls) {
                try {
                    const response = await this.makeSecureRequest(url, { timeout: 10000 });
                    console.log(`✅ Health check passed: ${url}`);
                    return true;
                } catch (error) {
                    console.log(`⚠️ Health check failed for ${url}: ${error.message}`);
                }
            }
            
            return false;
        } catch (error) {
            console.log('❌ Health check completely failed');
            return false;
        }
    }

    // Cleanup resources
    cleanup() {
        this.requestQueue = [];
        this.isProcessing = false;
        this.consecutiveFailures = 0;
    }
}

module.exports = RequestManager;