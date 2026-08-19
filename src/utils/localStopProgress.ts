import type { Route } from '../services/talaiApi';

// ระยะนี้ใช้ตัดสินว่ารถมาถึงป้ายแล้ว สามารถปรับตามความแม่นยำของ GPS ได้
const STOP_ARRIVAL_RADIUS_METERS = 35;
const PATH_BACKTRACK_TOLERANCE = 4;

export type LocalStopProgressState = {
    routeId: string;
    pathIndex: number;
    nextStopSequence: number;
};

export type LocalNextStopResult = {
    nextStopSequence: number;
    nextStopName: string;
    distanceToNextStopMeters: number;
    state: LocalStopProgressState;
};

type RouteStop = {
    sequence: number;
    name: string;
    lat: number;
    lng: number;
    pathIndex: number;
};

const toRadians = (value: number) => (value * Math.PI) / 180;

/** คำนวณระยะทางระหว่างพิกัดสองจุดด้วยสูตร Haversine */
const distanceInMeters = (
    first: { lat: number; lng: number },
    second: { lat: number; lng: number }
) => {
    const earthRadiusMeters = 6371000;
    const latitudeDelta = toRadians(second.lat - first.lat);
    const longitudeDelta = toRadians(second.lng - first.lng);
    const firstLatitude = toRadians(first.lat);
    const secondLatitude = toRadians(second.lat);

    const a =
        Math.sin(latitudeDelta / 2) ** 2 +
        Math.cos(firstLatitude) *
            Math.cos(secondLatitude) *
            Math.sin(longitudeDelta / 2) ** 2;

    return 2 * earthRadiusMeters * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

const getRouteStops = (route: Route): RouteStop[] => {
    const seenCoordinates = new Set<string>();

    return route.pathPoints
        .map((point, pathIndex) => ({ point, pathIndex }))
        .filter(({ point }) => Boolean(point.name?.trim()))
        .filter(({ point }) => {
            const coordinateKey = `${point.lat.toFixed(6)},${point.lng.toFixed(6)}`;
            if (seenCoordinates.has(coordinateKey)) return false;
            seenCoordinates.add(coordinateKey);
            return true;
        })
        .sort((first, second) => {
            const firstSequence = first.point.routestop_sequence;
            const secondSequence = second.point.routestop_sequence;

            if (
                firstSequence !== null &&
                firstSequence !== undefined &&
                secondSequence !== null &&
                secondSequence !== undefined &&
                firstSequence !== secondSequence
            ) {
                return firstSequence - secondSequence;
            }

            return first.pathIndex - second.pathIndex;
        })
        .map(({ point, pathIndex }, index) => ({
            sequence: index + 1,
            name: point.name?.trim() || 'ไม่มีชื่อจุดจอด',
            lat: point.lat,
            lng: point.lng,
            pathIndex,
        }));
};

const findNearestPathIndex = (
    route: Route,
    carLocation: { lat: number; lng: number },
    previousState?: LocalStopProgressState
) => {
    if (route.pathPoints.length === 0) return null;

    let nearestIndex = 0;
    let nearestDistance = Number.POSITIVE_INFINITY;

    route.pathPoints.forEach((point, index) => {
        const distance = distanceInMeters(carLocation, point);
        if (distance < nearestDistance) {
            nearestDistance = distance;
            nearestIndex = index;
        }
    });

    if (!previousState || previousState.routeId !== route.id) {
        return nearestIndex;
    }

    const lastPathIndex = route.pathPoints.length - 1;
    const isCompletingLoop =
        previousState.pathIndex >= lastPathIndex * 0.75 && nearestIndex <= lastPathIndex * 0.25;

    // GPS อาจแกว่งย้อนกลับเล็กน้อย จึงไม่ให้ลำดับย้อนกลับ
    // แต่ยังอนุญาตให้เปลี่ยนจากจุดท้ายกลับไปจุดแรกเมื่อครบหนึ่งรอบ
    if (!isCompletingLoop && nearestIndex < previousState.pathIndex - PATH_BACKTRACK_TOLERANCE) {
        return previousState.pathIndex;
    }

    return nearestIndex;
};

export const calculateLocalNextStop = (
    route: Route,
    carLocation: { lat: number; lng: number },
    previousState?: LocalStopProgressState
): LocalNextStopResult | null => {
    const stops = getRouteStops(route);
    const nearestPathIndex = findNearestPathIndex(route, carLocation, previousState);

    if (stops.length === 0 || nearestPathIndex === null) return null;

    // เลือกป้ายแรกที่อยู่หลังตำแหน่งปัจจุบันบนเส้นทาง
    const candidateIndex = Math.max(
        0,
        stops.findIndex((stop) => stop.pathIndex >= nearestPathIndex)
    );
    const candidateStop = stops[candidateIndex];
    const distanceToCandidate = distanceInMeters(carLocation, candidateStop);

    // ถ้าอยู่ใกล้ป้ายในระยะที่กำหนด ให้ถือว่าผ่านป้ายนี้แล้ว
    const nextStopIndex =
        distanceToCandidate <= STOP_ARRIVAL_RADIUS_METERS
            ? (candidateIndex + 1) % stops.length
            : candidateIndex;
    const nextStop = stops[nextStopIndex];

    const state: LocalStopProgressState = {
        routeId: route.id,
        pathIndex: nearestPathIndex,
        nextStopSequence: nextStop.sequence,
    };

    return {
        nextStopSequence: nextStop.sequence,
        nextStopName: nextStop.name,
        distanceToNextStopMeters: distanceInMeters(carLocation, nextStop),
        state,
    };
};
