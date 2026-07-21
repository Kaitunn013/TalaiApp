import { useEffect, useState, useRef } from 'react';
import { StyleSheet, View, Text, Image } from 'react-native';
import { WebView } from 'react-native-webview';
import RoutesBottomSheet from './component/RoutesBottomSheet';

const busStopIconUri = Image.resolveAssetSource(require('../assets/BUS_STOP_ICON.png')).uri;

type RoutePoint = {
    lat: number;
    lng: number;
    routestop_sequence?: number | null;
    name?: string | null;
};

type Route = {
    id: string;
    name: string;
    pathPoints: RoutePoint[];
};

type LiveCarLocation = {
    carId: string;
    lat: number;
    lng: number;
    status: string;
    eta: unknown;
    routeId?: string | null;
};

export default function HomeScreen() {
    const [routes, setRoutes] = useState<Route[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [selectedRoute, setSelectedRoute] = useState<Route | null>(null);
    const [selectedCarId, setSelectedCarId] = useState<string | null>(null);
    const [liveCars, setLiveCars] = useState<LiveCarLocation[]>([]);
    const [carRouteMap, setCarRouteMap] = useState<Record<string, string>>({});
    const initialCarSelectedRef = useRef(false);

    const fetchRoute = async () => {
        try {
            const res = await fetch('https://kukps-talai.vercel.app/api/client/routes');
            const json = await res.json();

            if (!res.ok) {
                setError(json?.error || `HTTP ${res.status}`);
                return;
            }

            if (!Array.isArray(json.routes)) {
                setError(json?.error || 'ไม่พบข้อมูล routes ใน API');
                return;
            }

            setRoutes(json.routes);

            const defaultRoute = json.routes.find(
                (route: Route) => (route.name || '').trim() === 'สายหน้ามอ'
            );

            if (defaultRoute) {
                setSelectedRoute(defaultRoute);
            }
        } catch (err) {
            console.error(err);
            setError('โหลดข้อมูลไม่สำเร็จ');
        }
    };

    const fetchLiveCars = async () => {
        try {
            const res = await fetch('https://kukps-talai.vercel.app/api/client/locations');
            const json = await res.json();

            if (!res.ok) {
                setError(json?.error || `HTTP ${res.status}`);
                return;
            }

            if (!Array.isArray(json.locations)) {
                setError(json?.error || 'ไม่พบข้อมูลตำแหน่งรถ');
                return;
            }

            setLiveCars(json.locations);
        } catch (err) {
            console.error(err);
            setError('ไม่สามารถโหลดตำแหน่งรถได้');
        }
    };

    const fetchCarsMapping = async () => {
        try {
            const res = await fetch('https://kukps-talai.vercel.app/api/client/cars');
            const json = await res.json();
            if (res.ok && Array.isArray(json.cars)) {
                const mapping: Record<string, string> = {};
                json.cars.forEach((car: { id: string; routeId: string }) => {
                    mapping[car.id] = car.routeId;
                });
                setCarRouteMap(mapping);
            }
        } catch (err) {
            console.error('Failed to fetch cars mapping', err);
        }
    };

    useEffect(() => {
        fetchRoute();
        fetchCarsMapping();
        fetchLiveCars();

        const interval = setInterval(() => {
            fetchLiveCars();
        }, 10000);

        return () => clearInterval(interval);
    }, []);

    const initialLat = 14.0227;
    const initialLng = 99.9740;

    // Build markers for actual route stops and parking points
    const routePolylines = selectedRoute
        ? (() => {
            const pathPoints = selectedRoute.pathPoints;
            const stopPoints = pathPoints.filter(
                (point) => point.routestop_sequence !== null && point.routestop_sequence !== undefined
            );

            const seenCoords = new Set<string>();

            return stopPoints
                .map((point) => {
                    const coordKey = `${point.lat.toFixed(6)},${point.lng.toFixed(6)}`;
                    if (seenCoords.has(coordKey)) {
                        return '';
                    }
                    seenCoords.add(coordKey);

                    // Find all sequence numbers at the exact same coordinates
                    const duplicateSequences = pathPoints
                        .filter(
                            (p) =>
                                p.lat.toFixed(6) === point.lat.toFixed(6) &&
                                p.lng.toFixed(6) === point.lng.toFixed(6) &&
                                p.routestop_sequence !== null &&
                                p.routestop_sequence !== undefined
                        )
                        .map((p) => p.routestop_sequence as number)
                        .sort((a, b) => a - b);

                    const html = `<div class="bus-stop-pin"><img src="${busStopIconUri}" class="bus-stop-img" /><div class="bus-stop-pole"></div></div>`;

                    return `L.marker([${point.lat}, ${point.lng}], {
              icon: L.divIcon({
                className: '',
                html: ${JSON.stringify(html)},
                iconSize: [26, 38],
                iconAnchor: [13, 38],
              })
            }).addTo(map);`;
                })
                .filter((str) => str !== '');
        })()
        : [];

    const selectedRoutePolyline =
        selectedRoute && selectedRoute.pathPoints.length > 0
            ? `L.polyline([${selectedRoute.pathPoints
                .map((p) => `[${p.lat}, ${p.lng}]`)
                .join(', ')}], { color: '#16a34a', weight: 3, opacity: 0.85, lineCap: 'round', lineJoin: 'round' }).addTo(map);`
            : '';

    const filteredLiveCars = liveCars.filter((car) => {
        const rId = car.routeId || carRouteMap[car.carId];
        return rId === selectedRoute?.id;
    });

    useEffect(() => {
        if (selectedRoute && filteredLiveCars.length > 0) {
            const hasCurrentCarOnRoute = filteredLiveCars.some((car) => car.carId === selectedCarId);
            if (!hasCurrentCarOnRoute) {
                setSelectedCarId(filteredLiveCars[0].carId);
            }
        } else {
            setSelectedCarId(null);
        }
    }, [selectedRoute, liveCars, carRouteMap]);

    const selectedCar = selectedCarId
        ? liveCars.find((car) => car.carId === selectedCarId) ?? null
        : null;

    const mapRoutePoints = selectedRoute?.name?.trim() === 'สายหน้ามอ'
        ? routes.find((route) => (route.name || '').trim() === 'สายหอใน')?.pathPoints ?? selectedRoute?.pathPoints ?? []
        : selectedRoute?.pathPoints ?? [];
    const mapRoutePointsString = mapRoutePoints.map((point) => `[${point.lat}, ${point.lng}]`).join(', ');

    // A simple side-view bus glyph, similar in spirit to a standard round bus/transit icon.
    const busGlyphSvg =
        '<svg viewBox="0 0 24 24" width="16" height="16" fill="white" xmlns="http://www.w3.org/2000/svg">' +
        '<path d="M4 16.5V6.5C4 5.12 5.12 4 6.5 4h11C18.88 4 20 5.12 20 6.5v10c0 .83-.4 1.56-1 2.02V20a1 1 0 0 1-1 1h-1a1 1 0 0 1-1-1v-1H8v1a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-1.48A2.5 2.5 0 0 1 4 16.5ZM6.5 6a.5.5 0 0 0-.5.5V11h12V6.5a.5.5 0 0 0-.5-.5h-11ZM6 13v2a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-2H6Zm1.5 3.5a1 1 0 1 0 0 2 1 1 0 0 0 0-2Zm9 0a1 1 0 1 0 0 2 1 1 0 0 0 0-2Z"/>' +
        '</svg>';

    const liveCarMarkers = (selectedCar ? [selectedCar] : filteredLiveCars)
        .map((car) => {
            const html = `<div class="live-car-circle">${busGlyphSvg}</div>`;

            return `L.marker([${car.lat}, ${car.lng}], {
          icon: L.divIcon({
            className: '',
            html: ${JSON.stringify(html)},
            iconSize: [24, 24],
            iconAnchor: [12, 12],
          }),
          zIndexOffset: 1000
        }).addTo(map);`;
        })
        .join('\n');

    const leafletHtml = `
  <!DOCTYPE html>
  <html>
  <head>
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
    <style>
      html, body, #map {
        height: 100%;
        margin: 0;
        padding: 0;
      }
      .leaflet-top.leaflet-left {
        top: 80px !important;
      }
      /* Bus stop sign with pole */
      .bus-stop-pin {
        display: flex;
        flex-direction: column;
        align-items: center;
        width: 26px;
      }
      .bus-stop-img {
        width: 26px;
        height: 26px;
        display: block;
        border-radius: 4px;
        box-shadow: 0 2px 5px rgba(0, 0, 0, 0.25);
      }
      .bus-stop-pole {
        width: 2px;
        height: 12px;
        background: #94a3b8;
        border-radius: 1px;
        box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
      }

      /* Live car marker: a plain round bus glyph, no animation or badge. */
      .live-car-circle {
        width: 24px;
        height: 24px;
        border-radius: 50%;
        background: #2563eb;
        border: 2px solid white;
        box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3);
        display: flex;
        align-items: center;
        justify-content: center;
      }
    </style>
  </head>
  <body>
    <div id="map"></div>
    <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
    <script>
      // Map is created without an initial view; the view is set below (either
      // fit to the whole selected route, or a default fallback), then layers
      // are added on top.
      const map = L.map('map');

      ${mapRoutePoints.length > 0
            ? `
      // Zoom out to fit the whole route, with extra bottom padding so the
      // draggable bottom sheet (which can cover up to ~half the screen)
      // doesn't end up hiding part of the route.
      const _routeBounds = L.latLngBounds([${mapRoutePointsString}]);
      const _bottomPad = Math.round(window.innerHeight * 0.5);
      map.fitBounds(_routeBounds, { paddingTopLeft: [30, 30], paddingBottomRight: [30, _bottomPad] });
      `
            : `map.setView([${initialLat}, ${initialLng}], 15);`}

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; OpenStreetMap',
      }).addTo(map);

      // Draw selected route
      ${selectedRoutePolyline}
      ${routePolylines.join('\n')}
      ${liveCarMarkers}
    </script>
  </body>
  </html>
  `;

    const handleSelectRoute = (route: Route) => {
        setSelectedRoute(route);
    };

    return (
        <View style={{ flex: 1 }}>
            <WebView
                originWhitelist={['*']}
                source={{ html: leafletHtml as any }}
                style={StyleSheet.absoluteFill}
            />

            {error && (
                <View style={styles.errorBox}>
                    <View style={styles.errorIconDot} />
                    <Text style={styles.errorText}>{error}</Text>
                </View>
            )}

            {routes.length > 0 && (
                <RoutesBottomSheet
                    routes={routes}
                    liveCars={filteredLiveCars}
                    onSelectRoute={handleSelectRoute}
                    selectedRouteId={selectedRoute?.id || null}
                    selectedCarId={selectedCarId}
                    onSelectCar={setSelectedCarId}
                    onOpen={fetchRoute}
                />
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    errorBox: {
        position: 'absolute',
        top: 50,
        left: 20,
        right: 20,
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'white',
        paddingVertical: 12,
        paddingHorizontal: 14,
        borderRadius: 14,
        shadowColor: '#000',
        shadowOpacity: 0.15,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 3 },
        elevation: 5,
    },
    errorIconDot: {
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: '#ef4444',
        marginRight: 10,
    },
    errorText: {
        flex: 1,
        color: '#b91c1c',
        fontWeight: '600',
        fontSize: 13,
    },
});