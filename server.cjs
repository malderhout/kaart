const express = require('express');
const cors = require('cors');
const redis = require('redis');
const path = require('path');

const app = express();
const port = process.env.PORT || 3000;

// --- REDIS CONNECTIE ---
const redisUrl = process.env.REDIS_URL; 
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
            redisClient = null; // Zorg ervoor dat we de client niet gebruiken als de connectie faalt
        }
    } else {
        console.warn('REDIS_URL is niet ingesteld. Data wordt alleen in het geheugen opgeslagen.');
    }
})();

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname)));

// Fallback in-memory opslag
let markersStore = {};

// --- API ROUTES ---

// POST: Sla een vlaggetje op
app.post('/api/save-marker', async (req, res) => {
    const data = req.body;
    if (!data || !data.id || !data.latitude || !data.longitude) {
        return res.status(400).json({ status: 'error', message: 'Ongeldige data.' });
    }
    
    if (redisClient && redisClient.isReady) {
        await redisClient.hSet(data.id, {
            latitude: data.latitude,
            longitude: data.longitude,
            timestamp: data.timestamp
        });
    } else {
        markersStore[data.id] = data;
    }
    res.status(201).json({ status: 'success', message: 'Vlaggetje opgeslagen' });
});

// GET: Haal alle vlaggetjes op
app.get('/api/markers', async (req, res) => {
    let allMarkers = {};
    if (redisClient && redisClient.isReady) {
        const keys = await redisClient.keys('flag-*');
        for (const key of keys) {
            allMarkers[key] = await redisClient.hGetAll(key);
        }
    } else {
        allMarkers = markersStore;
    }
    res.status(200).json({ status: 'success', data: allMarkers });
});

// **NIEUW**: DELETE: Verwijder alle vlaggetjes
app.delete('/api/markers', async (req, res) => {
    if (redisClient && redisClient.isReady) {
        const keys = await redisClient.keys('flag-*');
        if (keys.length > 0) {
            await redisClient.del(keys);
        }
        console.log(`${keys.length} vlaggetjes verwijderd uit Redis.`);
    } else {
        markersStore = {}; // Reset de in-memory store
        console.log('Alle vlaggetjes verwijderd uit geheugen (fallback).');
    }
    res.status(200).json({ status: 'success', message: 'Alle vlaggetjes zijn succesvol verwijderd.' });
});

app.listen(port, () => {
    console.log(`Node.js server draait op poort ${port}`);
});