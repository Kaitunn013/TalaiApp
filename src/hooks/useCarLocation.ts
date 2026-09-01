import { useEffect, useRef, useState } from 'react';
import {
    getLivePositions,
    getMobileToken,
    LIVE_LOCATIONS_WS_URL,
    normalizeLiveLocationMessage,
    type LiveCarLocation,
} from '../services/talaiApi';

type WebSocketOptions = {
    headers?: Record<string, string>;
};

type WebSocketConstructor = new (
    url: string,
    protocols?: string | string[],
    options?: WebSocketOptions
) => WebSocket;

const WebSocketWithHeaders = WebSocket as unknown as WebSocketConstructor;

const collectWebSocketTimeFields = (
    value: unknown,
    path = '',
    result: Record<string, unknown> = {},
    depth = 0
) => {
    if (depth > 4 || value === null || value === undefined) return result;

    if (Array.isArray(value)) {
        value.slice(0, 3).forEach((item, index) => {
            collectWebSocketTimeFields(item, `${path}[${index}]`, result, depth + 1);
        });
        return result;
    }

    if (typeof value !== 'object') return result;

    Object.entries(value as Record<string, unknown>).forEach(([key, item]) => {
        const fieldPath = path ? `${path}.${key}` : key;

        if (/time|eta|stop|sequence/i.test(key)) {
            result[fieldPath] = item;
        }

        if (item !== null && typeof item === 'object') {
            collectWebSocketTimeFields(item, fieldPath, result, depth + 1);
        }
    });

    return result;
};

const mergeLocations = (
    previous: LiveCarLocation[],
    updates: LiveCarLocation[]
) => {
    const byCarId = new Map(previous.map((car) => [car.carId, car]));
    updates.forEach((car) => {
        const previousCar = byCarId.get(car.carId);
        byCarId.set(car.carId, previousCar ? { ...previousCar, ...car } : car);
    });
    return Array.from(byCarId.values());
};

export function useCarLocation(wsUrl = LIVE_LOCATIONS_WS_URL) {
    const [currentLocation, setCurrentLocation] = useState<LiveCarLocation[]>([]);
    const [isConnected, setIsConnected] = useState(false);
    const [hasReceivedWebSocketUpdate, setHasReceivedWebSocketUpdate] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const socketRef = useRef<WebSocket | null>(null);
    const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        let disposed = false;
        const mobileToken = getMobileToken();

        const clearReconnectTimer = () => {
            if (reconnectTimerRef.current) {
                clearTimeout(reconnectTimerRef.current);
                reconnectTimerRef.current = null;
            }
        };

        const scheduleReconnect = (connect: () => void) => {
            if (disposed || reconnectTimerRef.current) return;
            reconnectTimerRef.current = setTimeout(() => {
                reconnectTimerRef.current = null;
                connect();
            }, 3000);
        };

        const connect = () => {
            if (disposed || !mobileToken) return;

            console.log('[WS] connecting:', wsUrl);
            const socket = new WebSocketWithHeaders(wsUrl, undefined, {
                headers: {
                    'x-mobile-token': mobileToken,
                },
            });
            socketRef.current = socket;

            socket.onopen = () => {
                console.log('[WS] connected');
                if (!disposed) {
                    setIsConnected(true);
                    setError(null);
                }
            };

            socket.onmessage = (event) => {
                if (disposed) return;

                try {
                    const payload = JSON.parse(String(event.data));
                    const updates = normalizeLiveLocationMessage(payload);
                    console.log('[WS] message received:', updates.length, 'location(s)');
                    console.log(
                        '[WS] car status:',
                        updates.map((car) => ({
                            carId: car.carId,
                            status: car.status,
                            createdAt: car.createdAt,
                        }))
                    );
                    console.log('[WS] payload time/stop fields:', collectWebSocketTimeFields(payload));
                    if (updates.length === 0) return;

                    setHasReceivedWebSocketUpdate(true);

                    const isSnapshot =
                        Array.isArray(payload) ||
                        (typeof payload === 'object' &&
                            payload !== null &&
                            ['locations', 'livePositions', 'cars'].some((key) =>
                                Array.isArray((payload as Record<string, unknown>)[key])
                            ));

                    setCurrentLocation((previous) =>
                        isSnapshot ? updates : mergeLocations(previous, updates)
                    );
                } catch (messageError) {
                    console.error('Invalid car location WebSocket message:', messageError);
                }
            };

            socket.onerror = () => {
                console.error('[WS] error');
                if (!disposed) setIsConnected(false);
                // onclose will schedule the reconnect.
                socket.close();
            };

            socket.onclose = (event) => {
                console.log('[WS] disconnected:', event.code, event.reason || 'no reason');
                socketRef.current = null;
                if (!disposed) {
                    setIsConnected(false);
                    scheduleReconnect(connect);
                }
            };
        };

        const loadInitialLocation = async () => {
            if (!mobileToken) {
                setError('ยังไม่ได้ตั้งค่า EXPO_PUBLIC_MOBILE_TOKEN ในไฟล์ .env.local');
                return;
            }

            try {
                const initialLocations = await getLivePositions();
                setCurrentLocation(initialLocations);
                console.log('[API] initial locations loaded:', initialLocations.length, 'location(s)');
                setError(null);
            } catch (initialError) {
                console.error('Failed to fetch initial car locations:', initialError);
                setError(
                    initialError instanceof Error
                        ? initialError.message
                        : 'ไม่สามารถโหลดตำแหน่งรถเริ่มต้นได้'
                );
            } finally {
                connect();
            }
        };

        loadInitialLocation();

        return () => {
            disposed = true;
            clearReconnectTimer();
            socketRef.current?.close();
            socketRef.current = null;
        };
    }, [wsUrl]);

    return { currentLocation, isConnected, error, hasReceivedWebSocketUpdate };
}
