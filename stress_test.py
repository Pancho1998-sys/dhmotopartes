import os
import sys
import time
import threading
from supabase import create_client, Client

# PROTECCIÓN: Este script es SOLO para pruebas en una tienda de testing aislada.
BLOCKED_PRODUCTION_STORES = {
    "3cd7c0ff-735b-430f-8da6-c538e4d5ed77",  # DH Motopartes
    "5a6facf8-b76e-4d93-8b67-0ab5387907f8",  # Brinde Estilo
    "75bd2b78-f19a-4969-a0c0-518a096057a5",  # Moto Repuestos Sur
    "ed0731fb-e91f-491e-a6ac-f47c32324c00",  # Moto Repuestos Centro
    "6c2b4c0e-3e22-411f-9403-94e4b5bad19e",  # HD racing
}

if "--confirm-test-wipe" not in sys.argv:
    print("ABORTADO: Este script sobrescribe store_states. Pasa --confirm-test-wipe y configura TEST_STORE_ID para ejecutarlo.")
    sys.exit(1)

STORE_ID = os.environ.get("TEST_STORE_ID", "").strip()
EMAIL = os.environ.get("TEST_SUPABASE_EMAIL", "").strip()
PASSWORD = os.environ.get("TEST_SUPABASE_PASSWORD", "").strip()

if not STORE_ID or not EMAIL or not PASSWORD:
    print("ABORTADO: Debes definir TEST_STORE_ID, TEST_SUPABASE_EMAIL y TEST_SUPABASE_PASSWORD en variables de entorno.")
    sys.exit(1)

if STORE_ID in BLOCKED_PRODUCTION_STORES:
    print(f"BLOQUEADO: {STORE_ID} es una tienda de producción protegida.")
    sys.exit(1)

url = "https://wkgxssfbzgahkztdjzmo.supabase.co"
key = os.environ.get("SUPABASE_ANON_KEY", "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndrZ3hzc2ZiemdhaGt6dGRqem1vIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA0NzI4MjcsImV4cCI6MjA5NjA0ODgyN30.BNlE6dOMlbMlERR7ri4c4QIKqVXCJPHcZviTNunku44")
supabase: Client = create_client(url, key)

NUM_CASHIERS = 15
INITIAL_STOCK = 100

print("--- Iniciando Prueba de Estrés (SOLO TIENDA DE PRUEBAS) ---")

supabase.auth.sign_in_with_password({"email": EMAIL, "password": PASSWORD})

initial_state = {
    "version": 1,
    "products": [
        {
            "id": "prod-test-1",
            "name": "Bujía de Prueba NGK",
            "stock": INITIAL_STOCK,
            "price": 500
        }
    ],
    "sales": [],
    "customers": [],
    "cashMovements": []
}

supabase.table('store_states').upsert({
    "store_id": STORE_ID,
    "state": initial_state,
    "updated_at": time.strftime("%Y-%m-%dT%H:%M:%S.000Z", time.gmtime())
}).execute()
print(f"Estado de la tienda de pruebas reseteado con {INITIAL_STOCK} unidades en stock.")


def cashier_worker(cashier_id):
    time.sleep(cashier_id * 0.1)
    retry_count = 0
    max_retries = 20

    while retry_count < max_retries:
        try:
            response = supabase.table('store_states').select('state').eq('store_id', STORE_ID).single().execute()
            state = response.data['state']

            for product in state['products']:
                if product['id'] == 'prod-test-1':
                    product['stock'] -= 1
                    break

            old_version = state.get('version', 0)
            state['version'] = old_version + 1

            time.sleep(0.05)

            update_res = supabase.table('store_states').update({
                "state": state,
                "updated_at": time.strftime("%Y-%m-%dT%H:%M:%S.000Z", time.gmtime())
            }).eq('store_id', STORE_ID).eq('state->>version', str(old_version)).execute()

            if len(update_res.data) > 0:
                print(f"[Cajero {cashier_id}] Venta exitosa en intento {retry_count + 1}.")
                return
            retry_count += 1
        except Exception as e:
            print(f"[Cajero {cashier_id}] Error: {e}")
            break

    print(f"[Cajero {cashier_id}] Abandonó después de {max_retries} colisiones.")


threads = []
start_time = time.time()
for i in range(NUM_CASHIERS):
    t = threading.Thread(target=cashier_worker, args=(i + 1,))
    threads.append(t)
    t.start()

for t in threads:
    t.join()

end_time = time.time()
print(f"\nTiempo total de la ráfaga: {round(end_time - start_time, 2)} segundos")
response = supabase.table('store_states').select('state').eq('store_id', STORE_ID).single().execute()
final_stock = response.data['state']['products'][0]['stock']
print(f"Stock Final Esperado: {INITIAL_STOCK - NUM_CASHIERS} | Real: {final_stock}")
