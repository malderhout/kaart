// Importeer de benodigde packages: express voor de webserver en cors voor cross-origin requests.
const express = require('express');
const cors = require('cors');
const redis = require('redis'); // Importeer de redis package

// Initialiseer de Express applicatie
const app = express();
const port = 3000;

// --- REDIS CONNECTIE ---
// De connectiegegevens worden uit de omgevingsvariabelen gehaald.
// Dit is de veilige manier om met wachtwoorden en URLs om te gaan.
// Op Render.com stel je een omgevingsvariabele in met de naam 'REDIS_URL'.
// Het formaat is: redis://<gebruikersnaam>:<wachtwoord>@<host>:<poort>
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
        }
    } else {
        console.warn('REDIS_URL is niet ingesteld. Data wordt alleen in het geheugen opgeslagen.');
    }
})();
// --------------------

// Gebruik de CORS middleware om verzoeken van andere domeinen (zoals je HTML-bestand) toe te staan.
app.use(cors());
// Gebruik de express.json() middleware om JSON-data in requests automatisch te parsen.
app.use(express.json());

// Dit is een simpele in-memory object als fallback als Redis niet beschikbaar is.
let markersStore = {};

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

    // Sla op in Redis als de connectie bestaat
    if (redisClient && redisClient.isReady) {
        try {
            // Gebruik hSet om een hash op te slaan. Dit is efficiënt voor objecten.
            await redisClient.hSet(markerId, markerData);
            console.log(`Vlaggetje ${markerId} opgeslagen in Redis.`);
        } catch (err) {
            console.error('Redis fout bij opslaan:', err);
            return res.status(500).json({ status: 'error', message: 'Kon vlaggetje niet opslaan in Redis.' });
        }
    } else {
        // Fallback naar in-memory opslag
        markersStore[markerId] = markerData;
        console.log(`Vlaggetje ${markerId} opgeslagen in geheugen (fallback).`);
    }

    res.status(201).json({ status: 'success', message: 'Vlaggetje succesvol opgeslagen', markerId: markerId });
});

// NIEUW: Endpoint om alle opgeslagen vlaggetjes op te halen
app.get('/api/markers', async (req, res) => {
    let allMarkers = {};

    if (redisClient && redisClient.isReady) {
        try {
            const keys = await redisClient.keys('flag-*'); // Haal alle keys op die beginnen met 'flag-'
            for (const key of keys) {
                allMarkers[key] = await redisClient.hGetAll(key);
            }
            console.log(`${keys.length} vlaggetjes opgehaald uit Redis.`);
        } catch (err) {
            console.error('Redis fout bij ophalen:', err);
            return res.status(500).json({ status: 'error', message: 'Kon vlaggetjes niet ophalen uit Redis.' });
        }
    } else {
        // Fallback naar in-memory opslag
        allMarkers = markersStore;
        console.log('Vlaggetjes opgehaald uit geheugen (fallback).');
    }

    res.status(200).json({ status: 'success', data: allMarkers });
});

// Start de server
app.listen(port, () => {
    console.log(`Node.js server draait op http://localhost:${port}`);
});