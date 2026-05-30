import os
import json
import re
import urllib.request

CONFIG_PATH = os.path.join(os.path.dirname(__file__), 'firebase-config.js')
DB_PATH = os.path.join(os.path.dirname(__file__), 'dhmotopartes_db.json')

def get_database_url():
    if not os.path.exists(CONFIG_PATH):
        print(f"❌ No se encontró firebase-config.js en: {CONFIG_PATH}")
        return None
        
    with open(CONFIG_PATH, 'r', encoding='utf-8') as f:
        content = f.read()
        
    # Extract databaseURL using regex
    match = re.search(r'databaseURL:\s*["\']([^"\']+)["\']', content)
    if match:
        url = match.group(1).strip()
        if "TU_PROJECT_ID" in url or "AQUI" in url:
            print("⚠️ Advertencia: firebase-config.js aún contiene los valores de marcador de posición.")
            return None
        return url
    return None

def migrate():
    print("=" * 60)
    print("   DH MOTOPARTES - MIGRACIÓN DE DATOS A FIREBASE (NUBE)")
    print("=" * 60)
    
    # 1. Get Database URL
    db_url = get_database_url()
    if not db_url:
        db_url = input("Ingresa la URL de tu Firebase Realtime Database (ej: https://proyecto-default-rtdb.firebaseio.com/): ").strip()
        
    if not db_url:
        print("❌ URL de base de datos no proporcionada. Abortando.")
        return
        
    if not db_url.startswith('http'):
        db_url = 'https://' + db_url
        
    # Standardize URL
    db_url = db_url.rstrip('/')
    if not db_url.endswith('.json'):
        target_url = f"{db_url}/pos_db.json"
    else:
        target_url = db_url
        
    print(f"🔗 URL Objetivo: {target_url}")
    
    # 2. Read local database
    if not os.path.exists(DB_PATH):
        print(f"❌ No se encontró la base de datos local en: {DB_PATH}")
        return
        
    try:
        with open(DB_PATH, 'r', encoding='utf-8') as f:
            data = json.load(f)
        print(f"✅ Base de datos local leída con éxito ({len(data.get('products', []))} productos, {len(data.get('sales', []))} ventas).")
    except Exception as e:
        print(f"❌ Error al leer dhmotopartes_db.json: {e}")
        return
        
    # 3. Request PUT to Firebase
    print("\n🚀 Subiendo datos a Firebase...")
    print("⚠️ NOTA: Asegúrate de que las reglas de Firebase estén en modo prueba (lectura y escritura públicas) temporalmente.")
    
    try:
        json_data = json.dumps(data, ensure_ascii=False).encode('utf-8')
        req = urllib.request.Request(
            target_url, 
            data=json_data, 
            headers={'Content-Type': 'application/json; charset=utf-8'},
            method='PUT'
        )
        
        with urllib.request.urlopen(req) as response:
            status = response.status
            response_body = response.read().decode('utf-8')
            
        if status == 200:
            print("\n🎉 ¡MIGRACIÓN COMPLETADA CON ÉXITO! 🎉")
            print("Los datos ya están en la nube de Firebase.")
            print("\n⚠️ IMPORTANTE: Ahora puedes restaurar tus Reglas de Seguridad en Firebase a:")
            print('''
{
  "rules": {
    "pos_db": {
      ".read": true,
      ".write": "auth != null"
    }
  }
}
            ''')
        else:
            print(f"❌ El servidor respondió con código {status}: {response_body}")
            
    except urllib.error.HTTPError as e:
        print(f"❌ Error HTTP ({e.code}): {e.reason}")
        print("Verifica si tus Reglas de Seguridad de Firebase permiten la escritura.")
    except Exception as e:
        print(f"❌ Ocurrió un error al conectar con Firebase: {e}")

if __name__ == '__main__':
    migrate()
