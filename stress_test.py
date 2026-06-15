import os
import sys
import json
import time
import uuid
import threading
from supabase import create_client, Client

url = "https://wkgxssfbzgahkztdjzmo.supabase.co"
key = "sb_publishable_jwKdrvQXfD3PnddXDJcBhw_iIHXs7yL"
supabase: Client = create_client(url, key)

NUM_CASHIERS = 15
INITIAL_STOCK = 100

print(f"--- Iniciando Prueba de Estrés (CON AUTO-MERGE) ---")

try:
    response = supabase.auth.sign_in_with_password({
        "email": "francisco.r.s.w.98@gmail.com",
        "password": "superadmin123"
    })
    user_id = response.user.id
except Exception as e:
    print(f"Error de autenticación: {e}")
    sys.exit(1)

try:
    profile_res = supabase.table('user_profiles').select('store_id').eq('id', user_id).single().execute()
    STORE_ID = profile_res.data['store_id']
    if not STORE_ID:
        stores_res = supabase.table('user_profiles').select('store_id').neq('store_id', None).limit(1).execute()
        if stores_res.data:
            STORE_ID = stores_res.data[0]['store_id']
        else:
            sys.exit(1)
except Exception as e:
    print(f"Error al obtener store_id: {e}")
    sys.exit(1)

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

try:
    supabase.table('store_states').upsert({
        "store_id": STORE_ID,
        "state": initial_state,
        "updated_at": time.strftime("%Y-%m-%dT%H:%M:%S.000Z", time.gmtime())
    }).execute()
    print(f"Estado de la tienda reseteado con {INITIAL_STOCK} unidades en stock.")
except Exception as e:
    print(f"Error al resetear tienda: {e}")
    sys.exit(1)

def cashier_worker(cashier_id):
    time.sleep(cashier_id * 0.1) # Jitter para no ahogar los sockets de Windows
    retry_count = 0
    max_retries = 20 # Le damos un margen amplio de reintentos porque 50 hilos al mismo tiempo es mucho estrés
    
    while retry_count < max_retries:
        try:
            # 1. Leer estado actual
            response = supabase.table('store_states').select('state').eq('store_id', STORE_ID).single().execute()
            state = response.data['state']
            
            # 2. Modificar stock (intención de venta)
            for product in state['products']:
                if product['id'] == 'prod-test-1':
                    product['stock'] -= 1
                    break
            
            old_version = state.get('version', 0)
            state['version'] = old_version + 1
            
            # Latencia artificial de red
            time.sleep(0.05) 
            
            # 3. Guardar con Bloqueo Optimista (igual que en app.js)
            update_res = supabase.table('store_states').update({
                "state": state,
                "updated_at": time.strftime("%Y-%m-%dT%H:%M:%S.000Z", time.gmtime())
            }).eq('store_id', STORE_ID).eq('state->>version', str(old_version)).execute()
            
            if len(update_res.data) > 0:
                print(f"[Cajero {cashier_id}] Venta exitosa en intento {retry_count + 1}.")
                return # Exito! Salimos del bucle.
            else:
                # Falló la actualización por colisión. El bucle while lo reintentará (Auto-Merge)
                retry_count += 1
                
        except Exception as e:
            print(f"[Cajero {cashier_id}] Error: {e}")
            break
            
    print(f"[Cajero {cashier_id}] Abandonó después de {max_retries} colisiones.")

threads = []
print(f"\nIniciando ráfaga de {NUM_CASHIERS} ventas simultáneas con el nuevo sistema...")
start_time = time.time()

for i in range(NUM_CASHIERS):
    t = threading.Thread(target=cashier_worker, args=(i+1,))
    threads.append(t)
    t.start()

for t in threads:
    t.join()

end_time = time.time()
print(f"\nTiempo total de la ráfaga: {round(end_time - start_time, 2)} segundos")

try:
    response = supabase.table('store_states').select('state').eq('store_id', STORE_ID).single().execute()
    final_state = response.data['state']
    final_stock = final_state['products'][0]['stock']
    
    print("-" * 40)
    print("RESULTADOS DE LA NUEVA PRUEBA:")
    print(f"Stock Inicial: {INITIAL_STOCK}")
    print(f"Ventas procesadas (Hilos): {NUM_CASHIERS}")
    print(f"Stock Final Esperado: {INITIAL_STOCK - NUM_CASHIERS}")
    print(f"Stock Final Real en BD: {final_stock}")
    
    if final_stock == (INITIAL_STOCK - NUM_CASHIERS):
        print("✅ ÉXITO TOTAL: El sistema de auto-fusión soportó el tráfico sin perder una sola venta.")
    else:
        perdidas = final_stock - (INITIAL_STOCK - NUM_CASHIERS)
        print(f"❌ FALLA: Se perdieron {perdidas} ventas.")
    print("-" * 40)
except Exception as e:
    print(f"Error final: {e}")
