const express = require('express');
const cors = require('cors');
const redis = require('redis');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Redis Client Setup
const redisUrl = process.env.REDIS_URL;
let client;
let isRedisConnected = false;

// In-memory fallback
let memoryStorage = {};
let memoryCounter = 0;

(async () => {
    if (redisUrl) {
        try {
            client = redis.createClient({ url: redisUrl });
            client.on('error', (err) => {
                console.error('Redis Client Error:', err);
                isRedisConnected = false;
            });
            await client.connect();
            isRedisConnected = true;
            console.log('Successfully connected to Redis.');
        } catch (err) {
            console.error('Failed to connect to Redis:', err);
            isRedisConnected = false;
        }
    } else {
        console.warn('REDIS_URL not found. Using in-memory storage as a fallback.');
    }
})();

// Serve de frontend
app.use(express.static(path.join(__dirname, 'public')));
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// --- API ROUTES ---

// Sla een nieuwe polygoon op
app.post('/api/save-polygon', async (req, res) => {
    const { points, projectName } = req.body; // Haal projectnaam uit de body

    if (!points || !Array.isArray(points) || points.length < 3) {
        return res.status(400).json({ message: 'Invalid polygon data provided.' });
    }

    try {
        let newId;
        const dataToStore = JSON.stringify({ points, projectName: projectName || 'N.v.t.' }); // Sla object op

        if (isRedisConnected) {
            newId = await client.incr('polygon_id_counter');
            const polygonKey = `polygon-${newId}`;
            await client.hSet('polygons', polygonKey, dataToStore);
        } else {
            newId = ++memoryCounter;
            const polygonKey = `polygon-${newId}`;
            memoryStorage[polygonKey] = JSON.parse(dataToStore);
        }
        
        const responseData = { id: `polygon-${newId}`, points, projectName: projectName || 'N.v.t.' };
        res.status(201).json({ message: 'Polygon saved!', data: responseData });

    } catch (error) {
        console.error('Error saving polygon:', error);
        res.status(500).json({ message: 'Failed to save polygon.' });
    }
});


// Haal alle polygonen op
app.get('/api/polygons', async (req, res) => {
    try {
        let polygons = {};
        if (isRedisConnected) {
            const redisPolygons = await client.hGetAll('polygons');
            // Parse de JSON strings terug naar objecten
            for (const key in redisPolygons) {
                polygons[key] = JSON.parse(redisPolygons[key]);
            }
        } else {
            polygons = memoryStorage;
        }
        res.status(200).json({ data: polygons });
    } catch (error) {
        console.error('Error fetching polygons:', error);
        res.status(500).json({ message: 'Failed to fetch polygons.' });
    }
});

// Verwijder alle polygonen
app.delete('/api/polygons', async (req, res) => {
    try {
        if (isRedisConnected) {
            await client.del('polygons');
            await client.del('polygon_id_counter');
        } else {
            memoryStorage = {};
            memoryCounter = 0;
        }
        res.status(200).json({ message: 'All polygons deleted.' });
    } catch (error) {
        console.error('Error deleting polygons:', error);
        res.status(500).json({ message: 'Failed to delete polygons.' });
    }
});


// Start de server
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server is running on port ${PORT}`);
});