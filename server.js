const express = require('express');
const cors = require('cors');
const { createClient } = require('redis');
const { v4: uuidv4 } = require('uuid');

const app = express();
app.use(express.json());
app.use(cors());

// 🔗 Connect to Redis
const redis = createClient({ url: 'redis://red-d3l6jqruibrs73cer66g:6379' });
redis.on('error', err => console.error('Redis error:', err));
await redis.connect();

const GEO_KEY = 'coordinates';

// 🟢 POST /api/coordinates → store new coordinate
app.post('/api/coordinates', async (req, res) => {
  const { lat, lng } = req.body;
  if (!lat || !lng) return res.status(400).json({ error: 'lat/lng required' });

  const id = uuidv4(); // unique id for this point
  try {
    await redis.geoAdd(GEO_KEY, {
      longitude: lng,
      latitude: lat,
      member: id
    });
    await redis.hSet(`coord:${id}`, { lat, lng, createdAt: new Date().toISOString() });
    res.status(201).json({ message: 'Coordinate saved', id });
  } catch (err) {
    console.error('❌ Redis error:', err);
    res.status(500).json({ error: 'Redis error' });
  }
});

// 🟢 GET /api/coordinates → return all coordinates
app.get('/api/coordinates', async (req, res) => {
  try {
    const members = await redis.zRange(GEO_KEY, 0, -1);
    const coords = [];
    for (const id of members) {
      const data = await redis.hGetAll(`coord:${id}`);
      if (data.lat && data.lng) coords.push({ id, lat: parseFloat(data.lat), lng: parseFloat(data.lng) });
    }
    res.json(coords);
  } catch (err) {
    console.error('❌ Redis error:', err);
    res.status(500).json({ error: 'Redis error' });
  }
});

// 🟢 GET /api/near?lat=&lng=&radius= (optional)
app.get('/api/near', async (req, res) => {
  const { lat, lng, radius = 1000 } = req.query;
  try {
    const results = await redis.geoRadius(GEO_KEY, {
      longitude: parseFloat(lng),
      latitude: parseFloat(lat),
      radius: parseFloat(radius),
      unit: 'm',
      WITHDIST: true
    });

    const coords = [];
    for (const r of results) {
      const data = await redis.hGetAll(`coord:${r.member}`);
      if (data.lat && data.lng) {
        coords.push({
          id: r.member,
          lat: parseFloat(data.lat),
          lng: parseFloat(data.lng),
          distance: r.distance
        });
      }
    }

    res.json(coords);
  } catch (err) {
    console.error('❌ Redis error:', err);
    res.status(500).json({ error: 'Redis error' });
  }
});

app.listen(3000, () => console.log('✅ Server running on redis://red-d3l6jqruibrs73cer66g:6379'));
