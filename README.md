# Spotify <-> Apple Music/Podcasts URL Converter

Este proyecto es una API simple desarrollada en Node.js y Express que permite convertir URLs entre Spotify y Apple Music/Podcasts. Detecta automáticamente el tipo de URL de entrada (Spotify o Apple) y busca la URL equivalente en el servicio opuesto.

**Funcionalidades:**

*   Convierte URLs de canciones, álbumes, artistas, podcasts (shows) y episodios de Spotify a sus equivalentes en Apple Music/Podcasts.
*   Convierte URLs de canciones, álbumes, artistas, podcasts (shows) y episodios de Apple Music/Podcasts a sus equivalentes en Spotify.
*   Detecta automáticamente la plataforma de origen (Spotify o Apple) de la URL proporcionada.
*   Utiliza la API Web de Spotify para obtener metadatos.
*   Utiliza la API de Búsqueda de iTunes (iTunes Search API) para buscar y obtener detalles en Apple Music/Podcasts.
*   Maneja la autenticación con la API de Spotify (Client Credentials Flow).

## Prerrequisitos

*   Node.js (v14 o superior recomendado)
*   npm o yarn
*   Credenciales de la API de Spotify (Client ID y Client Secret) - Puedes obtenerlas registrando una aplicación en el [Spotify Developer Dashboard](https://developer.spotify.com/dashboard/).

## Instalación

1.  **Clona el repositorio:**
    ```bash
    git clone <url-del-repositorio>
    cd spotify-to-apple-converter
    ```

2.  **Instala las dependencias:**
    ```bash
    npm install
    # o
    yarn install
    ```

## Configuración

1.  **Crea un archivo `.env`** en la raíz del proyecto.
2.  **Añade tus credenciales de Spotify y configura el puerto (opcional):**

    ```dotenv
    # Credenciales de la API de Spotify
    SPOTIFY_CLIENT_ID=TU_CLIENT_ID_DE_SPOTIFY
    SPOTIFY_CLIENT_SECRET=TU_CLIENT_SECRET_DE_SPOTIFY

    # Puerto para el servidor Express (opcional, por defecto 3000)
    PORT=3000
    ```
    *   **IMPORTANTE:** Reemplaza `TU_CLIENT_ID_DE_SPOTIFY` y `TU_CLIENT_SECRET_DE_SPOTIFY` con tus credenciales reales.
    *   Asegúrate de añadir `.env` a tu archivo `.gitignore` para no exponer tus credenciales.

## Ejecución

Para iniciar el servidor API:

```bash
node server.js
```

El servidor comenzará a escuchar en el puerto especificado en `.env` o en el puerto 3000 por defecto. Verás un mensaje en la consola: `Servidor escuchando en http://localhost:3000` (o el puerto que hayas configurado).

## Uso de la API

La API expone un único endpoint principal:

**Endpoint:** `GET /convert`

**Parámetros de Query String:**

*   `url` (Obligatorio): La URL completa de Spotify o Apple Music/Podcasts que deseas convertir.
*   `country` (Opcional): El código de país ISO 3166-1 alpha-2 (ej. `US`, `ES`, `MX`) para realizar las búsquedas y lookups en la API de Apple. Por defecto es `US`.

---

**Nota Importante sobre la Codificación de URL:**

Cuando uses la API directamente desde la barra de direcciones del navegador, el navegador **automáticamente codificará** los caracteres especiales dentro del valor del parámetro `url`. ¡Esto es bueno y necesario!

Si estás construyendo la URL mediante programación o usando herramientas como `curl`, **asegúrate de codificar correctamente la URL que pasas como valor del parámetro `url`**. Esto es crucial porque las URLs de destino contienen caracteres como `?`, `&`, `%` que podrían interpretarse incorrectamente si no están codificados dentro del parámetro.

*   **Ejemplo en JavaScript:** `encodeURIComponent("URL_ORIGINAL_AQUÍ")`
*   **Ejemplo en `curl` (bash/zsh):** `curl "http://localhost:3000/convert?url=$(rawurlencode "URL_ORIGINAL_AQUÍ")"` (o simplemente pega la URL completa después de `url=` y deja que `curl` o la shell manejen la codificación básica si no contiene caracteres muy problemáticos, aunque codificar siempre es más seguro).

---

**Ejemplos de Uso:**

*   **Convertir un episodio de Spotify a Apple Podcasts (país por defecto US):**

    *   *Navegador:*
        ```
        http://localhost:3000/convert?url=https://open.spotify.com/episode/1OeqSf37ErIob8zxiXG129?si=Pi81sUO5RW-t2jtPuXKNYw
        ```
    *   *curl:*
        ```bash
        curl "http://localhost:3000/convert?url=https%3A%2F%2Fopen.spotify.com%2Fepisode%2F1OeqSf37ErIob8zxiXG129%3Fsi%3DPi81sUO5RW-t2jtPuXKNYw"
        ```

*   **Convertir un episodio de Apple Podcasts a Spotify (especificando país España):**

    *   *Navegador:*
        ```
        http://localhost:3000/convert?url=https://podcasts.apple.com/es/podcast/marcos-v%C3%A1zquez-secretos-de-productividad-salud/id1451794657?i=1000697901100&country=ES
        ```
    *   *curl:*
        ```bash
        curl "http://localhost:3000/convert?url=https%3A%2F%2Fpodcasts.apple.com%2Fes%2Fpodcast%2Fmarcos-v%25C3%25A1zquez-secretos-de-productividad-salud%2Fid1451794657%3Fi%3D1000697901100&country=ES"
        ```

*   **Convertir una canción de Apple Music a Spotify:**

    *   *Navegador:*
        ```
        http://localhost:3000/convert?url=https://music.apple.com/us/album/as-it-was/1615584971?i=1615584975
        ```
    *   *curl:*
        ```bash
        curl "http://localhost:3000/convert?url=https%3A%2F%2Fmusic.apple.com%2Fus%2Falbum%2Fas-it-was%2F1615584971%3Fi%3D1615584975"

        ```

## Formato de Respuesta

*   **Éxito (Código 200 OK):**

    ```json
    {
        "source": "spotify", // o "apple"
        "target": "apple",   // o "spotify"
        "inputUrl": "URL_ORIGINAL_PROPORCIONADA",
        "outputUrl": "URL_CONVERTIDA_ENCONTRADA",
        "details": {
            "spotify": { // Detalles del item en Spotify (si se encontró o era el origen)
                "type": "...",
                "id": "...",
                "name": "...",
                "artist": "...",
                "album": "..." // o show
            },
            "apple": { // Detalles del item en Apple (si se encontró o era el origen)
                "type": "...", // tipo interno (track, album, artist, show, episode)
                "id": "...",   // ID usado para lookup/encontrado
                "showId": "..." // ID del show (solo si type='episode')
                "kind": "...", // kind o wrapperType de la API de Apple
                "name": "...",
                "artist": "...",
                "collection": "..." // collectionName
            }
        }
    }
    ```

*   **No Encontrado (Código 404 Not Found):**

    ```json
    {
        "error": "No se encontró una coincidencia en apple.", // o spotify
        "source": "spotify", // o "apple"
        "target": "apple",   // o "spotify"
        "inputUrl": "URL_ORIGINAL_PROPORCIONADA",
        "details": {
             // ... detalles del item de origen (si se pudieron obtener) ...
        }
    }
    ```

*   **Error de Entrada (Código 400 Bad Request):**

    ```json
    {
        "error": "Mensaje descriptivo del error (ej: URL no reconocida, parámetro 'url' requerido, etc.)"
    }
    ```

*   **Error Interno (Código 500 Internal Server Error):**

    ```json
    {
        "error": "Mensaje descriptivo del error interno (ej: Error en la conversión: No se pudo autenticar con Spotify.)",
        "source": "...",
        "target": "...",
        "inputUrl": "..."
    }
    ```

## Limitaciones

*   **Precisión del Matching:** La conversión se basa en búsquedas por metadatos (título, artista, álbum/show). Puede que no siempre encuentre la coincidencia exacta, especialmente si los metadatos difieren ligeramente entre plataformas o si hay múltiples versiones. La conversión Apple -> Spotify puede ser menos precisa para episodios si el nombre exacto no se puede determinar.
*   **Playlists:** La conversión de playlists no está soportada actualmente debido a su complejidad (requeriría procesar cada item individualmente).
*   **Disponibilidad Regional:** Un item puede existir en una plataforma en una región pero no en la otra. La conversión podría fallar si el contenido no está disponible en la plataforma de destino (o en la región usada para la búsqueda).
*   **URLs No Estándar:** URLs de Apple Music/Podcasts con formatos muy antiguos o inusuales podrían no ser parseadas correctamente.
*   **Dependencia de APIs Externas:** El servicio depende de la disponibilidad y funcionamiento de las APIs de Spotify y Apple.

## Posibles Mejoras Futuras

*   **Interfaz de Usuario (Frontend):** Crear una interfaz web simple para pegar URLs y ver los resultados.
*   **Matching Avanzado:** Implementar lógica de *fuzzy matching* (ej. usando `fuse.js`) para mejorar la precisión al comparar resultados de búsqueda. Comparar duraciones podría ayudar para canciones/episodios.
*   **Caching:** Almacenar en caché los resultados de conversiones exitosas para reducir llamadas a las APIs y mejorar el rendimiento.
*   **Soporte para Playlists:** Añadir la lógica compleja para convertir playlists.
*   **Manejo de Errores Más Detallado:** Proveer códigos de error o mensajes más específicos para diferentes tipos de fallos.
*   **Tests Unitarios/Integración:** Añadir pruebas automatizadas.

## Licencia

Este proyecto puede ser distribuido bajo los términos de la Licencia MIT (o la licencia que prefieras).
