"use client";

import { GoogleMap, LoadScript, Marker, InfoWindow, Polyline } from "@react-google-maps/api";
import { useEffect, useState, useRef } from "react";
import { gsap } from "gsap";

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

export default function ItineraryMap({ destination, attractions }: ItineraryMapProps) {
  const [mapCenter, setMapCenter] = useState<{ lat: number; lng: number } | null>(null);
  const [activeMarker, setActiveMarker] = useState<Place | null>(null);
  const [details, setDetails] = useState<any>(null);
  const [coordinates, setCoordinates] = useState<{ lat: number; lng: number }[]>([]);
  const [animatedPath, setAnimatedPath] = useState<{ lat: number; lng: number }[]>([]);
  const [loading, setLoading] = useState(true);
  const polylineRef = useRef<google.maps.Polyline | null>(null);
  const coordinateCache = useRef<Map<string, { lat: number; lng: number }>>(new Map());

  // Rotate colors by day
  const dayColors = [
    "http://maps.google.com/mapfiles/ms/icons/green-dot.png",
    "http://maps.google.com/mapfiles/ms/icons/blue-dot.png",
    "http://maps.google.com/mapfiles/ms/icons/yellow-dot.png",
    "http://maps.google.com/mapfiles/ms/icons/red-dot.png",
    "http://maps.google.com/mapfiles/ms/icons/purple-dot.png",
  ];

  // Resolve coordinates only when missing (NO HARDCODING)
  useEffect(() => {
    const fetchCoords = async () => {
      if (!process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY) {
        console.error("Google Maps API key not found");
        setLoading(false);
        return;
      }

      const coords: { lat: number; lng: number }[] = [];
      const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

      for (const a of attractions) {
        // Check cache first
        const cacheKey = `${a.name}-${destination}`;
        if (coordinateCache.current.has(cacheKey)) {
          const cached = coordinateCache.current.get(cacheKey)!;
          a.lat = cached.lat;
          a.lng = cached.lng;
          coords.push(cached);
          continue;
        }

        // Use existing coordinates if available
        if (a.lat && a.lng) {
          coords.push({ lat: a.lat, lng: a.lng });
          coordinateCache.current.set(cacheKey, { lat: a.lat, lng: a.lng });
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
            a.lat = loc.lat;
            a.lng = loc.lng;
            coords.push(loc);
            coordinateCache.current.set(cacheKey, loc);
          } else {
            console.warn(`Could not geocode: ${a.name}`);
          }
        } catch (error) {
          console.error(`Error geocoding ${a.name}:`, error);
        }
      }

      setCoordinates(coords);

      // Set map center
      if (coords.length > 0) {
        setMapCenter(coords[0]);
      } else {
        // Fallback: center by destination geocode
        try {
          const geo = await fetch(
            `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(destination)}&key=${apiKey}`
          ).then((r) => r.json());
          
          if (geo.results?.[0]?.geometry?.location) {
            setMapCenter(geo.results[0].geometry.location);
          }
        } catch (error) {
          console.error("Error geocoding destination:", error);
        }
      }

      setLoading(false);
    };

    fetchCoords();
  }, [attractions, destination]);

  // Marker click → fetch details
  const handleMarkerClick = async (place: Place) => {
    if (!process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY) return;

    setActiveMarker(place);
    const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

    try {
      const searchQuery = `${place.name}, ${destination}`;
      const res = await fetch(
        `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(searchQuery)}&key=${apiKey}`
      );
      const search = await res.json();
      const candidate = search.results?.[0];

      if (!candidate) {
        setDetails({ name: place.name, formatted_address: "Address not available" });
        return;
      }

      const det = await fetch(
        `https://maps.googleapis.com/maps/api/place/details/json?place_id=${candidate.place_id}&fields=name,formatted_address,photos,rating,url,editorial_summary&key=${apiKey}`
      ).then((r) => r.json());

      setDetails(det.result || { name: place.name, formatted_address: "Address not available" });
    } catch (error) {
      console.error("Error fetching place details:", error);
      setDetails({ name: place.name, formatted_address: "Error loading details" });
    }
  };

  // Animate route drawing with GSAP when coords are ready
  useEffect(() => {
    if (coordinates.length < 2 || loading) return;

    const total = coordinates.length;
    const state = { p: 0 };

    // Reset animated path
    setAnimatedPath([]);

    gsap.fromTo(
      state,
      { p: 0 },
      {
        p: total,
        duration: 3,
        ease: "power2.out",
        onUpdate: () => {
          const currentLength = Math.floor(state.p);
          setAnimatedPath(coordinates.slice(0, currentLength));
        },
      }
    );
  }, [coordinates, loading]);

  const lineOptions = {
    strokeColor: "#34d399",
    strokeOpacity: 0.85,
    strokeWeight: 5,
    clickable: false,
    draggable: false,
    editable: false,
    visible: true,
    zIndex: 1,
  };

  if (!process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY) {
    return (
      <div className="w-full h-[500px] rounded-xl overflow-hidden shadow-xl bg-gray-100 flex items-center justify-center">
        <p className="text-gray-600">Google Maps API key not configured</p>
      </div>
    );
  }

  if (loading || !mapCenter) {
    return (
      <div className="w-full h-[500px] rounded-xl overflow-hidden shadow-xl bg-emerald-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-emerald-700 font-medium">Loading map...</p>
          <p className="text-emerald-600 text-sm mt-2">Geocoding attractions</p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-[500px] rounded-xl overflow-hidden shadow-xl">
      <LoadScript googleMapsApiKey={process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY!}>
        <GoogleMap
          mapContainerStyle={{ width: "100%", height: "100%" }}
          center={mapCenter}
          zoom={12}
          options={{
            styles: [
              { featureType: "poi", elementType: "labels", stylers: [{ visibility: "off" }] },
              { featureType: "road", elementType: "geometry", stylers: [{ color: "#cde6cf" }] },
              { featureType: "water", stylers: [{ color: "#aee2e0" }] },
            ],
            mapTypeControl: false,
            fullscreenControl: false,
            streetViewControl: false,
          }}
        >
          {animatedPath.length > 1 && (
            <Polyline
              path={animatedPath}
              options={lineOptions}
              onLoad={(polyline) => (polylineRef.current = polyline)}
            />
          )}

          {attractions.map(
            (a, i) =>
              a.lat && a.lng ? (
                <Marker
                  key={`${a.name}-${i}`}
                  position={{ lat: a.lat, lng: a.lng }}
                  onClick={() => handleMarkerClick(a)}
                  icon={{ url: dayColors[(a.day - 1) % dayColors.length] }}
                />
              ) : null
          )}

          {activeMarker && details && activeMarker.lat && activeMarker.lng && (
            <InfoWindow
              position={{ lat: activeMarker.lat, lng: activeMarker.lng }}
              onCloseClick={() => {
                setActiveMarker(null);
                setDetails(null);
              }}
            >
              <div className="max-w-xs text-sm text-gray-800">
                <h3 className="font-semibold text-lg mb-1">{details.name || activeMarker.name}</h3>
                {details.photos?.[0]?.photo_reference && (
                  <img
                    src={`https://maps.googleapis.com/maps/api/place/photo?maxwidth=300&photo_reference=${details.photos[0].photo_reference}&key=${process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY}`}
                    alt={details.name}
                    className="rounded mb-2 w-full"
                  />
                )}
                {details.formatted_address && (
                  <p className="text-xs mb-1 text-gray-600">{details.formatted_address}</p>
                )}
                {typeof details.rating === "number" && (
                  <p className="text-xs mb-2">⭐ {details.rating.toFixed(1)} / 5</p>
                )}
                {details.editorial_summary?.overview && (
                  <p className="text-xs mt-2 text-gray-700">{details.editorial_summary.overview}</p>
                )}
                {details.url && (
                  <a
                    href={details.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-green-700 text-xs underline mt-2 block"
                  >
                    View on Google Maps
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

