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
            redisClient = null;
        }
    } else {
        console.warn('REDIS_URL is niet ingesteld. Data wordt alleen in het geheugen opgeslagen.');
    }
})();

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname)));

// Fallback in-memory opslag en teller
let markersStore = {};
let memoryCounter = 0;

// --- API ROUTES ---

// POST: Sla een vlaggetje op met een server-gegenereerd ID
app.post('/api/save-marker', async (req, res) => {
    const { latitude, longitude } = req.body;
    if (!latitude || !longitude) {
        return res.status(400).json({ status: 'error', message: 'Ongeldige data.' });
    }
    
    let newId;
    let markerId;
    const markerData = {
        latitude: String(latitude),
        longitude: String(longitude),
        timestamp: new Date().toISOString()
    };

    if (redisClient && redisClient.isReady) {
        newId = await redisClient.incr('marker_id_counter');
        markerId = `flag-${newId}`;
        await redisClient.hSet(markerId, markerData);
    } else {
        memoryCounter++;
        newId = memoryCounter;
        markerId = `flag-${newId}`;
        markersStore[markerId] = markerData;
    }
    
    // Stuur de complete data, inclusief het nieuwe ID, terug
    res.status(201).json({ status: 'success', data: { id: markerId, ...markerData } });
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

// DELETE: Verwijder alle vlaggetjes en reset de teller
app.delete('/api/markers', async (req, res) => {
    if (redisClient && redisClient.isReady) {
        const keys = await redisClient.keys('flag-*');
        if (keys.length > 0) {
            await redisClient.del(keys);
        }
        // Reset ook de teller
        await redisClient.set('marker_id_counter', '0');
        console.log(`${keys.length} vlaggetjes en teller verwijderd uit Redis.`);
    } else {
        markersStore = {};
        memoryCounter = 0;
        console.log('Alle vlaggetjes en teller verwijderd uit geheugen (fallback).');
    }
    res.status(200).json({ status: 'success', message: 'Alle vlaggetjes zijn succesvol verwijderd.' });
});

app.listen(port, () => {
    console.log(`Node.js server draait op poort ${port}`);
});