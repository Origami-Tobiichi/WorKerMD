require('./settings');
const fs = require('fs');
const os = require('os');
const pino = require('pino');
const path = require('path');
const axios = require('axios');
const readline = require('readline');
const { Boom } = require('@hapi/boom');
const qrcode = require('qrcode-terminal');
const NodeCache = require('node-cache');
const { exec, spawn } = require('child_process');
const dns = require('dns');
const http = require('http');
const express = require('express');

// ==============================
// 🛡️ ENHANCED SECURITY CONFIGURATION
// ==============================

// Secure DNS Configuration
const SECURE_DNS_CONFIG = {
    servers: [
        'https://dns.nextdns.io/5e6c1b',
        'tls://5e6c1b.dns.nextdns.io', 
        'quic://5e6c1b.dns.nextdns.io',
        'https://dns.google/dns-query',
        'https://cloudflare-dns.com/dns-query'
    ],
    timeout: 3000,
    cacheTimeout: 30000
};

// Enhanced User Agents Rotation
const USER_AGENTS = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/121.0',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:109.0) Gecko/20100101 Firefox/121.0',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Edge/120.0.0.0 Safari/537.36'
];

// Security Headers Template
const SECURITY_HEADERS = {
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9,id;q=0.8',
    'Accept-Encoding': 'gzip, deflate, br',
    'Cache-Control': 'no-cache',
    'Sec-Ch-Ua': '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
    'Sec-Ch-Ua-Mobile': '?0',
    'Sec-Ch-Ua-Platform': '"Windows"',
    'Sec-Fetch-Dest': 'empty',
    'Sec-Fetch-Mode': 'cors',
    'Sec-Fetch-Site': 'same-origin',
    'DNT': '1'
};

// Priority Commands for Fast Response
const PRIORITY_COMMANDS = {
    'ping': { priority: 1, maxResponseTime: 800 },
    'status': { priority: 1, maxResponseTime: 1000 },
    'emergency': { priority: 0, maxResponseTime: 500 },
    'help': { priority: 2, maxResponseTime: 1500 },
    'speed': { priority: 1, maxResponseTime: 700 }
};

// ==============================
// 🔧 UTILITY FUNCTIONS
// ==============================

// Safe chalk implementation
let chalk;
try {
    chalk = require('ch
