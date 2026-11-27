/* ==========================================================================
   DHMotopartes - Local Web Server (Node.js)
   ========================================================================== */
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { exec } = require('child_process');

const PORT = 8000;
// When compiled with @yao-pkg/pkg, __dirname points to the virtual snapshot FS (embedded files).
// process.execPath directory is the real directory where the .exe is running on the user's PC.
const IS_PKG = typeof process.pkg !== 'undefined';
const REAL_DIR = IS_PKG ? path.dirname(process.execPath) : __dirname;
const DB_PATH = path.join(REAL_DIR, 'dhmotopartes_db.json');
const BACKUP_DIR = path.join(REAL_DIR, 'backups');
const MAX_LOCAL_BACKUPS = 60;

function getLocalDateStr(d = new Date()) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

function hasSubstantialData(st) {
    if (!st || typeof st !== 'object') return false;
    return (Array.isArray(st.products) && st.products.length > 0) ||
           (Array.isArray(st.sales) && st.sales.length > 0) ||
           (Array.isArray(st.customers) && st.customers.length > 0);
}

function pruneOldBackups() {
    try {
        if (!fs.existsSync(BACKUP_DIR)) return;
        const files = fs.readdirSync(BACKUP_DIR)
            .filter(f => f.startsWith('dhmotopartes_backup_') && f.endsWith('.json'))
            .sort();
        while (files.length > MAX_LOCAL_BACKUPS) {
            const oldest = files.shift();
            fs.unlinkSync(path.join(BACKUP_DIR, oldest));
        }
    } catch (e) {
        console.warn('Error limpiando backups antiguos:', e.message);
    }
}

function saveBackupSnapshot(stateObj, dateStr) {
    if (!hasSubstantialData(stateObj)) {
        return { saved: false, reason: 'empty_state' };
    }
    const safeDate = /^\d{4}-\d{2}-\d{2}$/.test(dateStr || '') ? dateStr : getLocalDateStr();
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
    const filename = `dhmotopartes_backup_${safeDate}.json`;
    const target = path.join(BACKUP_DIR, filename);
    fs.writeFileSync(target, JSON.stringify(stateObj, null, 2), 'utf8');
    pruneOldBackups();
    return { saved: true, filename, path: target };
}

function checkNightlyLocalBackup() {
    try {
        const now = new Date();
        if (now.getHours() < 21) return;
        const today = getLocalDateStr(now);
        const target = path.join(BACKUP_DIR, `dhmotopartes_backup_${today}.json`);
        if (fs.existsSync(target) || !fs.existsSync(DB_PATH)) return;
        const raw = fs.readFileSync(DB_PATH, 'utf8');
        const parsed = JSON.parse(raw);
        const res = saveBackupSnapshot(parsed, today);
        if (res.saved) {
            console.log(`💾 Backup nocturno automático guardado: ${res.filename}`);
        }
    } catch (e) {
        console.warn('No se pudo ejecutar backup nocturno local:', e.message);
    }
}

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
        let embeddedFiles = [];
        try { embeddedFiles = fs.readdirSync(__dirname); } catch (e) { embeddedFiles = [e.message]; }
        res.end(JSON.stringify({
            frozen: IS_PKG,
            mode: IS_PKG ? 'executable' : 'script',
            dirname: __dirname,
            realDir: REAL_DIR,
            backupDir: BACKUP_DIR,
            embeddedFiles
        }));
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

    // 3b. Daily Backup POST API
    if (req.method === 'POST' && reqPath === '/api/backup') {
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', () => {
            try {
                const payload = JSON.parse(body);
                const stateObj = payload && payload.state ? payload.state : payload;
                const dateStr = payload && payload.date ? payload.date : getLocalDateStr();
                const result = saveBackupSnapshot(stateObj, dateStr);
                res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
                res.end(JSON.stringify({ status: 'success', ...result }));
            } catch (err) {
                res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
                res.end(JSON.stringify({ status: 'error', message: err.message }));
            }
        });
        return;
    }

    // 3c. List Backups GET API
    if (req.method === 'GET' && reqPath === '/api/backups') {
        try {
            const list = fs.existsSync(BACKUP_DIR)
                ? fs.readdirSync(BACKUP_DIR)
                    .filter(f => f.startsWith('dhmotopartes_backup_') && f.endsWith('.json'))
                    .sort()
                    .reverse()
                    .map(f => {
                        const stat = fs.statSync(path.join(BACKUP_DIR, f));
                        return { filename: f, size: stat.size, modifiedAt: stat.mtime.toISOString() };
                    })
                : [];
            res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({ status: 'success', backupDir: BACKUP_DIR, backups: list }));
        } catch (err) {
            res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({ status: 'error', message: err.message }));
        }
        return;
    }

    // 3d. Download specific Backup GET API
    if (req.method === 'GET' && reqPath.startsWith('/api/backups/')) {
        const safeName = path.basename(reqPath);
        const filePath = path.join(BACKUP_DIR, safeName);
        if (safeName.startsWith('dhmotopartes_backup_') && safeName.endsWith('.json') && fs.existsSync(filePath)) {
            res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
            fs.createReadStream(filePath).pipe(res);
        } else {
            res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({ status: 'error', message: 'Backup no encontrado' }));
        }
        return;
    }

    // 4. Static file serving (Embed-first / Real-disk fallback)
    // Los archivos embebidos en el .exe tienen prioridad: así, reemplazando SOLO el .exe
    // se actualiza el sistema aunque en la carpeta queden app.js/index.html viejos de
    // instalaciones anteriores. El disco solo se usa para archivos que no vienen embebidos.
    let decodedPath = reqPath;
    try { decodedPath = decodeURIComponent(reqPath); } catch (e) { /* URL mal formada: usar tal cual */ }
    const cleanRelPath = decodedPath.replace(/^\/+/, '');
    const realFilePath = path.resolve(REAL_DIR, cleanRelPath);
    const embeddedFilePath = path.resolve(__dirname, cleanRelPath);
    const isInside = (base, p) => p === path.resolve(base) || p.startsWith(path.resolve(base) + path.sep);
    const isFile = (p) => fs.existsSync(p) && fs.statSync(p).isFile();

    let targetPath = null;
    if (isInside(__dirname, embeddedFilePath) && isFile(embeddedFilePath)) {
        targetPath = embeddedFilePath;
    } else if (isInside(REAL_DIR, realFilePath) && isFile(realFilePath)) {
        targetPath = realFilePath;
    }

    if (targetPath) {
        const ext = path.extname(targetPath).toLowerCase();
        const contentType = MIME_TYPES[ext] || 'application/octet-stream';
        res.writeHead(200, { 'Content-Type': contentType });
        fs.createReadStream(targetPath).pipe(res);
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
    console.log(`  💾 Carpeta backups:    ${BACKUP_DIR}`);
    console.log('======================================================\n');

    setInterval(checkNightlyLocalBackup, 15 * 60 * 1000);
    checkNightlyLocalBackup();

    // Automatically open browser on Windows
    const startCmd = process.platform === 'win32' ? 'start' : (process.platform === 'darwin' ? 'open' : 'xdg-open');
    exec(`${startCmd} http://localhost:${PORT}/`);
});
