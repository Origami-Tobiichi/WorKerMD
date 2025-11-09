const { createServer } = require('http');
const express = require('express');
const app = express();

app.use(express.json());

// Handler untuk serverless function
exports.handler = async (event, context) => {
  const path = event.path;
  const method = event.httpMethod;
  
  // Simulasi endpoint API
  if (path.includes('/api/status') && method === 'GET') {
    return {
      statusCode: 200,
      body: JSON.stringify({
        status: 'Bot tidak dapat berjalan di Netlify',
        message: 'WhatsApp Bot memerlukan server yang berjalan terus-menerus',
        connection_status: 'unsupported',
        suggestion: 'Gunakan layanan seperti Railway, Heroku, atau VPS'
      })
    };
  }
  
  return {
    statusCode: 404,
    body: JSON.stringify({ error: 'Endpoint tidak tersedia di Netlify' })
  };
};
