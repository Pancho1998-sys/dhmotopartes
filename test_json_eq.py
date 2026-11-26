import os
import sys
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

supabase.auth.sign_in_with_password({"email": EMAIL, "password": PASSWORD})

# 1. Reset state to version 1
state = {"version": 1, "data": "test"}
supabase.table('store_states').upsert({"store_id": STORE_ID, "state": state}).execute()
print("State reset to version 1")

# 2. Try to update using condition version == 1
new_state = {"version": 2, "data": "test2"}
res = supabase.table('store_states').update({"state": new_state}).eq('store_id', STORE_ID).eq('state->>version', '1').execute()
print("Update with correct version:", len(res.data), "rows updated.")

# 3. Try to update using condition version == 1 again (should fail since it's 2 now)
new_state2 = {"version": 3, "data": "test3"}
res2 = supabase.table('store_states').update({"state": new_state2}).eq('store_id', STORE_ID).eq('state->>version', '1').execute()
print("Update with incorrect version:", len(res2.data), "rows updated.")
