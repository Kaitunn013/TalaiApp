import type { Route } from '../services/talaiApi';

// ระยะห่างที่ใช้ตัดสินว่ารถมาถึงป้ายแล้ว หน่วยเป็นเมตร
const STOP_ARRIVAL_RADIUS_METERS = 35;

// จำนวน path point ที่ยอมให้ตำแหน่งรถดูเหมือนย้อนกลับได้
// ใช้ป้องกัน GPS แกว่งเล็กน้อย แต่ไม่ให้ลำดับป้ายย้อนกลับจริง
const PATH_BACKTRACK_TOLERANCE = 4;

// ข้อมูลสถานะที่ต้องจำไว้ระหว่างการคำนวณแต่ละครั้ง
// เพื่อให้การคำนวณครั้งใหม่รู้ว่ารถอยู่ตรงไหนของเส้นทางก่อนหน้า
export type LocalStopProgressState = {
    routeId: string;
    pathIndex: number;
    nextStopSequence: number;
};

// ผลลัพธ์ที่ส่งกลับไปให้หน้าจอ เช่น ลำดับและชื่อป้ายถัดไป
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

// แปลงองศาเป็นเรเดียน เพื่อใช้กับฟังก์ชันตรีโกณมิติ
const toRadians = (value: number) => (value * Math.PI) / 180;

/**
 * คำนวณระยะทางระหว่างพิกัดสองจุดด้วยสูตร Haversine
 * ใช้กับพิกัดละติจูดและลองจิจูดของรถกับจุดบนแผนที่
 */
const distanceInMeters = (
    first: { lat: number; lng: number },
    second: { lat: number; lng: number }
) => {
    // รัศมีโลกโดยประมาณ หน่วยเป็นเมตร
    const earthRadiusMeters = 6371000;

    // แปลงความต่างของพิกัดจากองศาเป็นเรเดียน
    const latitudeDelta = toRadians(second.lat - first.lat);
    const longitudeDelta = toRadians(second.lng - first.lng);
    const firstLatitude = toRadians(first.lat);
    const secondLatitude = toRadians(second.lat);

    // ส่วนคำนวณหลักของสูตร Haversine
    const a =
        Math.sin(latitudeDelta / 2) ** 2 +
        Math.cos(firstLatitude) *
            Math.cos(secondLatitude) *
            Math.sin(longitudeDelta / 2) ** 2;

    return 2 * earthRadiusMeters * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

// ดึงเฉพาะจุดที่เป็นป้ายรถจาก pathPoints และจัดลำดับป้ายใหม่เป็น 1, 2, 3...
const getRouteStops = (route: Route): RouteStop[] => {
    // ป้องกันป้ายข้อมูลซ้ำจาก API
    const seenStopKeys = new Set<string>();

    // ใช้หาพิกัดของป้ายแรก เพื่อตรวจว่าปลายทางใช้พิกัดเดียวกันหรือไม่
    const firstNamedPointIndex = route.pathPoints.findIndex((point) => Boolean(point.name?.trim()));
    const firstNamedPoint = route.pathPoints[firstNamedPointIndex];
    const firstStopCoordinate = firstNamedPoint
        ? `${firstNamedPoint.lat.toFixed(6)},${firstNamedPoint.lng.toFixed(6)}`
        : null;

    return route.pathPoints
        // เก็บ index เดิมไว้ เพราะต้องใช้บอกตำแหน่งบนเส้นทาง
        .map((point, pathIndex) => ({ point, pathIndex }))
        // เอาเฉพาะ path point ที่มีชื่อป้าย
        .filter(({ point }) => Boolean(point.name?.trim()))
        .filter(({ point, pathIndex }) => {
            const coordinateKey = `${point.lat.toFixed(6)},${point.lng.toFixed(6)}`;

            // ปลายทางใช้พิกัดเดียวกับต้นทางและหมายถึงป้าย 1 เดียวกัน
            // จึงไม่สร้างป้ายใหม่ซ้ำเมื่อวนกลับมาที่จุดเริ่มต้น
            if (
                pathIndex > firstNamedPointIndex &&
                firstStopCoordinate !== null &&
                coordinateKey === firstStopCoordinate
            ) {
                return false;
            }

            // ใช้ sequence และชื่อป้ายช่วยตรวจข้อมูลซ้ำจาก API
            const sequence = point.routestop_sequence ?? `path-${pathIndex}`;
            const stopKey = `${sequence}|${point.name?.trim().toLowerCase() || ''}`;
            if (seenStopKeys.has(stopKey)) return false;
            seenStopKeys.add(stopKey);
            return true;
        })
        // เรียงตามลำดับป้ายของ API ถ้ามีข้อมูล sequence
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
        // แปลงลำดับจาก API ให้เป็นลำดับที่ใช้บน Mobile เริ่มจาก 1
        .map(({ point, pathIndex }, index) => ({
            sequence: index + 1,
            name: point.name?.trim() || 'ไม่มีชื่อจุดจอด',
            lat: point.lat,
            lng: point.lng,
            pathIndex,
    }));
};

// หาว่า GPS ของรถอยู่ใกล้ path point ลำดับใดที่สุด
const findNearestPathIndex = (
    route: Route,
    carLocation: { lat: number; lng: number },
    previousState?: LocalStopProgressState
) => {
    // ถ้าเส้นทางไม่มีจุด ก็ไม่สามารถคำนวณตำแหน่งรถได้
    if (route.pathPoints.length === 0) return null;

    let nearestIndex = 0;
    let nearestDistance = Number.POSITIVE_INFINITY;

    // เปรียบเทียบระยะจากรถไปยัง path point ทุกจุด
    route.pathPoints.forEach((point, index) => {
        const distance = distanceInMeters(carLocation, point);
        if (distance < nearestDistance) {
            nearestDistance = distance;
            nearestIndex = index;
        }
    });

    // ถ้าเป็นการคำนวณครั้งแรก ให้ใช้จุดที่ใกล้ที่สุดทันที
    if (!previousState || previousState.routeId !== route.id) {
        return nearestIndex;
    }

    // ตรวจกรณีรถวิ่งครบหนึ่งรอบ จากช่วงท้ายกลับไปช่วงต้นเส้นทาง
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

// ฟังก์ชันหลัก: คำนวณว่าป้ายถัดไปของรถคือป้ายใด
export const calculateLocalNextStop = (
    route: Route,
    carLocation: { lat: number; lng: number },
    previousState?: LocalStopProgressState
): LocalNextStopResult | null => {
    // เตรียมรายการป้ายที่เรียงตามเส้นทาง
    const stops = getRouteStops(route);

    // หาตำแหน่ง path point ที่ใกล้รถที่สุด โดยใช้สถานะก่อนหน้าช่วยกันการย้อนกลับ
    const nearestPathIndex = findNearestPathIndex(route, carLocation, previousState);

    // ถ้าไม่มีป้ายหรือไม่มีตำแหน่งบนเส้นทาง ให้จบการคำนวณ
    if (stops.length === 0 || nearestPathIndex === null) return null;

    // เลือกป้ายแรกที่อยู่หลังตำแหน่งปัจจุบันบนเส้นทาง
    const candidateIndex = Math.max(
        0,
        stops.findIndex((stop) => stop.pathIndex > nearestPathIndex)
    );
    const candidateStop = stops[candidateIndex];

    // คำนวณระยะจากรถถึงป้ายที่คาดว่าเป็นป้ายถัดไป
    const distanceToCandidate = distanceInMeters(carLocation, candidateStop);

    // ถ้ารถเข้าใกล้ป้ายไม่เกิน 35 เมตร ให้ถือว่าผ่านป้ายนั้นแล้ว
    // แล้วเลื่อนไปยังป้ายถัดไป
    const nextStopIndex =
        distanceToCandidate <= STOP_ARRIVAL_RADIUS_METERS
            ? (candidateIndex + 1) % stops.length
            : candidateIndex;
    const nextStop = stops[nextStopIndex];

    // บันทึกสถานะไว้ใช้ในการคำนวณ WebSocket ครั้งถัดไป
    const state: LocalStopProgressState = {
        routeId: route.id,
        pathIndex: nearestPathIndex,
        nextStopSequence: nextStop.sequence,
    };

    // ส่งข้อมูลป้ายถัดไป ระยะทาง และสถานะล่าสุดกลับให้ HomeScreen
    return {
        nextStopSequence: nextStop.sequence,
        nextStopName: nextStop.name,
        distanceToNextStopMeters: distanceInMeters(carLocation, nextStop),
        state,
    };
};
