# Debugging Guide - Verifying API Calls

## How to Check if APIs are Being Called

### 1. **Check Backend Logs**

When you submit the form, watch the backend terminal. You should see logs like:

```
INFO - Received itinerary request: Paris, France, 5 days, $2000.0, mode: balanced
INFO - Geocoding destination: Paris, France
INFO - Geocoding 'Paris, France' with Google Places API...
INFO - Geocoded 'Paris, France' to (48.8566, 2.3522)
INFO - Fetching flights from JFK to Paris, France
WARNING - Note: Amadeus expects airport codes. If 'Paris, France' is a city name, flights will use fallback data.
INFO - Fetching Amadeus flights: JFK -> Paris, France on 2024-12-08
WARNING - Amadeus API keys not set, using fallback data
INFO - Found 1 flight options
INFO - Fetching hotels near 48.8566, 2.3522
INFO - Found 1 hotel options
INFO - Fetching weather forecast
INFO - Got 5 days of weather data
INFO - Fetching attractions for preferences: ['food', 'art']
INFO - Found 5 attractions
INFO - Building Dedalus prompt...
INFO - Calling Dedalus API...
INFO - Calling Dedalus with 10 max steps
INFO - Starting Dedalus runner...
```

### 2. **What Each Log Means**

- ✅ **"Geocoding 'X' with Google Places API..."** = Google Places API is being called
- ⚠️ **"GOOGLE_PLACES_KEY not set"** = Using fallback (no real geocoding)
- ✅ **"Got Amadeus token, fetching flights..."** = Amadeus API is being called
- ⚠️ **"Amadeus API keys not set"** = Using fallback flights
- ✅ **"Calling Dedalus API..."** = Dedalus is being called
- ⚠️ **"DEDALUS_API_KEY not set"** = Dedalus will fail and use fallback

### 3. **Check Your .env File**

Make sure `backend/.env` has:
```
DEDALUS_API_KEY=your_key_here
AMADEUS_API_KEY=your_key_here
AMADEUS_API_SECRET=your_secret_here
OPENWEATHER_KEY=your_key_here
GOOGLE_PLACES_KEY=your_key_here
CLIMATIQ_KEY=your_key_here
```

### 4. **Common Issues**

**Problem**: "DEDALUS_API_KEY not set"
- **Solution**: Add your Dedalus API key to `backend/.env`

**Problem**: "Amadeus API keys not set, using fallback data"
- **Solution**: Add AMADEUS_API_KEY and AMADEUS_API_SECRET to `backend/.env`

**Problem**: "Could not geocode destination"
- **Solution**: Add GOOGLE_PLACES_KEY to `backend/.env`

**Problem**: Flights always show fallback data
- **Note**: Amadeus needs airport codes (like "CDG" not "Paris, France"). The system will use fallback if you enter city names.

### 5. **Testing Without API Keys**

The system will work with fallback data, but:
- ❌ No real flight/hotel prices
- ❌ No real weather data
- ❌ No real attractions
- ❌ Dedalus will fail (needs API key)

### 6. **Verify Dedalus is Called**

Look for these logs:
```
INFO - Calling Dedalus API...
INFO - Calling Dedalus with 10 max steps
INFO - Starting Dedalus runner...
INFO - Dedalus runner completed
INFO - Successfully parsed Dedalus JSON response
```

If you see:
```
ERROR - DEDALUS_API_KEY not set in environment variables
```
Then Dedalus is NOT being called (no API key).

### 7. **Quick Test**

1. Submit the form with "Paris, France"
2. Watch backend logs
3. Check for:
   - ✅ "Calling Dedalus API..." = Dedalus is being called
   - ⚠️ "using fallback" = That API doesn't have a key
   - ✅ "Successfully parsed Dedalus JSON response" = Dedalus worked!

