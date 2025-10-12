// Importeer de benodigde packages
const express = require('express');
const cors = require('cors');
const redis = require('redis');
const path = require('path'); // Path module is nodig om bestanden te serveren

// Initialiseer de Express applicatie
const app = express();
// Render stelt de PORT omgevingsvariabele in. Gebruik die, of val terug op 3000 voor lokaal.
const port = process.env.PORT || 3000;

// --- REDIS CONNECTIE ---
// Het wordt aangeraden om process.env.REDIS_URL te gebruiken op Render.
const redisUrl = process.env.REDIS_URL 
let redisClient;

(async () => {
    if (redisUrl) {
        redisClient = redis.createClient({ url: redisUrl });
        redisClient.on('error', (err) => console.log('Redis Client Error', err));
        try {
            await redisClient.connect();
            console.log('Succesvol verbonden met Redis.');
        } catch (err) {
            console.error('Kon niet verbinden met Redis:', err);
        }
    } else {
        console.warn('REDIS_URL is niet ingesteld. Data wordt alleen in het geheugen opgeslagen.');
    }
})();
// --------------------

// Gebruik de CORS middleware
app.use(cors());
// Gebruik de express.json() middleware om JSON-data te parsen
app.use(express.json());

// **NIEUW**: Serveer statische bestanden (zoals index.html)
// Deze regel vertelt Express dat het de bestanden in de huidige map moet serveren.
app.use(express.static(path.join(__dirname)));

// Fallback in-memory opslag
let markersStore = {};

// --- API ROUTES ---

// Definieer het endpoint om een vlaggetje op te slaan
app.post('/api/save-marker', async (req, res) => {
    const data = req.body;

    if (!data || !data.latitude || !data.longitude || !data.id) {
        return res.status(400).json({ status: 'error', message: 'Ongeldige data. Vereist: id, latitude, longitude.' });
    }

    const markerId = data.id;
    const markerData = {
        latitude: data.latitude,
        longitude: data.longitude,
        timestamp: data.timestamp
    };

    if (redisClient && redisClient.isReady) {
        try {
            await redisClient.hSet(markerId, markerData);
            console.log(`Vlaggetje ${markerId} opgeslagen in Redis.`);
        } catch (err) {
            console.error('Redis fout bij opslaan:', err);
            return res.status(500).json({ status: 'error', message: 'Kon vlaggetje niet opslaan in Redis.' });
        }
    } else {
        markersStore[markerId] = markerData;
        console.log(`Vlaggetje ${markerId} opgeslagen in geheugen (fallback).`);
    }

    res.status(201).json({ status: 'success', message: 'Vlaggetje succesvol opgeslagen', markerId: markerId });
});

// Endpoint om alle opgeslagen vlaggetjes op te halen
app.get('/api/markers', async (req, res) => {
    let allMarkers = {};

    if (redisClient && redisClient.isReady) {
        try {
            const keys = await redisClient.keys('flag-*'); 
            for (const key of keys) {
                allMarkers[key] = await redisClient.hGetAll(key);
            }
            console.log(`${keys.length} vlaggetjes opgehaald uit Redis.`);
        } catch (err) {
            console.error('Redis fout bij ophalen:', err);
            return res.status(500).json({ status: 'error', message: 'Kon vlaggetjes niet ophalen uit Redis.' });
        }
    } else {
        allMarkers = markersStore;
        console.log('Vlaggetjes opgehaald uit geheugen (fallback).');
    }

    res.status(200).json({ status: 'success', data: allMarkers });
});

// Start de server
app.listen(port, () => {
    console.log(`Node.js server draait op poort ${port}`);
});
