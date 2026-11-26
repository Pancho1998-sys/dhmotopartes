import os
import sys
import json
import socket
import datetime
import webbrowser
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

PORT = 8000

# Determine paths
if getattr(sys, 'frozen', False):
    # Running inside a PyInstaller bundle
    local_dir = os.path.dirname(sys.executable)
    if os.path.exists(os.path.join(local_dir, 'index.html')):
        STATIC_DIR = local_dir
    else:
        STATIC_DIR = sys._MEIPASS
    DB_DIR = local_dir
else:
    # Running as a normal script
    STATIC_DIR = os.path.dirname(os.path.abspath(__file__))
    DB_DIR = STATIC_DIR

DB_PATH = os.path.join(DB_DIR, 'dhmotopartes_db.json')
BACKUP_DIR = os.path.join(DB_DIR, 'backups')
MAX_LOCAL_BACKUPS = 60


def has_substantial_data(state_obj):
    if not isinstance(state_obj, dict):
        return False
    return bool(state_obj.get('products') or state_obj.get('sales') or state_obj.get('customers'))


def save_backup_snapshot(state_obj, date_str=None):
    if not has_substantial_data(state_obj):
        return {"saved": False, "reason": "empty_state"}
    today = datetime.date.today().isoformat()
    safe_date = date_str if (date_str and len(date_str) == 10) else today
    os.makedirs(BACKUP_DIR, exist_ok=True)
    filename = f"dhmotopartes_backup_{safe_date}.json"
    target = os.path.join(BACKUP_DIR, filename)
    with open(target, 'w', encoding='utf-8') as f:
        json.dump(state_obj, f, indent=2, ensure_ascii=False)
    try:
        files = sorted(
            f for f in os.listdir(BACKUP_DIR)
            if f.startswith('dhmotopartes_backup_') and f.endswith('.json')
        )
        while len(files) > MAX_LOCAL_BACKUPS:
            oldest = files.pop(0)
            os.remove(os.path.join(BACKUP_DIR, oldest))
    except Exception:
        pass
    return {"saved": True, "filename": filename, "path": target}


class DHMotopartesRequestHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        # Initialize with the correct static directory for resources
        super().__init__(*args, directory=STATIC_DIR, **kwargs)

    def do_GET(self):
        # Strip query parameters from self.path so static files and APIs map correctly
        if '?' in self.path:
            self.path = self.path.split('?')[0]

        if self.path == '/api/db':
            db_data = b'{}'
            if os.path.exists(DB_PATH):
                try:
                    with open(DB_PATH, 'r', encoding='utf-8') as f:
                        db_data = f.read().encode('utf-8')
                except Exception:
                    pass
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Content-Length', str(len(db_data)))
            self.send_header('Connection', 'close')
            self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate')
            self.end_headers()
            self.wfile.write(db_data)
        elif self.path == '/api/info':
            is_frozen = getattr(sys, 'frozen', False)
            info = {
                "frozen": is_frozen,
                "backupDir": BACKUP_DIR
            }
            response_bytes = json.dumps(info).encode('utf-8')
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Content-Length', str(len(response_bytes)))
            self.send_header('Connection', 'close')
            self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate')
            self.end_headers()
            self.wfile.write(response_bytes)
        elif self.path == '/api/backups':
            backups = []
            if os.path.exists(BACKUP_DIR):
                for fname in sorted(os.listdir(BACKUP_DIR), reverse=True):
                    if fname.startswith('dhmotopartes_backup_') and fname.endswith('.json'):
                        fpath = os.path.join(BACKUP_DIR, fname)
                        stat = os.stat(fpath)
                        backups.append({
                            "filename": fname,
                            "size": stat.st_size,
                            "modifiedAt": datetime.datetime.fromtimestamp(stat.st_mtime).isoformat()
                        })
            payload = json.dumps({"status": "success", "backupDir": BACKUP_DIR, "backups": backups}).encode('utf-8')
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Content-Length', str(len(payload)))
            self.send_header('Connection', 'close')
            self.end_headers()
            self.wfile.write(payload)
        elif self.path.startswith('/api/backups/'):
            safe_name = os.path.basename(self.path)
            fpath = os.path.join(BACKUP_DIR, safe_name)
            if safe_name.startswith('dhmotopartes_backup_') and safe_name.endswith('.json') and os.path.exists(fpath):
                with open(fpath, 'rb') as f:
                    data = f.read()
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.send_header('Content-Length', str(len(data)))
                self.send_header('Connection', 'close')
                self.end_headers()
                self.wfile.write(data)
            else:
                self.send_response(404)
                self.end_headers()
        else:
            # Serve static files normally
            super().do_GET()

    def do_POST(self):
        if '?' in self.path:
            self.path = self.path.split('?')[0]

        if self.path == '/api/db':
            content_length = int(self.headers.get('Content-Length', 0))
            post_data = self.rfile.read(content_length)

            try:
                parsed = json.loads(post_data.decode('utf-8'))
                with open(DB_PATH, 'w', encoding='utf-8') as f:
                    json.dump(parsed, f, indent=4, ensure_ascii=False)

                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(b'{"status": "success"}')
            except Exception as e:
                self.send_response(500)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({"status": "error", "message": str(e)}).encode('utf-8'))
        elif self.path == '/api/backup':
            content_length = int(self.headers.get('Content-Length', 0))
            post_data = self.rfile.read(content_length)

            try:
                payload = json.loads(post_data.decode('utf-8'))
                state_obj = payload.get('state', payload) if isinstance(payload, dict) else payload
                date_str = payload.get('date') if isinstance(payload, dict) else None
                res = save_backup_snapshot(state_obj, date_str)
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({"status": "success", **res}).encode('utf-8'))
            except Exception as e:
                self.send_response(400)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({"status": "error", "message": str(e)}).encode('utf-8'))
        else:
            self.send_response(404)
            self.end_headers()

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate')
        super().end_headers()

    # Reduce log noise by only logging database API and error requests
    def log_message(self, format, *args):
        if '/api/' in self.path or (len(args) > 1 and args[1] in ['404', '500']):
            super().log_message(format, *args)


def get_local_ip():
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(('10.254.254.254', 1))
        IP = s.getsockname()[0]
    except Exception:
        IP = '127.0.0.1'
    finally:
        s.close()
    return IP


def run():
    local_ip = get_local_ip()
    server_address = ('0.0.0.0', PORT)

    try:
        httpd = ThreadingHTTPServer(server_address, DHMotopartesRequestHandler)
    except Exception as e:
        print(f"Error al iniciar el servidor en el puerto {PORT}: {e}")
        print("Asegúrese de que el puerto no esté en uso por otra aplicación.")
        input("Presione Enter para salir...")
        sys.exit(1)

    print("=" * 60)
    print("      SISTEMA DE VENTAS DHMOTOPARTES - SERVIDOR ACTIVO")
    print("=" * 60)
    print(f" Servidor iniciado correctamente en el puerto {PORT}.")
    print(f" Base de datos: {DB_PATH}")
    print(f" Backups:       {BACKUP_DIR}")
    print("-" * 60)
    print(" PARA ACCEDER AL SISTEMA:")
    print(f" -> En esta PC (servidor):  http://localhost:{PORT}")
    print(f" -> Desde otras PCs/móviles: http://{local_ip}:{PORT}")
    print("-" * 60)
    print(" Presione Ctrl+C en esta ventana para cerrar el servidor.")
    print("=" * 60)

    if sys.stdin and sys.stdin.isatty():
        try:
            webbrowser.open(f"http://localhost:{PORT}")
        except Exception:
            pass

    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nServidor finalizado por el usuario. ¡Hasta luego!")
        sys.exit(0)


if __name__ == '__main__':
    run()
