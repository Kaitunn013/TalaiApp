export type RoutePoint = {
    lat: number;
    lng: number;
    routestop_sequence?: number | null;
    name?: string | null;
    routeId?: string | null;
    timeToNextSecs?: number | null;
};

export type Route = {
    id: string;
    name: string;
    pathPoints: RoutePoint[];
};

export type LiveCarLocation = {
    carId: string;
    lat: number;
    lng: number;
    status: string;
    eta: unknown;
    routeId?: string | null;
    createdAt?: string | null;
};

const API_BASE_URL =
    process.env.EXPO_PUBLIC_API_URL || 'https://api.talai-kukps.app';
export const LIVE_LOCATIONS_WS_URL =
    process.env.EXPO_PUBLIC_WS_URL || 'wss://api.talai-kukps.app';

export const getMobileToken = () =>
    process.env.EXPO_PUBLIC_MOBILE_TOKEN?.trim() || '';

export class TalaiApiError extends Error {
    status?: number;

    constructor(message: string, status?: number) {
        super(message);
        this.name = 'TalaiApiError';
        this.status = status;
    }
}

const getHeaders = (): Record<string, string> => {
    const token = getMobileToken();

    if (!token) {
        throw new TalaiApiError(
            'ยังไม่ได้ตั้งค่า EXPO_PUBLIC_MOBILE_TOKEN ในไฟล์ .env.local'
        );
    }

    return {
        Accept: 'application/json',
        'x-mobile-token': token,
    };
};

const requestJson = async (path: string): Promise<unknown> => {
    const response = await fetch(`${API_BASE_URL}${path}`, {
        headers: getHeaders(),
    });

    let body: unknown;
    try {
        body = await response.json();
    } catch {
        body = null;
    }

    if (!response.ok) {
        const message =
            typeof body === 'object' && body !== null && 'message' in body
                ? String((body as { message?: unknown }).message)
                : `HTTP ${response.status}`;
        throw new TalaiApiError(message, response.status);
    }

    if (
        typeof body === 'object' &&
        body !== null &&
        'success' in body &&
        (body as { success?: unknown }).success === false
    ) {
        throw new TalaiApiError(
            'message' in body
                ? String((body as { message?: unknown }).message)
                : 'API request failed',
            response.status
        );
    }

    return body;
};

const findArray = (value: unknown, keys: string[] = []): unknown[] => {
    if (Array.isArray(value)) return value;
    if (typeof value !== 'object' || value === null) return [];

    const record = value as Record<string, unknown>;
    for (const key of keys) {
        if (Array.isArray(record[key])) return record[key] as unknown[];
    }

    if (record.data !== undefined) {
        const nested = findArray(record.data, keys);
        if (nested.length > 0) return nested;
    }

    return [];
};

const toNumber = (value: unknown): number => {
    const number = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(number) ? number : 0;
};

const toStringValue = (value: unknown, fallback = '') =>
    value === null || value === undefined ? fallback : String(value);

const normalizePoint = (value: unknown): RoutePoint | null => {
    if (typeof value !== 'object' || value === null) return null;
    const point = value as Record<string, unknown>;
    const lat = toNumber(point.lat ?? point.latitude);
    const lng = toNumber(point.lng ?? point.longitude ?? point.lon);

    if (lat === 0 && lng === 0) return null;

    const sequence =
        point.routestop_sequence ??
        point.routeStopSequence ??
        point.route_stop_sequence ??
        point.sequence;
    const timeToNextSecs = point.timeToNextSecs ?? point.time_to_next_secs;

    return {
        lat,
        lng,
        routestop_sequence:
            sequence === null || sequence === undefined ? null : toNumber(sequence),
        name:
            point.name ?? point.stopName ?? point.stop_name
                ? String(point.name ?? point.stopName ?? point.stop_name)
                : null,
        routeId: toStringValue(point.routeId ?? point.route_id, '') || null,
        timeToNextSecs:
            timeToNextSecs === null || timeToNextSecs === undefined
                ? null
                : toNumber(timeToNextSecs),
    };
};

const normalizeRoute = (value: unknown): Route | null => {
    if (typeof value !== 'object' || value === null) return null;
    const route = value as Record<string, unknown>;
    const id = toStringValue(route.id ?? route.routeId ?? route.route_id);
    if (!id) return null;

    const points = findArray(route.pathPoints ?? route.points, [
        'pathPoints',
        'points',
        'routePoints',
    ])
        .map(normalizePoint)
        .filter((point): point is RoutePoint => point !== null);

    return {
        id,
        name: toStringValue(route.name ?? route.routeName ?? route.route_name, id),
        pathPoints: points,
    };
};

const normalizeCar = (value: unknown): LiveCarLocation | null => {
    if (typeof value !== 'object' || value === null) return null;
    const car = value as Record<string, unknown>;
    const carId = toStringValue(car.carId ?? car.id ?? car.car_id);
    if (!carId) return null;

    return {
        carId,
        lat: toNumber(car.lat ?? car.latitude),
        lng: toNumber(car.lng ?? car.longitude ?? car.lon),
        status: toStringValue(car.status, 'active'),
        eta: car.eta ?? null,
        routeId: toStringValue(car.routeId ?? car.route_id, '') || null,
        createdAt: toStringValue(car.createdAt ?? car.created_at, '') || null,
    };
};

export async function getRoutes(): Promise<Route[]> {
    const payload = await requestJson('/routes');
    const routes = findArray(payload, ['routes']);

    return routes
        .map(normalizeRoute)
        .filter((route): route is Route => route !== null);
}

export async function getRoutePoints(routeId: string): Promise<RoutePoint[]> {
    const payload = await requestJson(
        `/route-points/by-route/${encodeURIComponent(routeId)}`
    );

    return findArray(payload, ['routePoints', 'points'])
        .map(normalizePoint)
        .filter((point): point is RoutePoint => point !== null);
}

export async function getCars(): Promise<LiveCarLocation[]> {
    const payload = await requestJson('/cars');
    return findArray(payload, ['cars'])
        .map(normalizeCar)
        .filter((car): car is LiveCarLocation => car !== null);
}

export async function getLivePositions(): Promise<LiveCarLocation[]> {
    const payload = await requestJson('/cars/live-positions');
    return findArray(payload, ['locations', 'livePositions', 'cars'])
        .map(normalizeCar)
        .filter((car): car is LiveCarLocation => car !== null);
}

export function normalizeLiveLocationMessage(payload: unknown): LiveCarLocation[] {
    const values = Array.isArray(payload)
        ? payload
        : findArray(payload, ['locations', 'livePositions', 'cars']);

    if (values.length > 0) {
        return values
            .map(normalizeCar)
            .filter((car): car is LiveCarLocation => car !== null);
    }

    const single =
        typeof payload === 'object' &&
        payload !== null &&
        'data' in payload
            ? normalizeCar((payload as Record<string, unknown>).data)
            : normalizeCar(payload);
    return single ? [single] : [];
}
