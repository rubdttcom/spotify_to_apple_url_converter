require('dotenv').config();
const express = require('express');
const axios = require('axios');
const { URL } = require('url');

const app = express();
const PORT = process.env.PORT || 3000;

const SPOTIFY_CLIENT_ID = process.env.SPOTIFY_CLIENT_ID;
const SPOTIFY_CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET;

let spotifyAccessToken = null;
let tokenExpiryTime = 0;

// --- Spotify Auth ---
async function getSpotifyAccessToken() {
    // ... (igual que antes)
    const now = Date.now();
    if (spotifyAccessToken && now < tokenExpiryTime - (5 * 60 * 1000)) {
        return spotifyAccessToken;
    }
    console.log('Obteniendo nuevo token de acceso de Spotify...');
    try {
        const response = await axios.post('https://accounts.spotify.com/api/token',
            'grant_type=client_credentials',
            {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Authorization': 'Basic ' + Buffer.from(SPOTIFY_CLIENT_ID + ':' + SPOTIFY_CLIENT_SECRET).toString('base64')
                }
            }
        );
        spotifyAccessToken = response.data.access_token;
        tokenExpiryTime = now + (response.data.expires_in * 1000);
        console.log('Token de Spotify obtenido exitosamente.');
        return spotifyAccessToken;
    } catch (error) {
        console.error('Error al obtener el token de Spotify:', error.response?.data || error.message);
        throw new Error('No se pudo autenticar con Spotify.');
    }
}

// --- Spotify -> Apple ---

function parseSpotifyUrl(spotifyUrlString) {
    // ... (igual que antes)
     try {
        const parsedUrl = new URL(spotifyUrlString);
        if (parsedUrl.hostname !== 'open.spotify.com') return null;
        const pathParts = parsedUrl.pathname.split('/').filter(part => part.length > 0);
        let typeIndex = pathParts.findIndex(part => ['track', 'album', 'artist', 'show', 'episode'].includes(part));
        if (typeIndex === -1 || typeIndex + 1 >= pathParts.length) return null;
        const type = pathParts[typeIndex];
        const id = pathParts[typeIndex + 1];
        if (!id) return null;
        return { source: 'spotify', type, id, originalUrl: spotifyUrlString };
    } catch (error) {
        console.error("Error parseando la URL de Spotify:", error.message);
        return null;
    }
}

async function getSpotifyDetails(type, id) {
    // ... (igual que antes, sólo cambia el mensaje de error un poco)
    const token = await getSpotifyAccessToken();
    const baseUrl = 'https://api.spotify.com/v1';
    let url = '';
    switch (type) {
        case 'track': url = `${baseUrl}/tracks/${id}`; break;
        case 'album': url = `${baseUrl}/albums/${id}`; break;
        case 'artist': url = `${baseUrl}/artists/${id}`; break;
        case 'show': url = `${baseUrl}/shows/${id}`; break;
        case 'episode': url = `${baseUrl}/episodes/${id}`; break;
        default: throw new Error(`Tipo de Spotify no soportado: ${type}`);
    }
    try {
        const response = await axios.get(url, { headers: { 'Authorization': `Bearer ${token}` } });
        return response.data;
    } catch (error) {
        const errorData = error.response?.data;
        const status = error.response?.status;
        console.error(`Error fetching Spotify details (${type}/${id}):`, status, errorData || error.message);
        if (status === 404) throw new Error(`Elemento de Spotify no encontrado (${type}/${id})`);
        throw new Error(`Error al comunicarse con la API de Spotify.`);
    }
}

async function searchApple(spotifyData, spotifyType, country = 'US') {
    // ... (igual que antes)
    const itunesApiUrl = 'https://itunes.apple.com/search';
    let searchTerm = '';
    let entity = '';
    let media = 'music';
    switch (spotifyType) {
        case 'track':
            searchTerm = `${spotifyData.name} ${spotifyData.artists.map(a => a.name).join(' ')} ${spotifyData.album.name}`;
            entity = 'song'; media = 'music'; break;
        case 'album':
            searchTerm = `${spotifyData.name} ${spotifyData.artists.map(a => a.name).join(' ')}`;
            entity = 'album'; media = 'music'; break;
        case 'artist':
            searchTerm = spotifyData.name;
            entity = 'musicArtist'; media = 'music'; break;
        case 'show':
            searchTerm = spotifyData.name;
            entity = 'podcast'; media = 'podcast'; break;
        case 'episode':
            searchTerm = `${spotifyData.name} ${spotifyData.show.name}`;
            entity = 'podcastEpisode'; media = 'podcast'; break;
        default: throw new Error(`Tipo de Spotify no manejado para búsqueda en Apple: ${spotifyType}`);
    }
    console.log(`Searching Apple [${country}]: Term='${searchTerm}', Entity='${entity}', Media='${media}'`);
    try {
        const response = await axios.get(itunesApiUrl, { params: { term: searchTerm, country: country, media: media, entity: entity, limit: 5 } });
        if (response.data.resultCount > 0) {
             // Lógica de matching (igual que antes, buscando el tipo correcto)
             const results = response.data.results;
             let match = null;
             for(const result of results) {
                 if (spotifyType === 'track' && result.kind === 'song') { match = result; break; }
                 if (spotifyType === 'album' && result.wrapperType === 'collection' && result.collectionType === 'Album') { match = result; break; }
                 if (spotifyType === 'artist' && result.wrapperType === 'artist' && result.artistType === 'MusicArtist') { match = result; break; }
                 if (spotifyType === 'show' && result.kind === 'podcast') { match = result; break; }
                 if (spotifyType === 'episode' && result.kind === 'podcast-episode') { match = result; break; }
             }
             if (match) {
                console.log(`Apple match found: ${match.trackName || match.collectionName || match.artistName || match.trackName}`);
             } else {
                console.log('No strict match found in Apple results, returning null.');
             }
             return match;
        } else {
            console.log('No results found on Apple.');
            return null;
        }
    } catch (error) {
        console.error('Error searching Apple API:', error.response?.data || error.message);
        throw new Error('Error communicating with Apple API.');
    }
}

function buildAppleUrl(appleResult, spotifyType) {
    // ... (igual que antes)
    if (!appleResult) return null;
    switch (spotifyType) {
        case 'track': return appleResult.trackViewUrl || null;
        case 'album': return appleResult.collectionViewUrl || null;
        case 'artist': return appleResult.artistViewUrl || null;
        case 'show': return appleResult.collectionViewUrl || appleResult.feedUrl || null;
        case 'episode': return appleResult.trackViewUrl || null;
        default: return null;
    }
}

// --- Apple -> Spotify ---

function parseAppleUrl(appleUrlString) {
    try {
        console.log(`[parseAppleUrl] Intentando parsear: ${appleUrlString}`); // LOG 1: Input
        const parsedUrl = new URL(appleUrlString);
        const hostname = parsedUrl.hostname;
        const pathParts = parsedUrl.pathname.split('/').filter(part => part.length > 0);

        if (!['music.apple.com', 'podcasts.apple.com', 'itunes.apple.com'].includes(hostname)) {
            return null; // No es una URL de Apple reconocida
        }

        let country = 'us'; // Default US
        let type = null;
        let collectionOrArtistIdFromPath = null; // Renombrado para claridad
        let trackOrEpisodeIdFromQuery = parsedUrl.searchParams.get('i'); // ID de canción o episodio de ?i=

        console.log(`[parseAppleUrl] Host: ${hostname}, PathParts: ${pathParts.join('/')}, Query 'i': ${trackOrEpisodeIdFromQuery}`); // LOG 2: Params basicos

        // Detectar país y tipo potencial
        let potentialTypeIndex = -1;
        if (pathParts.length > 0 && /^[a-zA-Z]{2}$/.test(pathParts[0])) {
            country = pathParts[0].toLowerCase();
            potentialTypeIndex = 1;
        } else {
            potentialTypeIndex = 0; // Asumir que no hay código de país
        }

        let potentialIdIndex = -1;
        if (potentialTypeIndex < pathParts.length) {
            const potentialType = pathParts[potentialTypeIndex];
            potentialIdIndex = potentialTypeIndex + 2; // El ID suele estar 2 pos después (type/name/id)

            if (hostname === 'podcasts.apple.com' || potentialType === 'podcast') {
                 // Intenta encontrar SIEMPRE el ID del show en la ruta, si existe
                 collectionOrArtistIdFromPath = pathParts.find((part, index) => index > potentialTypeIndex && /^(?:id)?(\d+)$/.test(part))?.match(/^(?:id)?(\d+)$/)?.[1];
                 console.log(`[parseAppleUrl] Podcast Show ID from path (if found): ${collectionOrArtistIdFromPath}`);

                 if (trackOrEpisodeIdFromQuery) { // Si hay ?i=, ES un episodio
                     type = 'episode';
                     console.log("[parseAppleUrl] Detected type: episode (based on ?i=)");
                 } else if (collectionOrArtistIdFromPath) { // Si no hay ?i= pero SÍ hay ID de show en ruta, es un show
                    type = 'show';
                    console.log("[parseAppleUrl] Detected type: show (no ?i=, using path ID)");
                 } else {
                    // Ni ?i= ni ID de show claro en la ruta - URL ambigua/no soportada
                    console.warn("[parseAppleUrl] Podcast URL sin ?i= ni ID de show claro en la ruta.");
                 }

            } else if (hostname === 'music.apple.com' || hostname === 'itunes.apple.com') {
                // Intentar obtener ID de album/artista de la ruta
                if (potentialIdIndex < pathParts.length) {
                    collectionOrArtistIdFromPath = pathParts[potentialIdIndex];
                }
                 console.log(`[parseAppleUrl] Music Collection/Artist ID from path (if found): ${collectionOrArtistIdFromPath}`);

                if (potentialType === 'album') {
                    // Si hay ?i=, es una canción DENTRO de un álbum. Si no, es el álbum.
                    type = trackOrEpisodeIdFromQuery ? 'track' : 'album';
                } else if (potentialType === 'artist') {
                    type = 'artist';
                    // Para artistas, el ID de la ruta es el principal, ?i= no suele aplicar.
                     trackOrEpisodeIdFromQuery = null; // Ignorar ?i= para artistas
                } else if (potentialType === 'song' || potentialType === 'track') {
                    type = 'track';
                    // El ID de la canción podría estar en la ruta O en ?i=
                } else if (trackOrEpisodeIdFromQuery) {
                     // Si hay ?i= pero el tipo no es claro (ej: playlist, radio station link)
                     // Asumimos 'track' por ahora.
                     type = 'track';
                     collectionOrArtistIdFromPath = null; // No tenemos ID de colección claro
                 }
                 console.log(`[parseAppleUrl] Detected Music type: ${type}`);
            }
        }

        // --- Selección Final del ID para la Búsqueda (Lookup) ---
        let lookupId = null;
        let showIdForEpisode = null; // Variable adicional
    
        if (type === 'episode' || type === 'track') {
            lookupId = trackOrEpisodeIdFromQuery;
            if (type === 'episode') {
                 showIdForEpisode = collectionOrArtistIdFromPath; // Guardar el ID del show si es episodio
            }
            if (!lookupId) {
                 // ... (advertencia de fallback) ...
                 lookupId = collectionOrArtistIdFromPath;
            }
        } else if (type === 'show' || type === 'album' || type === 'artist') {
            lookupId = collectionOrArtistIdFromPath;
        }
    
        if (!type || !lookupId) {
            // ... (error final) ...
            return null;
        }
    
        console.log(`[parseAppleUrl] Result: Type=${type}, LookupID=${lookupId}, ShowID (if episode): ${showIdForEpisode}, Country=${country}`);
        return {
             source: 'apple',
             type,
             id: lookupId, // Este sigue siendo el ID principal (episodio o track)
             showId: showIdForEpisode, // ID específico del show para episodios
             country,
             originalUrl: appleUrlString
         };

    } catch (error) {
        console.error(`[parseAppleUrl] CRITICAL ERROR parsing URL '${appleUrlString}':`, error.message); // LOG 5: Error Catch
        return null;
    }
}

async function getAppleDetails(type, id, country) {
    const itunesApiUrl = 'https://itunes.apple.com/lookup';
    // Mapear nuestro tipo interno a la entidad de iTunes API
    let entity;
    switch(type) {
        case 'track': entity = 'song'; break; // track -> song
        case 'album': entity = 'album'; break;
        case 'artist': entity = 'musicArtist'; break; // artist -> musicArtist
        case 'show': entity = 'podcast'; break; // show -> podcast
        case 'episode': entity = 'podcastEpisode'; break; // episode -> podcastEpisode
        default: entity = ''; // Dejar que iTunes infiera si no estamos seguros
    }

    console.log(`Looking up Apple details: ID=${id}, Entity=${entity}, Country=${country}`);
    try {
        const response = await axios.get(itunesApiUrl, {
            params: {
                id: id,
                country: country,
                entity: entity,
            }
        });

        if (response.data.resultCount > 0) {
            // La API lookup devuelve el item principal en results[0]
            const details = response.data.results[0];
             console.log(`Apple details found: ${details.trackName || details.collectionName || details.artistName}`);
            return details;
        } else {
            console.log('No details found on Apple for this ID.');
            return null;
        }
    } catch (error) {
        console.error('Error looking up Apple details:', error.response?.data || error.message);
        throw new Error('Error communicating with Apple API for lookup.');
    }
}

async function searchSpotify(appleDetails, appleType) {
    const token = await getSpotifyAccessToken();
    const spotifySearchUrl = 'https://api.spotify.com/v1/search';
    let query = '';
    let type = ''; // Tipo para la API de Spotify

    // Construir query de búsqueda para Spotify basada en detalles de Apple
    switch (appleType) {
        case 'track': // kind: 'song'
            query = `track:"${appleDetails.trackName}" artist:"${appleDetails.artistName}" album:"${appleDetails.collectionName}"`;
            type = 'track';
            break;
        case 'album': // wrapperType: 'collection', collectionType: 'Album'
            query = `album:"${appleDetails.collectionName}" artist:"${appleDetails.artistName}"`;
            type = 'album';
            break;
        case 'artist': // wrapperType: 'artist'
            query = `artist:"${appleDetails.artistName}"`;
            type = 'artist';
            break;
        case 'show': // kind: 'podcast'
            // Incluir publisher si está disponible, puede ayudar a desambiguar
            query = `show:"${appleDetails.collectionName}" ${appleDetails.artistName ? `artist:"${appleDetails.artistName}"` : ''}`;
            type = 'show';
            break;
        case 'episode':// kind: 'podcast-episode'
            // Priorizar búsqueda con nombre de episodio si lo tenemos
            if (appleDetails.trackName) {
                query = `episode:"${appleDetails.trackName}" show:"${appleDetails.collectionName}"`;
            } else {
                // Fallback: buscar solo por show (menos preciso)
                query = `show:"${appleDetails.collectionName}" ${appleDetails.artistName ? `artist:"${appleDetails.artistName}"` : ''}`;
            }
            type = 'episode';
            break;
            throw new Error(`Tipo de Apple no manejado para búsqueda en Spotify: ${appleType}`);
    }

    // Limpiar caracteres especiales que puedan romper la query de Spotify
    query = query.replace(/[:"']/g, ''); // Quitar comillas dobles, simples y dos puntos

    console.log(`Searching Spotify: Query='${query}', Type='${type}'`);

    try {
        const response = await axios.get(spotifySearchUrl, {
            headers: { 'Authorization': `Bearer ${token}` },
            params: {
                q: query,
                type: type,
                limit: 5 // Limitar resultados
            }
        });

        const results = response.data[`${type}s`]?.items; // Ej. response.data.tracks.items

        if (results && results.length > 0) {
            // --- Lógica de Matching (Simplificada) ---
            // Podríamos hacerla más robusta comparando duraciones, etc.
            // Por ahora, devolvemos el primer resultado.
            const potentialMatch = results[0];
            console.log(`Spotify match found: ${potentialMatch.name}`);
            return potentialMatch;
        } else {
            console.log('No results found on Spotify.');
            return null;
        }
    } catch (error) {
        console.error('Error searching Spotify API:', error.response?.data || error.message);
        throw new Error('Error communicating with Spotify Search API.');
    }
}


function buildSpotifyUrl(spotifyResult, appleType) {
    if (!spotifyResult || !spotifyResult.id) return null;
    // El tipo de Spotify debería coincidir con el tipo que buscamos
    let spotifyType = '';
     switch (appleType) {
        case 'track': spotifyType = 'track'; break;
        case 'album': spotifyType = 'album'; break;
        case 'artist': spotifyType = 'artist'; break;
        case 'show': spotifyType = 'show'; break;
        case 'episode': spotifyType = 'episode'; break;
        default: return null; // No debería pasar si la búsqueda fue exitosa
    }

    return `https://open.spotify.com/${spotifyType}/${spotifyResult.id}`;
}


// --- Funciones Principales de Conversión ---

async function convertSpotifyToApple(parsedInfo, country) {
    const { type, id } = parsedInfo;
    console.log(`Converting Spotify -> Apple: Type=${type}, ID=${id}`);
    const spotifyDetails = await getSpotifyDetails(type, id);
    const appleResult = await searchApple(spotifyDetails, type, country);
    const appleUrl = buildAppleUrl(appleResult, type);
    return {
        source: 'spotify',
        target: 'apple',
        inputUrl: parsedInfo.originalUrl,
        outputUrl: appleUrl,
        details: { // Incluir detalles para referencia
            spotify: {
                type: type,
                id: id,
                name: spotifyDetails.name,
                artist: spotifyDetails.artists ? spotifyDetails.artists.map(a => a.name).join(', ') : (spotifyDetails.show ? spotifyDetails.show.publisher : null),
                album: spotifyDetails.album ? spotifyDetails.album.name : (spotifyDetails.show ? spotifyDetails.show.name : null)
            },
            apple: appleResult ? {
                 kind: appleResult.kind,
                 name: appleResult.trackName || appleResult.collectionName || appleResult.artistName,
                 artist: appleResult.artistName,
                 collection: appleResult.collectionName,
                 id: appleResult.trackId || appleResult.collectionId || appleResult.artistId,
            } : null
        }
    };
}

async function convertAppleToSpotify(parsedInfo) {
    const { type, id: episodeOrTrackId, showId, country } = parsedInfo; // Extraer showId
    console.log(`Converting Apple -> Spotify: Type=${type}, ID=${episodeOrTrackId}, ShowID=${showId}, Country=${country}`);

    let appleShowDetails = null;
    let appleEpisodeName = null;

    if (type === 'episode' && showId) {
        // --- Estrategia para Episodios ---
        console.log(`[A->S Episode] Looking up Show details first. ShowID: ${showId}`);
        try {
             // 1. Obtener detalles del SHOW para nombre y publisher
             appleShowDetails = await getAppleDetails('show', showId, country);

             if (!appleShowDetails) {
                 throw new Error(`No se pudieron obtener detalles del Show de Apple para ID ${showId}`);
             }
             console.log(`[A->S Episode] Found Show: ${appleShowDetails.collectionName}`);

            // 2. BUSCAR el episodio dentro del show para obtener su nombre
            console.log(`[A->S Episode] Searching Apple for Episode Name. Show: ${appleShowDetails.collectionName}, EpisodeID: ${episodeOrTrackId}`);
            const searchUrl = 'https://itunes.apple.com/search';
            const searchResponse = await axios.get(searchUrl, {
                params: {
                    // Buscar episodios DENTRO de la colección (show) específica
                    term: appleShowDetails.collectionName, // Usar nombre del show como término base
                    id: showId, // Filtrar por ID de colección (esto es clave)
                    entity: 'podcastEpisode',
                    media: 'podcast',
                    country: country,
                    limit: 200 // Aumentar límite por si hay muchos episodios
                }
            });

            if (searchResponse.data.resultCount > 0) {
                // Buscar el episodio específico por su trackId (nuestro episodeOrTrackId)
                const foundEpisode = searchResponse.data.results.find(
                    result => result.kind === 'podcast-episode' && result.trackId?.toString() === episodeOrTrackId?.toString()
                );
                if (foundEpisode && foundEpisode.trackName) {
                     appleEpisodeName = foundEpisode.trackName;
                     console.log(`[A->S Episode] Found Episode Name via search: ${appleEpisodeName}`);
                } else {
                     console.warn(`[A->S Episode] Episode ID ${episodeOrTrackId} not found within Show ${showId} search results.`);
                     // Podríamos intentar buscar por el ID del episodio directamente en search como fallback?
                     // const fallbackSearch = await axios.get(searchUrl, { params: { term: episodeOrTrackId, entity: 'podcastEpisode', ...}}); ...
                     // Por ahora, si no se encuentra aquí, la búsqueda en Spotify será menos precisa.
                }
            } else {
                console.warn(`[A->S Episode] No episodes found via search for Show ID ${showId}`);
            }

        } catch (error) {
             console.error("[A->S Episode] Error during Apple Show lookup or Episode search:", error.message);
             throw new Error(`Error al obtener detalles/buscar episodio en Apple: ${error.message}`);
        }

        // Si no pudimos obtener el nombre del episodio, la búsqueda en Spotify será menos fiable
        if (!appleEpisodeName) {
             console.warn("[A->S Episode] Could not determine episode name from Apple. Spotify search may be inaccurate.");
             // Podrías decidir fallar aquí o continuar con una búsqueda menos específica.
             // Vamos a continuar, pero la búsqueda de Spotify podría devolver el show u otro episodio.
        }

    } else if (type === 'track' || type === 'album' || type === 'artist' || type === 'show') {
         // --- Estrategia Original para otros tipos (usando lookup directo) ---
        console.log(`[A->S ${type}] Using direct Apple lookup. ID: ${episodeOrTrackId}`);
        appleShowDetails = await getAppleDetails(type, episodeOrTrackId, country); // Reusamos la variable, aunque aquí contiene detalles del item principal
        if (!appleShowDetails) {
            throw new Error(`No se pudieron obtener detalles de Apple para ${type} ID ${episodeOrTrackId}`);
        }
         // Para estos tipos, el nombre principal ya está en appleShowDetails
         appleEpisodeName = appleShowDetails.trackName; // O collectionName, artistName según el tipo
    } else {
         throw new Error(`Tipo de Apple no manejado en conversión: ${type}`);
    }


    // 3. Buscar en Spotify
     // Construir un objeto simulado 'appleDetails' para searchSpotify
     // Necesitamos: showName, episodeName (si existe), artistName (publisher)
     const detailsForSpotifySearch = {
         // Para episodios: nombre episodio (si lo encontramos) + nombre show
         // Para otros: nombre principal del item
         trackName: appleEpisodeName, // Nombre del episodio (si se encontró) o de la canción
         collectionName: appleShowDetails?.collectionName || (type==='album' ? appleShowDetails?.collectionName : null), // Nombre del show o álbum
         artistName: appleShowDetails?.artistName // Publisher o Artista
     };

     console.log("[A->S] Proceeding to search Spotify with details:", detailsForSpotifySearch);
     const spotifyResult = await searchSpotify(detailsForSpotifySearch, type); // Pasamos el TIPO original
     const spotifyUrl = buildSpotifyUrl(spotifyResult, type); // Pasamos el TIPO original

    // 4. Devolver resultado (la estructura de respuesta puede necesitar ajustes para reflejar los detalles obtenidos)
    return {
        source: 'apple',
        target: 'spotify',
        inputUrl: parsedInfo.originalUrl,
        outputUrl: spotifyUrl,
        details: { // Adaptar detalles devueltos
            apple: {
                type: type,
                id: episodeOrTrackId,
                showId: showId, // Incluir showId si es episodio
                kind: appleShowDetails?.kind || appleShowDetails?.wrapperType,
                name: appleEpisodeName || appleShowDetails?.trackName || appleShowDetails?.collectionName || appleShowDetails?.artistName, // Mejor nombre disponible
                artist: appleShowDetails?.artistName,
                collection: appleShowDetails?.collectionName,
            },
            spotify: spotifyResult ? { /* ... detalles de spotify ... */ } : null
        }
    };
}

// --- Ruta de la API Unificada ---

//app.get('/:encodedInputUrl(*)', async (req, res) => {
app.get('/convert', async (req, res) => {
    const inputUrl = req.query.url; // Obtener la URL del query param 'url'
    const country = req.query.country || 'US'; // Obtener el país (funciona bien aquí)

    if (!inputUrl) {
        return res.status(400).json({ error: 'Query parameter "url" es requerido.' });
    }

    console.log(`[API] Received URL via query param: ${inputUrl}`);
    console.log(`[API] Using country: ${country}`);

    // 1. Detectar y Parsear la URL de entrada (inputUrl)
    //    No necesitas decodificar explícitamente inputUrl aquí,
    //    Express + Node ya lo hacen para req.query.
    const parsedSpotify = parseSpotifyUrl(inputUrl);
    const parsedApple = parseAppleUrl(inputUrl);

    // ... El resto de la lógica de detección, conversión y respuesta
    // ... es prácticamente igual, solo asegúrate de pasar 'country'
    // ... correctamente a convertSpotifyToApple si es necesario.

     let parsedInfo = null;
     let conversionFunction = null;

     if (parsedSpotify) {
         parsedInfo = parsedSpotify;
         conversionFunction = convertSpotifyToApple;
         console.log("Detected Spotify URL.");
     } else if (parsedApple) {
         parsedInfo = parsedApple;
         conversionFunction = convertAppleToSpotify;
         console.log("Detected Apple Music/Podcasts URL.");
     } else {
         return res.status(400).json({ error: 'URL en parámetro "url" no reconocida.', providedUrl: inputUrl });
     }

     // Pasar country extraído del query a la función S->A.
     // La función A->S obtiene el país del parseo de la URL de Apple.
     const conversionArgs = parsedInfo.source === 'spotify' ? [parsedInfo, country] : [parsedInfo];


     try {
        const result = await conversionFunction(...conversionArgs);
         if (result.outputUrl) {
            res.json(result);
         } else {
            res.status(404).json({ /* ... respuesta 404 ... */ });
         }
     } catch (error) {
         console.error(error);
         res.status(500).json({ /* ... respuesta 500 ... */ });
     }
});

// --- Iniciar Servidor ---
app.listen(PORT, () => {
    console.log(`Servidor escuchando en http://localhost:${PORT}`);
    getSpotifyAccessToken().catch(err => console.error("Error inicial obteniendo token de Spotify:", err));
});