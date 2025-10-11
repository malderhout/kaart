import express from "express";
import cors from "cors";
import { createClient } from "redis";
import { v4 as uuidv4 } from "uuid";

const app = express();
app.use(express.json());
app.use(cors());

// 🔗 Redis configuratie
const REDIS_URL = process.env.REDIS_URL || "redis://red-d3l6jqruibrs73cer66g:6379";
const GEO_KEY = "coordinates";

const redis = createClient({
  url: REDIS_URL,
  socket: {
    tls: REDIS_URL.startsWith("rediss://"), // SSL aanzetten bij Render
    rejectUnauthorized: false
  }
});

redis.on("error", (err) => console.error("❌ Redis fout:", err));
await redis.connect();

// 🟢 POST: sla coördinaat op
app.post("/api/coordinates", async (req, res) => {
  const { lat, lng } = req.body;
  if (!lat || !lng)
    return res.status(400).json({ error: "lat/lng verplicht" });

  const id = uuidv4();
  try {
    await redis.geoAdd(GEO_KEY, { longitude: lng, latitude: lat, member: id });
    await redis.hSet(`coord:${id}`, {
      lat,
      lng,
      createdAt: new Date().toISOString()
    });
    res.status(201).json({ message: "✅ Coördinaat opgeslagen", id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Redis-fout" });
  }
});

// 🟢 GET: alle coördinaten ophalen
app.get("/api/coordinates", async (req, res) => {
  try {
    const members = await redis.zRange(GEO_KEY, 0, -1);
    const coords = [];
    for (const id of members) {
      const data = await redis.hGetAll(`coord:${id}`);
      if (data.lat && data.lng)
        coords.push({
          id,
          lat: parseFloat(data.lat),
          lng: parseFloat(data.lng)
        });
    }
    res.json(coords);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Redis-fout" });
  }
});

// 🟢 GET: markers binnen straal (optioneel)
app.get("/api/near", async (req, res) => {
  const { lat, lng, radius = 1000 } = req.query;
  try {
    const results = await redis.geoRadius(GEO_KEY, {
      longitude: parseFloat(lng),
      latitude: parseFloat(lat),
      radius: parseFloat(radius),
      unit: "m",
      WITHDIST: true
    });

    const coords = [];
    for (const r of results) {
      const data = await redis.hGetAll(`coord:${r.member}`);
      if (data.lat && data.lng)
        coords.push({
          id: r.member,
          lat: parseFloat(data.lat),
          lng: parseFloat(data.lng),
          distance: r.distance
        });
    }
    res.json(coords);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Redis-fout" });
  }
});

// 🔊 Start server
const PORT = process.env.PORT || 6379;
app.listen(PORT, () => console.log(`✅ Server draait op poort ${PORT}`));

