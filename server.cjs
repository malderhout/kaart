const express = require('express');
const cors = require('cors');
const redis = require('redis');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

const redisUrl = process.env.REDIS_URL;
let client;
let isRedisConnected = false;
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

app.use(express.static(path.join(__dirname, 'public')));
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// --- API ROUTES ---

app.post('/api/save-polygon', async (req, res) => {
    const { points, projectName } = req.body;
    if (!points || !Array.isArray(points) || points.length < 3) {
        return res.status(400).json({ message: 'Invalid polygon data provided.' });
    }
    try {
        let newId;
        const dataToStore = JSON.stringify({ points, projectName: projectName || 'N.v.t.' });
        if (isRedisConnected) {
            newId = await client.incr('polygon_id_counter');
            await client.hSet('polygons', `polygon-${newId}`, dataToStore);
        } else {
            newId = ++memoryCounter;
            memoryStorage[`polygon-${newId}`] = JSON.parse(dataToStore);
        }
        const responseData = { id: `polygon-${newId}`, points, projectName: projectName || 'N.v.t.' };
        res.status(201).json({ message: 'Polygon saved!', data: responseData });
    } catch (error) {
        console.error('Error saving polygon:', error);
        res.status(500).json({ message: 'Failed to save polygon.' });
    }
});

app.get('/api/polygons', async (req, res) => {
    try {
        let polygons = {};
        if (isRedisConnected) {
            const redisPolygons = await client.hGetAll('polygons');
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

// Nieuwe route om één polygoon te verwijderen
app.delete('/api/polygons/:id', async (req, res) => {
    const { id } = req.params;
    try {
        if (isRedisConnected) {
            await client.hDel('polygons', id);
        } else {
            delete memoryStorage[id];
        }
        res.status(200).json({ message: `Polygon ${id} deleted.` });
    } catch (error) {
        console.error(`Error deleting polygon ${id}:`, error);
        res.status(500).json({ message: `Failed to delete polygon ${id}.` });
    }
});

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

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server is running on port ${PORT}`);
});