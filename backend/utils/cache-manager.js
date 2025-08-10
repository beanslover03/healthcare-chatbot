// backend/services/utils/cache-manager.js
// Simple in-memory cache manager with TTL support

const cacheConfig = require('../../config/cache-config');

class CacheManager {
    constructor() {
        this.cache = new Map();
        this.timers = new Map();
        
        // Start cleanup interval
        this.startCleanup();
    }

    async get(key) {
        const item = this.cache.get(key);
        
        if (!item) {
            return null;
        }

        // Check if expired
        if (Date.now() > item.expiresAt) {
            this.delete(key);
            return null;
        }

        // Update access time
        item.lastAccessed = Date.now();
        return item.data;
    }

    async set(key, data, ttl = cacheConfig.timeouts.default || 1800000) {
        const expiresAt = Date.now() + ttl;
        
        // Clear existing timer if any
        if (this.timers.has(key)) {
            clearTimeout(this.timers.get(key));
        }

        // Set the cache item
        this.cache.set(key, {
            data,
            createdAt: Date.now(),
            lastAccessed: Date.now(),
            expiresAt,
            ttl
        });

        // Set expiration timer
        const timer = setTimeout(() => {
            this.delete(key);
        }, ttl);
        
        this.timers.set(key, timer);

        // Check cache size limits
        this.enforceLimit();
    }

    delete(key) {
        // Clear timer
        if (this.timers.has(key)) {
            clearTimeout(this.timers.get(key));
            this.timers.delete(key);
        }

        // Remove from cache
        return this.cache.delete(key);
    }

    clear() {
        // Clear all timers
        for (const timer of this.timers.values()) {
            clearTimeout(timer);
        }
        
        this.timers.clear();
        this.cache.clear();
    }

    // Check if a key exists (without updating access time)
    has(key) {
        const item = this.cache.get(key);
        if (!item) return false;
        
        if (Date.now() > item.expiresAt) {
            this.delete(key);
            return false;
        }
        
        return true;
    }

    // Get cache statistics
    getStats() {
        const now = Date.now();
        let expired = 0;
        let active = 0;

        for (const [key, item] of this.cache.entries()) {
            if (now > item.expiresAt) {
                expired++;
            } else {
                active++;
            }
        }

        return {
            total: this.cache.size,
            active,
            expired,
            memoryUsage: this.estimateMemoryUsage()
        };
    }

    // Estimate memory usage (rough calculation)
    estimateMemoryUsage() {
        let totalSize = 0;
        
        for (const [key, item] of this.cache.entries()) {
            totalSize += key.length * 2; // Rough char size
            totalSize += JSON.stringify(item.data).length * 2;
            totalSize += 100; // Overhead
        }
        
        return {
            bytes: totalSize,
            mb: (totalSize / 1024 / 1024).toFixed(2)
        };
    }

    // Enforce cache size limits
    enforceLimit() {
        const maxSize = Math.max(...Object.values(cacheConfig.maxSizes));
        
        if (this.cache.size <= maxSize) {
            return;
        }

        // Remove oldest items first (LRU)
        const entries = Array.from(this.cache.entries())
            .sort((a, b) => a[1].lastAccessed - b[1].lastAccessed);

        const toRemove = entries.slice(0, this.cache.size - maxSize);
        
        for (const [key] of toRemove) {
            this.delete(key);
        }
    }

    // Cleanup expired items
    cleanup() {
        const now = Date.now();
        const toDelete = [];

        for (const [key, item] of this.cache.entries()) {
            if (now > item.expiresAt) {
                toDelete.push(key);
            }
        }

        for (const key of toDelete) {
            this.delete(key);
        }

        return toDelete.length;
    }

    // Start automatic cleanup
    startCleanup() {
        setInterval(() => {
            const cleaned = this.cleanup();
            if (cleaned > 0) {
                console.log(`🧹 Cache cleanup: removed ${cleaned} expired items`);
            }
        }, cacheConfig.cleanup.interval);
    }

    // Get all keys (for debugging)
    keys() {
        return Array.from(this.cache.keys());
    }

    // Cache-specific methods for different services
    async getRxNorm(key) {
        return this.get(`${cacheConfig.keyPrefixes.rxnorm}${key}`);
    }

    async setRxNorm(key, data, ttl = cacheConfig.timeouts.rxnorm) {
        return this.set(`${cacheConfig.keyPrefixes.rxnorm}${key}`, data, ttl);
    }

    async getFHIR(key) {
        return this.get(`${cacheConfig.keyPrefixes.fhir}${key}`);
    }

    async setFHIR(key, data, ttl = cacheConfig.timeouts.fhir) {
        return this.set(`${cacheConfig.keyPrefixes.fhir}${key}`, data, ttl);
    }

    async getClinicalTrials(key) {
        return this.get(`${cacheConfig.keyPrefixes.clinicalTrials}${key}`);
    }

    async setClinicalTrials(key, data, ttl = cacheConfig.timeouts.clinicalTrials) {
        return this.set(`${cacheConfig.keyPrefixes.clinicalTrials}${key}`, data, ttl);
    }

    // Invalidate cache by pattern
    invalidatePattern(pattern) {
        const regex = new RegExp(pattern);
        const toDelete = [];

        for (const key of this.cache.keys()) {
            if (regex.test(key)) {
                toDelete.push(key);
            }
        }

        for (const key of toDelete) {
            this.delete(key);
        }

        return toDelete.length;
    }

    // Export cache for persistence (optional feature)
    export() {
        const exported = {};
        
        for (const [key, item] of this.cache.entries()) {
            if (Date.now() < item.expiresAt) {
                exported[key] = {
                    data: item.data,
                    expiresAt: item.expiresAt,
                    ttl: item.ttl
                };
            }
        }
        
        return exported;
    }

    // Import cache from persistence (optional feature)
    import(data) {
        const now = Date.now();
        let imported = 0;

        for (const [key, item] of Object.entries(data)) {
            if (now < item.expiresAt) {
                const remainingTtl = item.expiresAt - now;
                this.set(key, item.data, remainingTtl);
                imported++;
            }
        }

        return imported;
    }
}

module.exports = CacheManager;