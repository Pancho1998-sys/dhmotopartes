import os
import time
from supabase import create_client, Client

url = "https://wkgxssfbzgahkztdjzmo.supabase.co"
key = "sb_publishable_jwKdrvQXfD3PnddXDJcBhw_iIHXs7yL"
supabase: Client = create_client(url, key)

response = supabase.auth.sign_in_with_password({
    "email": "francisco.r.s.w.98@gmail.com",
    "password": "superadmin123"
})

STORE_ID = "3cd7c0ff-735b-430f-8da6-c538e4d5ed77"

# 1. Reset state to version 1
state = {"version": 1, "data": "test"}
supabase.table('store_states').upsert({"store_id": STORE_ID, "state": state}).execute()
print("State reset to version 1")

# 2. Try to update using condition version == 1
new_state = {"version": 2, "data": "test2"}
try:
    res = supabase.table('store_states').update({"state": new_state}).eq('store_id', STORE_ID).eq('state->>version', '1').execute()
    print("Update with correct version:", len(res.data), "rows updated.")
except Exception as e:
    print("Error updating correct:", e)

# 3. Try to update using condition version == 1 again (should fail since it's 2 now)
new_state2 = {"version": 3, "data": "test3"}
try:
    res2 = supabase.table('store_states').update({"state": new_state2}).eq('store_id', STORE_ID).eq('state->>version', '1').execute()
    print("Update with incorrect version:", len(res2.data), "rows updated.")
except Exception as e:
    print("Error updating incorrect:", e)

