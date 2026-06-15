import urllib.request
import re

print("Analizando https://dhmotopartes-web.vercel.app/ ...")
html = urllib.request.urlopen('https://dhmotopartes-web.vercel.app/').read().decode('utf-8')

# Extraer todos los scripts (relativos o absolutos)
js_urls = re.findall(r'src=["\']([^"\']+\.js)["\']', html)
print(f"Archivos JS encontrados: {js_urls}")

leaks_found = False

for url in js_urls:
    if url.startswith('/'):
        url = 'https://dhmotopartes-web.vercel.app' + url
    elif not url.startswith('http'):
        continue
        
    try:
        js_content = urllib.request.urlopen(url).read().decode('utf-8')
        
        # Buscar palabras clave peligrosas (acceso directo a tabla en vez de RPC)
        if 'store_states' in js_content and 'get_public_catalog' not in js_content:
            print(f"\n[ALERTA ROJA] El archivo {url} menciona 'store_states'. Posible fuga de datos!")
            leaks_found = True
            # Mostrar contexto
            matches = re.finditer(r'.{0,60}store_states.{0,60}', js_content)
            for m in matches:
                print(f"   Contexto: {m.group(0)}")
                
        elif 'get_public_catalog' in js_content:
            print(f"\n[SEGURO] El archivo {url} usa correctamente la funcion 'get_public_catalog'.")
            
    except Exception as e:
        print(f"Error analizando {url}: {e}")

if not leaks_found:
    print("\n✅ Análisis estático completado: No se encontraron accesos directos e inseguros a la tabla 'store_states'.")
