import React, { useEffect, useState, useRef } from 'react';
import { StyleSheet, View, Text, Image, Animated } from 'react-native';
import { Asset } from 'expo-asset';
import * as FileSystem from 'expo-file-system/legacy';
import { WebView } from 'react-native-webview';
import RoutesBottomSheet from './component/RoutesBottomSheet';
import SplashScreen from './component/SplashScreen';
import { useCarLocation } from './hooks/useCarLocation';
import {
    getCars,
    getRoutePoints,
    getRoutes,
    type LiveCarLocation,
    type Route,
} from './services/talaiApi';

const busStopIconModule = require('../assets/BUS_STOP_ICON.png');
const busIconModule = require('../assets/BUS_ICON.png');
const busStopIconUri = Image.resolveAssetSource(busStopIconModule).uri;
const busIconUri = Image.resolveAssetSource(busIconModule).uri;

type MarkerIconUris = {
    busStop: string;
    bus: string;
};

/**
 * WebView does not consistently resolve React Native's local asset URI in a
 * release APK. Convert the bundled images to data URIs so Leaflet can load
 * them regardless of whether the app is running in Expo or as a standalone
 * Android build.
 */
const loadImageAsDataUri = async (assetModule: number, fallbackUri: string): Promise<string> => {
    try {
        const asset = Asset.fromModule(assetModule);
        await asset.downloadAsync();

        if (asset.localUri) {
            const base64 = await FileSystem.readAsStringAsync(asset.localUri, {
                encoding: FileSystem.EncodingType.Base64,
            });
            return `data:image/png;base64,${base64}`;
        }
    } catch (err) {
        console.warn('Failed to read bundled marker asset:', err);
    }

    // Keep a fallback for development/web where the bundler serves a URL.
    const response = await fetch(fallbackUri);
    if (!response.ok) {
        throw new Error(`Unable to load marker asset (${response.status})`);
    }

    const blob = await response.blob();
    return await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
            const result = reader.result;
            if (typeof result === 'string' && result.startsWith('data:')) {
                resolve(result);
            } else {
                reject(new Error('Marker asset was not converted to a data URI'));
            }
        };
        reader.onerror = () => reject(reader.error ?? new Error('Failed to read marker asset'));
        reader.readAsDataURL(blob);
    });
};

export default function HomeScreen() {
    const [showSplash, setShowSplash] = useState(true);
    const splashOpacity = useRef(new Animated.Value(1)).current;
    const contentOpacity = useRef(new Animated.Value(0)).current;
    const [routes, setRoutes] = useState<Route[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [selectedRoute, setSelectedRoute] = useState<Route | null>(null);
    const [selectedCarId, setSelectedCarId] = useState<string | null>(null);
    const [carRouteMap, setCarRouteMap] = useState<Record<string, string>>({});
    const { currentLocation: liveCars, error: locationError } = useCarLocation();
    const [markerIconUris, setMarkerIconUris] = useState<MarkerIconUris>({
        busStop: busStopIconUri,
        bus: busIconUri,
    });
    const initialCarSelectedRef = useRef(false);
    const webViewRef = useRef<React.ElementRef<typeof WebView>>(null);

    useEffect(() => {
        if (locationError) setError(locationError);
    }, [locationError]);

    useEffect(() => {
        let cancelled = false;

        Promise.all([
            loadImageAsDataUri(busStopIconModule, busStopIconUri),
            loadImageAsDataUri(busIconModule, busIconUri),
        ])
            .then(([busStop, bus]) => {
                if (!cancelled) {
                    setMarkerIconUris({ busStop, bus });
                }
            })
            .catch((err) => {
                // Keep the original URI as a fallback. This is useful in
                // development builds where the bundler serves the asset URL.
                console.warn('Failed to inline map marker assets:', err);
            });

        return () => {
            cancelled = true;
        };
    }, []);

    useEffect(() => {
        const timer = setTimeout(() => {
            Animated.parallel([
                Animated.timing(splashOpacity, {
                    toValue: 0,
                    duration: 500,
                    useNativeDriver: true,
                }),
                Animated.timing(contentOpacity, {
                    toValue: 1,
                    duration: 500,
                    useNativeDriver: true,
                }),
            ]).start(() => {
                setShowSplash(false);
            });
        }, 2000);

        return () => clearTimeout(timer);
    }, [splashOpacity, contentOpacity]);

    /* Legacy polling implementation retained for reference only.
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
            setError(null);

            const defaultRoute = json.routes.find(
                (route: Route) => (route.name || '').trim() === 'สายหน้ามอ'
            );

            if (defaultRoute) {
                setSelectedRoute(defaultRoute);
            }
        } catch (err) {
            console.error('fetchRoute failed:', err);
            setError('ไม่สามารถเชื่อมต่ออินเทอร์เน็ตหรือเซิร์ฟเวอร์ได้');
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
            setError(null);
        } catch (err) {
            console.error('fetchLiveCars failed:', err);
            setError('ไม่สามารถเชื่อมต่ออินเทอร์เน็ตหรือเซิร์ฟเวอร์ได้');
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
            console.error('Failed to fetch cars mapping:', err);
        }
    };

    */
    const fetchRouteFromApi = async () => {
        try {
            const routeList = await getRoutes();
            const routesWithPoints = await Promise.all(
                routeList.map(async (route) => {
                    try {
                        // `/route-points/by-route` contains stop names and
                        // timeToNextSecs, so prefer it over the points
                        // included in the route summary.
                        const routePoints = await getRoutePoints(route.id);
                        console.log(
                            '[API] route points loaded:',
                            route.id,
                            routePoints.length,
                            routePoints
                                .filter((point) => Boolean(point.name?.trim()))
                                .slice(0, 5)
                                .map((point) => ({
                                    name: point.name,
                                    timeToNextSecs: point.timeToNextSecs,
                                }))
                        );
                        return {
                            ...route,
                            pathPoints: routePoints.length > 0 ? routePoints : route.pathPoints,
                        };
                    } catch (pointsError) {
                        console.warn(`Failed to load points for route ${route.id}:`, pointsError);
                        return route;
                    }
                })
            );

            if (routesWithPoints.length === 0) {
                setError('ไม่พบข้อมูลเส้นทางจาก API');
                return;
            }

            setRoutes(routesWithPoints);
            setError(null);
            setSelectedRoute(
                routesWithPoints.find((route) => route.name.includes('หน้ามอ')) ??
                routesWithPoints[0]
            );
        } catch (routeError) {
            console.error('fetchRouteFromApi failed:', routeError);
            setError(
                routeError instanceof Error
                    ? routeError.message
                    : 'ไม่สามารถโหลดข้อมูลเส้นทางได้'
            );
        }
    };

    const fetchCarsMappingFromApi = async () => {
        try {
            const cars = await getCars();
            const mapping: Record<string, string> = {};
            cars.forEach((car) => {
                if (car.routeId) mapping[car.carId] = car.routeId;
            });
            setCarRouteMap(mapping);
        } catch (carsError) {
            console.error('fetchCarsMappingFromApi failed:', carsError);
        }
    };

    useEffect(() => {
        fetchRouteFromApi();
        fetchCarsMappingFromApi();
    }, []);

    const initialLat = 14.0227;
    const initialLng = 99.9740;

    // Build markers for actual route stops and parking points
    const routePolylines = selectedRoute
        ? (() => {
            const pathPoints = selectedRoute.pathPoints;
            const stopPoints = pathPoints.filter(
                // API ส่ง sequence มาให้ทุกจุดของเส้นทาง แต่จุดจอดจริงจะมีชื่อป้าย
                (point) => Boolean(point.name?.trim())
            );

            const seenCoords = new Set<string>();

            return stopPoints
                .map((point) => {
                    const coordKey = `${point.lat.toFixed(6)},${point.lng.toFixed(6)}`;
                    if (seenCoords.has(coordKey)) {
                        return '';
                    }
                    seenCoords.add(coordKey);

                    const html = `<div class="bus-stop-pin"><img src="${markerIconUris.busStop}" class="bus-stop-img" /><div class="bus-stop-pole"></div></div>`;
                    const stopName = point.name || 'ไม่มีชื่อจุดจอด';

                    return `L.marker([${point.lat}, ${point.lng}], {
              icon: L.divIcon({
                className: '',
                html: ${JSON.stringify(html)},
                iconSize: [26, 38],
                iconAnchor: [13, 38],
                popupAnchor: [0, -38],
              })
            }).bindPopup(${JSON.stringify(stopName)}, { closeButton: false }).addTo(map);`;
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

    const liveCarMarkers = (selectedCar ? [selectedCar] : filteredLiveCars)
        .map((car) => {
            const html = `<div class="live-car-circle"><img src="${markerIconUris.bus}" class="live-car-img" /></div>`;

            return `L.marker([${car.lat}, ${car.lng}], {
          icon: L.divIcon({
            className: '',
            html: ${JSON.stringify(html)},
            iconSize: [30, 30],
            iconAnchor: [16, 16],
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
      /* Custom compact popup styling */
      .leaflet-popup-content-wrapper {
        padding: 4px 8px !important;
        border-radius: 8px !important;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2) !important;
      }
      .leaflet-popup-content {
        margin: 4px 6px !important;
        font-size: 13px !important;
        font-weight: 600 !important;
        color: #1e293b !important;
        line-height: 1.4 !important;
      }
      .leaflet-container a.leaflet-popup-close-button {
        top: 2px !important;
        right: 2px !important;
        padding: 2px 4px !important;
        font-size: 14px !important;
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

      /* Live car marker: circular bus icon without square white background */
      .live-car-circle {
        width: 23px;
        height: 23px;
        border-radius: 50%;
        overflow: hidden;
        box-shadow: 0 2px 6px rgba(0, 0, 0, 0.35);
        display: flex;
        align-items: center;
        justify-content: center;
        background: transparent;
      }
      .live-car-img {
        width: 100%;
        height: 100%;
        border-radius: 50%;
        display: block;
        object-fit: cover;
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
      const map = L.map('map', { zoomControl: false });

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

    const handleSelectStop = (stop: { lat: number; lng: number; name?: string | null }) => {
        if (webViewRef.current) {
            const jsCode = `
              if (typeof map !== 'undefined') {
                map.flyTo([${stop.lat}, ${stop.lng}], 18, { animate: true, duration: 1 });
              }
              true;
            `;
            webViewRef.current.injectJavaScript(jsCode);
        }
    };

    return (
        <View style={{ flex: 1 }}>
            <Animated.View style={[StyleSheet.absoluteFill, { opacity: contentOpacity }]}>
                <WebView
                    ref={webViewRef}
                    originWhitelist={['*']}
                    allowFileAccess
                    allowingReadAccessToURL="file:///"
                    allowUniversalAccessFromFileURLs
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
                        onSelectStop={handleSelectStop}
                        onOpen={fetchRouteFromApi}
                    />
                )}
            </Animated.View>

            {showSplash && (
                <Animated.View style={[StyleSheet.absoluteFill, { opacity: splashOpacity }]} pointerEvents={showSplash ? 'auto' : 'none'}>
                    <SplashScreen onFinish={() => setShowSplash(false)} />
                </Animated.View>
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
