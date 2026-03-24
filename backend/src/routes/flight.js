const express = require('express');
const axios = require('axios');
const router = express.Router();

// Mock data for development when API key is missing
const MOCK_FLIGHT_DATA = {
    'TK2427': {
        status: 'active',
        departure: { airport: 'Antalya (AYT)', scheduled: '2026-02-15T00:19:00+03:00' },
        arrival: { airport: 'Istanbul (IST)', scheduled: '2026-02-15T01:39:00+03:00', estimated: '2026-02-15T01:24:00+03:00' },
        live: { is_ground: false, altitude: 10000, latitude: 40.0, longitude: 29.0 }
    }
};

router.get('/status', async (req, res) => {
    try {
        const { flightNumber, date } = req.query;

        if (!flightNumber) {
            return res.status(400).json({ success: false, error: 'Flight number is required' });
        }

        // Check for API Key
        const apiKey = process.env.AVIATIONSTACK_API_KEY;

        // Normalize Flight Number (AviationStack often prefers IATA like TK vs ICAO like THY)
        // Common mappings: THY->TK, ETD->EY, BAW->BA, DLH->LH, AFR->AF, KLM->KL, UAE->EK, QTR->QR, PGT->PC, SXS->XQ
        let queryFlightNumber = flightNumber.toUpperCase();

        const MAPPINGS = {
            'THY': 'TK',
            'ETD': 'EY',
            'BAW': 'BA',
            'DLH': 'LH',
            'AFR': 'AF',
            'KLM': 'KL',
            'UAE': 'EK',
            'QTR': 'QR',
            'PGT': 'PC',
            'SXS': 'XQ',
            'EZS': 'U2',
            'EZY': 'U2',
            'RYR': 'FR',
            'HAL': 'HA',
            'AAL': 'AA',
            'UAL': 'UA',
            'DAL': 'DL',
            'ABY': 'G9' // Air Arabia
        };

        for (const [icao, iata] of Object.entries(MAPPINGS)) {
            if (queryFlightNumber.startsWith(icao)) {
                queryFlightNumber = queryFlightNumber.replace(icao, iata);
                break;
            }
        }

        if (!apiKey) {
            console.warn('AVIATIONSTACK_API_KEY missing, returning mock data.');
            // Return mock data if available, or basic scheduled
            const mock = MOCK_FLIGHT_DATA[flightNumber.toUpperCase()];
            if (mock) {
                return res.json({ success: true, data: mock, source: 'mock' });
            }
            // Fallback mock
            return res.json({
                success: true,
                data: {
                    status: 'scheduled',
                    arrival: { scheduled: date ? new Date(date).toISOString() : new Date().toISOString() }
                },
                source: 'fallback-mock'
            });
        }

        console.log(`[FlightAPI] Fetching status for ${flightNumber} on ${date || 'today'}`);
        console.log(`[FlightAPI] Using API Key: ${apiKey ? '***' : 'MISSING'}`);

        // Call AviationStack API
        const apiUrl = 'http://api.aviationstack.com/v1/flights';
        console.log(`[FlightAPI] Requesting: ${apiUrl}?access_key=***&flight_iata=${queryFlightNumber}&limit=1`);

        const response = await axios.get(apiUrl, {
            params: {
                access_key: apiKey,
                flight_iata: queryFlightNumber,
                limit: 1
            },
            timeout: 10000 // 10s timeout
        });

        console.log(`[FlightAPI] Response Status: ${response.status}`);
        console.log(`[FlightAPI] Data Length: ${response.data.data ? response.data.data.length : 'undefined'}`);

        if (response.data.data && response.data.data.length > 0) {
            const flight = response.data.data[0];
            console.log('[FlightAPI] RAW Flight Data:', JSON.stringify(flight, null, 2));

            // Helper to strip timezone (force local time interpretation)
            // AviationStack often returns Local Time digits with +00:00 offset for domestic flights
            const toLocal = (str) => {
                if (!str) return null;
                return str.replace(/(\+00:00|Z)$/, '');
            };

            // Format response for frontend
            const formatted = {
                status: flight.flight_status, // scheduled, active, landed
                departure: {
                    airport: flight.departure.airport,
                    scheduled: toLocal(flight.departure.scheduled)
                },
                arrival: {
                    airport: flight.arrival.airport,
                    scheduled: toLocal(flight.arrival.scheduled),
                    estimated: toLocal(flight.arrival.estimated),
                    actual: toLocal(flight.arrival.actual)
                },
                live: flight.live || null
            };

            console.log('[FlightAPI] Returning formatted data');
            return res.json({ success: true, data: formatted, source: 'api' });
        }

        // Not found in API
        console.log('[FlightAPI] Flight not found within API response');
        return res.json({ success: false, error: 'Flight not found' });

    } catch (error) {
        console.error('Flight API Error:', error.message);
        if (error.response) {
            console.error('API Error Response:', error.response.data);
        }
        res.status(500).json({ success: false, error: 'Failed to fetch flight status' });
    }
});

module.exports = router;
