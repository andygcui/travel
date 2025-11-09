"use client";

import { GoogleMap, LoadScript, Marker, InfoWindow, OverlayView, DirectionsService, DirectionsRenderer } from "@react-google-maps/api";

// Travel mode for directions (default: walking, can be changed to 'TRANSIT' for public transport)
const DEFAULT_TRAVEL_MODE = "WALKING";

// ...existing code...
import { useEffect, useState, useRef } from "react";

interface Place {
  name: string;
  day: number;
  lat?: number;
  lng?: number;
  when?: string;
}

interface ItineraryMapProps {
  destination: string;
  attractions: Place[];
}

// Quiet fern green accent colors
const ACCENT = "#2d6a4f"; // quiet fern green
const ACCENT_DARK = "#1b4332"; // darker outline for contrast


export default function ItineraryMap({ destination, attractions }: ItineraryMapProps) {
  const [mapCenter, setMapCenter] = useState<{ lat: number; lng: number } | null>(null);
  const [activeMarker, setActiveMarker] = useState<Place | null>(null);
  const [details, setDetails] = useState<any>(null);
  const [coordinates, setCoordinates] = useState<({ lat: number; lng: number } | null)[]>([]);
  const [loading, setLoading] = useState(true);
  const [isGoogleMapsLoaded, setIsGoogleMapsLoaded] = useState(false);
  const mapRef = useRef<google.maps.Map | null>(null);
  const coordinateCache = useRef<Map<string, { lat: number; lng: number }>>(new Map());

  // Directions state
  const [directions, setDirections] = useState<google.maps.DirectionsResult | null>(null);
  const [directionsError, setDirectionsError] = useState<string | null>(null);

  // Debug: Log attractions received
  useEffect(() => {
    console.log("ItineraryMap received attractions:", attractions);
    console.log("Destination:", destination);
  }, [attractions, destination]);

  // Request directions between all consecutive attractions (if 2+ valid coordinates)
  useEffect(() => {
    if (!isGoogleMapsLoaded || coordinates.length < 2) {
      setDirections(null);
      return;
    }
    // Filter out nulls and invalid coords
    const validCoords = coordinates.filter(c => c && typeof c.lat === 'number' && typeof c.lng === 'number');
    if (validCoords.length < 2) {
      setDirections(null);
      return;
    }
    // Build waypoints (all except first and last)
    const waypoints = validCoords.slice(1, -1).map(c => ({ location: c, stopover: true }));
    const origin = validCoords[0];
    const destinationCoord = validCoords[validCoords.length - 1];
    const travelMode = DEFAULT_TRAVEL_MODE;
    // Use DirectionsService to get route
    const service = new window.google.maps.DirectionsService();
    service.route(
      {
        origin,
        destination: destinationCoord,
        waypoints,
        travelMode: window.google.maps.TravelMode[travelMode],
        optimizeWaypoints: true, // Let Google optimize the order for least time
      },
      (result, status) => {
        if (status === "OK" && result) {
          setDirections(result);
          setDirectionsError(null);
        } else {
          setDirections(null);
          setDirectionsError("Could not fetch walking directions.");
        }
      }
    );
  }, [isGoogleMapsLoaded, coordinates]);

  // Initialize coordinates immediately from backend data (if available)
  useEffect(() => {
    // Skip if attractions is empty
    if (!attractions || attractions.length === 0) {
      setCoordinates([]);
      setLoading(false);
      return;
    }
    
    // Reset loading state
    setLoading(true);
    
    // First, extract any existing coordinates from attractions prop
    const initialCoords: ({ lat: number; lng: number } | null)[] = [];
    const needsGeocoding: number[] = [];

    attractions.forEach((a, i) => {
      if (a.lat && a.lng && typeof a.lat === 'number' && typeof a.lng === 'number') {
        // Use existing coordinates from backend
        const coord = { lat: a.lat, lng: a.lng };
        initialCoords.push(coord);
        const cacheKey = `${a.name}-${destination}`;
        coordinateCache.current.set(cacheKey, coord);
      } else {
        // Mark for geocoding
        needsGeocoding.push(i);
        initialCoords.push(null); // Placeholder to maintain order
      }
    });

    // Set initial coordinates immediately (even if some are placeholders)
    setCoordinates(initialCoords);

    // Set map center immediately if we have at least one coordinate
    const firstValidCoord = initialCoords.find(c => c && c.lat && c.lng);
    if (firstValidCoord) {
      setMapCenter(firstValidCoord);
      setLoading(false); // Don't wait if we have coordinates from backend
    }

    // If we have coordinates, we can render markers immediately
    // Only geocode the ones that are missing
    if (needsGeocoding.length === 0) {
      setLoading(false);
      return; // All coordinates are available, no need to geocode
    }

    // Geocode missing coordinates
    const fetchMissingCoords = async () => {
      if (!process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY) {
        console.error("Google Maps API key not found");
        setLoading(false);
        return;
      }

      const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
      const updatedCoords: ({ lat: number; lng: number } | null)[] = [...initialCoords];

      for (const i of needsGeocoding) {
        const a = attractions[i];
        if (!a) continue;
        
        // Check cache first
        const cacheKey = `${a.name}-${destination}`;
        if (coordinateCache.current.has(cacheKey)) {
          const cached = coordinateCache.current.get(cacheKey)!;
          updatedCoords[i] = cached;
          continue;
        }

        // Geocode missing coordinates
        try {
          const searchQuery = `${a.name}, ${destination}`;
          const res = await fetch(
            `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(searchQuery)}&key=${apiKey}`
          );
          const data = await res.json();
          
          if (data.results?.[0]?.geometry?.location) {
            const loc = data.results[0].geometry.location;
            updatedCoords[i] = { lat: loc.lat, lng: loc.lng };
            coordinateCache.current.set(cacheKey, { lat: loc.lat, lng: loc.lng });
          } else {
            console.warn(`Could not geocode: ${a.name}`);
            // Keep as null
          }
        } catch (error) {
          console.error(`Error geocoding ${a.name}:`, error);
          // Keep as null
        }
      }

      setCoordinates(updatedCoords);

      // Update map center if we didn't have one before
      setMapCenter((currentCenter) => {
        if (currentCenter) return currentCenter; // Don't override if already set
        
        const firstValid = updatedCoords.find(c => c && c.lat && c.lng);
        if (firstValid) {
          return firstValid;
        }
        
        // If no valid coordinate found, we'll geocode destination asynchronously
        // This will be handled after setLoading
        return null;
      });

      // Fallback geocoding for destination if still no center (async, non-blocking)
      setMapCenter((currentCenter) => {
        if (currentCenter) return currentCenter;
        
        // Async geocoding - fire and forget
        fetch(
          `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(destination)}&key=${apiKey}`
        )
          .then((r) => r.json())
          .then((geo) => {
            if (geo.results?.[0]?.geometry?.location) {
              setMapCenter(geo.results[0].geometry.location);
            }
          })
          .catch((error) => {
            console.error("Error geocoding destination:", error);
          });
        
        return null;
      });

      setLoading(false);
    };

    fetchMissingCoords();
  }, [attractions, destination]);

  // Marker click → fetch details
  const handleMarkerClick = async (place: Place) => {
    if (!process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY) return;

    // Set active marker immediately for better UX
    setActiveMarker(place);
    setDetails(null); // Clear previous details while loading

    const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

    try {
      const searchQuery = `${place.name}, ${destination}`;
      const res = await fetch(
        `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(searchQuery)}&key=${apiKey}`
      );
      const search = await res.json();
      const candidate = search.results?.[0];

      if (!candidate) {
        setDetails({ 
          name: place.name, 
          formatted_address: "Address not available",
          url: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(searchQuery)}`
        });
        return;
      }

      const det = await fetch(
        `https://maps.googleapis.com/maps/api/place/details/json?place_id=${candidate.place_id}&fields=name,formatted_address,photos,rating,url,editorial_summary&key=${apiKey}`
      ).then((r) => r.json());

      setDetails(det.result || { 
        name: place.name, 
        formatted_address: "Address not available",
        url: candidate.url || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(searchQuery)}`
      });
    } catch (error) {
      console.error("Error fetching place details:", error);
      setDetails({ 
        name: place.name, 
        formatted_address: "Error loading details",
        url: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(place.name + ", " + destination)}`
      });
    }
  };

  // Auto-fit bounds to all coordinates
  useEffect(() => {
    if (!mapRef.current || coordinates.length === 0) return;

    if (typeof google !== "undefined" && google.maps) {
      const bounds = new google.maps.LatLngBounds();
      let hasValidCoords = false;
      coordinates.forEach((c) => {
        if (c && typeof c.lat === 'number' && typeof c.lng === 'number') {
          bounds.extend(c as any);
          hasValidCoords = true;
        }
      });
      // Only fit bounds if we have at least one valid coordinate
      if (hasValidCoords) {
        mapRef.current.fitBounds(bounds, 64); // padding in pixels
      }
    }
  }, [coordinates]);

  if (!process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY) {
    return (
      <div className="w-full h-[500px] rounded-xl overflow-hidden shadow-xl bg-gray-100 flex items-center justify-center">
        <p className="text-gray-600">Google Maps API key not configured</p>
      </div>
    );
  }

  // Only show loading if we have no coordinates at all and no map center
  if (loading && coordinates.length === 0 && !mapCenter) {
    return (
      <div className="w-full h-[500px] rounded-xl overflow-hidden shadow-xl bg-emerald-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-emerald-700 font-medium">Loading map...</p>
          <p className="text-emerald-600 text-sm mt-2">Geocoding attractions</p>
        </div>
      </div>
    );
  }

  // Use a fallback center if we don't have one yet but have coordinates
  const displayCenter = mapCenter || (coordinates.length > 0 && coordinates[0] ? coordinates[0] : { lat: 0, lng: 0 });

  return (
    <div className="w-full h-[500px] rounded-xl overflow-hidden shadow-xl">
        <LoadScript 
          googleMapsApiKey={process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY!}
          onLoad={() => {
            setIsGoogleMapsLoaded(true);
          }}
        >
        <GoogleMap
          mapContainerStyle={{ width: "100%", height: "100%" }}
          center={displayCenter}
          zoom={12}
          options={{
            mapTypeControl: false,
            fullscreenControl: false,
            streetViewControl: false,
            clickableIcons: false,
          }}
          onLoad={(map) => {
            mapRef.current = map;
            setIsGoogleMapsLoaded(true);
            // Auto-fit bounds when map loads if we have coordinates
            if (coordinates.length > 0 && typeof google !== "undefined" && google.maps) {
              const bounds = new google.maps.LatLngBounds();
              let hasValidCoords = false;
              coordinates.forEach((c) => {
                if (c && typeof c.lat === 'number' && typeof c.lng === 'number') {
                  bounds.extend(c as any);
                  hasValidCoords = true;
                }
              });
              // Only fit bounds if we have at least one valid coordinate
              if (hasValidCoords) {
                map.fitBounds(bounds, 64);
              }
            }
          }}
        >
          {/* Walking/Transit Route (solid line) */}
          {directions && (
            <DirectionsRenderer
              directions={directions}
              options={{
                suppressMarkers: true, // We'll use our custom markers
                polylineOptions: {
                  strokeColor: ACCENT,
                  strokeWeight: 5,
                  strokeOpacity: 0.85,
                },
              }}
            />
          )}

          {/* Markers with pushpin style (quiet fern green) */}
          {isGoogleMapsLoaded && attractions.map((a, i) => {
            // Priority: Use coordinates from state, fallback to attraction's lat/lng
            let coord = coordinates[i];
            if (!coord && a.lat && a.lng && typeof a.lat === 'number' && typeof a.lng === 'number') {
              coord = { lat: a.lat, lng: a.lng };
            }
            
            // Don't render if no coordinate
            if (!coord || typeof coord.lat !== 'number' || typeof coord.lng !== 'number') return null;
            
            // Ensure google.maps is available before creating Point
            if (typeof google === "undefined" || !google.maps || !google.maps.Point) return null;
            
            return (
              <Marker
                key={`${a.name}-${a.day}-${i}`}
                position={{ lat: coord.lat, lng: coord.lng }}
                onClick={() => handleMarkerClick(a)}
                icon={{
                  // Pushpin SVG path - teardrop shape (like 📍 emoji)
                  // Proper pushpin with rounded top and point at bottom
                  path: "M12 0C5.373 0 0 5.373 0 12c0 8.837 12 20 12 20s12-11.163 12-20C24 5.373 18.627 0 12 0zm0 16c-2.209 0-4-1.791-4-4s1.791-4 4-4 4 1.791 4 4-1.791 4-4 4z",
                  fillColor: ACCENT,
                  fillOpacity: 1,
                  strokeColor: ACCENT_DARK,
                  strokeOpacity: 0.8,
                  strokeWeight: 2,
                  scale: 0.75,
                  anchor: new google.maps.Point(12, 24), // Anchor at bottom point of pushpin
                }}
                title={a.name}
              />
            );
          })}

          {/* Custom labels with background rectangles above pushpins */}
          {isGoogleMapsLoaded && attractions.map((a, i) => {
            // Priority: Use coordinates from state, fallback to attraction's lat/lng
            let coord = coordinates[i];
            if (!coord && a.lat && a.lng && typeof a.lat === 'number' && typeof a.lng === 'number') {
              coord = { lat: a.lat, lng: a.lng };
            }
            
            // Don't render if no coordinate
            if (!coord || typeof coord.lat !== 'number' || typeof coord.lng !== 'number') return null;
            
            // Ensure google.maps is available
            if (typeof google === "undefined" || !google.maps) return null;
            
            return (
              <OverlayView
                key={`label-${a.name}-${a.day}-${i}`}
                position={{ lat: coord.lat, lng: coord.lng }}
                mapPaneName={OverlayView.OVERLAY_MOUSE_TARGET}
              >
                <div
                  style={{
                    transform: "translate(-50%, calc(-100% - 20px))",
                    backgroundColor: ACCENT, // Fern green (#2d6a4f)
                    color: "#ffffff",
                    fontSize: "10px",
                    fontWeight: "600",
                    padding: "3px 8px",
                    borderRadius: "4px",
                    boxShadow: "0 1px 3px rgba(0, 0, 0, 0.3)",
                    whiteSpace: "nowrap",
                    border: `1px solid ${ACCENT_DARK}`,
                    pointerEvents: "none",
                    display: "inline-block", // Makes rectangle wrap to text width
                    lineHeight: "1.2",
                  }}
                >
                  {a.name.length > 20 ? a.name.substring(0, 17) + "..." : a.name}
                </div>
              </OverlayView>
            );
          })}

          {/* Info Window for selected marker */}
          {activeMarker && activeMarker.lat && activeMarker.lng && (
            <InfoWindow
              position={{ lat: activeMarker.lat, lng: activeMarker.lng }}
              onCloseClick={() => {
                setActiveMarker(null);
                setDetails(null);
              }}
            >
              <div className="max-w-xs text-sm text-gray-800 p-2">
                {/* Tag-like label header */}
                <div
                  style={{
                    backgroundColor: "rgba(30,30,30,0.85)",
                    color: "#fff",
                    fontSize: "12px",
                    padding: "4px 8px",
                    borderRadius: "6px",
                    boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
                    marginBottom: "8px",
                    display: "inline-block",
                  }}
                >
                  {details?.name || activeMarker.name}
                </div>
                {details?.photos?.[0]?.photo_reference && (
                  <img
                    src={`https://maps.googleapis.com/maps/api/place/photo?maxwidth=300&photo_reference=${details.photos[0].photo_reference}&key=${process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY}`}
                    alt={details.name || activeMarker.name}
                    className="rounded mb-2 w-full"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = "none";
                    }}
                  />
                )}
                {details?.formatted_address && (
                  <p className="text-xs mb-2 text-gray-600">{details.formatted_address}</p>
                )}
                {typeof details?.rating === "number" && (
                  <p className="text-xs mb-2 font-medium">⭐ {details.rating.toFixed(1)} / 5.0</p>
                )}
                {details?.editorial_summary?.overview && (
                  <p className="text-xs mt-2 text-gray-700 leading-relaxed">{details.editorial_summary.overview}</p>
                )}
                {!details && (
                  <p className="text-xs text-gray-500 italic">Loading details...</p>
                )}
                {details?.url && (
                  <a
                    href={details.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-emerald-700 text-xs underline mt-3 block font-medium hover:text-emerald-900"
                  >
                    View on Google Maps →
                  </a>
                )}
              </div>
            </InfoWindow>
          )}
        </GoogleMap>
      </LoadScript>
    </div>
  );
}

