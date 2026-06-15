import os
import sys
import json
import socket
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

class DHMotopartesRequestHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        # Initialize with the correct static directory for resources
        super().__init__(*args, directory=STATIC_DIR, **kwargs)

    def do_GET(self):
        if self.path == '/api/db':
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate')
            self.end_headers()
            
            if os.path.exists(DB_PATH):
                try:
                    with open(DB_PATH, 'r', encoding='utf-8') as f:
                        data = f.read()
                    self.wfile.write(data.encode('utf-8'))
                except Exception as e:
                    self.wfile.write(b'{}')
            else:
                self.wfile.write(b'{}')
        elif self.path == '/api/info':
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate')
            self.end_headers()
            is_frozen = getattr(sys, 'frozen', False)
            info = {
                "frozen": is_frozen
            }
            self.wfile.write(json.dumps(info).encode('utf-8'))
        else:
            # Serve static files normally
            super().do_GET()

    def do_POST(self):
        if self.path == '/api/db':
            content_length = int(self.headers.get('Content-Length', 0))
            post_data = self.rfile.read(content_length)
            
            try:
                # Validate JSON structure
                parsed = json.loads(post_data.decode('utf-8'))
                
                # Write to database file
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
                self.wfile.write(f'{{"status": "error", "message": "{str(e)}"}}'.encode('utf-8'))
        else:
            self.send_response(404)
            self.end_headers()

    # Reduce log noise by only logging database API and error requests
    def log_message(self, format, *args):
        if '/api/' in self.path or args[1] in ['404', '500']:
            super().log_message(format, *args)


def get_local_ip():
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        # Doesn't need to be reachable to resolve host IP
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
    print("-" * 60)
    print(" PARA ACCEDER AL SISTEMA:")
    print(f" -> En esta PC (servidor):  http://localhost:{PORT}")
    print(f" -> Desde otras PCs/móviles: http://{local_ip}:{PORT}")
    print("-" * 60)
    print(" Presione Ctrl+C en esta ventana para cerrar el servidor.")
    print("=" * 60)
    
    # Auto open browser
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
