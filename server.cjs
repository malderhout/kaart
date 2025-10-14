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

// Sla een nieuwe vorm op
app.post('/api/save-shape', async (req, res) => {
    const { type, geometry, projectName } = req.body;

    if (!type || !geometry) {
        return res.status(400).json({ message: 'Invalid shape data provided.' });
    }

    try {
        let newId;
        const dataToStore = JSON.stringify({ type, geometry, projectName: projectName || 'N.v.t.' });
        if (isRedisConnected) {
            newId = await client.incr('shape_id_counter');
            await client.hSet('shapes', `shape-${newId}`, dataToStore);
        } else {
            newId = ++memoryCounter;
            memoryStorage[`shape-${newId}`] = JSON.parse(dataToStore);
        }
        const responseData = { id: `shape-${newId}`, type, geometry, projectName: projectName || 'N.v.t.' };
        res.status(201).json({ message: 'Shape saved!', data: responseData });
    } catch (error) {
        console.error('Error saving shape:', error);
        res.status(500).json({ message: 'Failed to save shape.' });
    }
});

// Haal alle vormen op
app.get('/api/shapes', async (req, res) => {
    try {
        let shapes = {};
        if (isRedisConnected) {
            const redisShapes = await client.hGetAll('shapes');
            for (const key in redisShapes) {
                shapes[key] = JSON.parse(redisShapes[key]);
            }
        } else {
            shapes = memoryStorage;
        }
        res.status(200).json({ data: shapes });
    } catch (error) {
        console.error('Error fetching shapes:', error);
        res.status(500).json({ message: 'Failed to fetch shapes.' });
    }
});

// Verwijder één vorm
app.delete('/api/shapes/:id', async (req, res) => {
    const { id } = req.params;
    try {
        if (isRedisConnected) {
            await client.hDel('shapes', id);
        } else {
            delete memoryStorage[id];
        }
        res.status(200).json({ message: `Shape ${id} deleted.` });
    } catch (error) {
        console.error(`Error deleting shape ${id}:`, error);
        res.status(500).json({ message: `Failed to delete shape ${id}.` });
    }
});

// Verwijder alle vormen
app.delete('/api/shapes', async (req, res) => {
    try {
        if (isRedisConnected) {
            await client.del('shapes');
            await client.del('shape_id_counter');
        } else {
            memoryStorage = {};
            memoryCounter = 0;
        }
        res.status(200).json({ message: 'All shapes deleted.' });
    } catch (error) {
        console.error('Error deleting shapes:', error);
        res.status(500).json({ message: 'Failed to delete shapes.' });
    }
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server is running on port ${PORT}`);
});