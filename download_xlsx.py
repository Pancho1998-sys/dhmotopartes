import urllib.request
import os

url = 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js'
output = 'xlsx.full.min.js'

try:
    print(f"Descargando {url}...")
    urllib.request.urlretrieve(url, output)
    print(f"Descarga completada con éxito. Guardado como '{output}' en {os.getcwd()}")
except Exception as e:
    print(f"Error durante la descarga: {e}")
