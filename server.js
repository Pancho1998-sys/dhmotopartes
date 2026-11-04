/* ==========================================================================
   DHMotopartes - Local Web Server (Node.js)
   ========================================================================== */
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { exec } = require('child_process');

const PORT = 8000;
const STATIC_DIR = __dirname;
const DB_PATH = path.join(STATIC_DIR, 'dhmotopartes_db.json');

const MIME_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.pdf': 'application/pdf',
    '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    '.csv': 'text/csv; charset=utf-8'
};

const server = http.createServer((req, res) => {
    // Strip query parameters
    let reqPath = req.url.split('?')[0];
    if (reqPath === '/') reqPath = '/index.html';

    // CORS & Cache-Control headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');

    if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
    }

    // 1. Database GET API
    if (req.method === 'GET' && reqPath === '/api/db') {
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        if (fs.existsSync(DB_PATH)) {
            res.end(fs.readFileSync(DB_PATH));
        } else {
            res.end('{}');
        }
        return;
    }

    // 2. Info API
    if (req.method === 'GET' && reqPath === '/api/info') {
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ frozen: false }));
        return;
    }

    // 3. Database POST API
    if (req.method === 'POST' && reqPath === '/api/db') {
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', () => {
            try {
                // Validate JSON before saving
                JSON.parse(body);
                fs.writeFileSync(DB_PATH, body, 'utf8');
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ status: 'success' }));
            } catch (err) {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ status: 'error', message: err.message }));
            }
        });
        return;
    }

    // 4. Static file serving
    const safePath = path.normalize(reqPath).replace(/^(\.\.[\/\\])+/, '');
    const filePath = path.join(STATIC_DIR, safePath);

    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
        const ext = path.extname(filePath).toLowerCase();
        const contentType = MIME_TYPES[ext] || 'application/octet-stream';
        res.writeHead(200, { 'Content-Type': contentType });
        fs.createReadStream(filePath).pipe(res);
    } else {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('404 Not Found');
    }
});

function getLocalIp() {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
            if (iface.family === 'IPv4' && !iface.internal) {
                return iface.address;
            }
        }
    }
    return '127.0.0.1';
}

server.listen(PORT, '0.0.0.0', () => {
    const localIp = getLocalIp();
    console.log('\n======================================================');
    console.log('  🚀 Servidor DHMotopartes iniciado con éxito');
    console.log('======================================================');
    console.log(`  💻 Acceso local:       http://localhost:${PORT}/`);
    console.log(`  📱 En red local/Wi-Fi: http://${localIp}:${PORT}/`);
    console.log('======================================================\n');

    // Automatically open browser on Windows
    const startCmd = process.platform === 'win32' ? 'start' : (process.platform === 'darwin' ? 'open' : 'xdg-open');
    exec(`${startCmd} http://localhost:${PORT}/`);
});
