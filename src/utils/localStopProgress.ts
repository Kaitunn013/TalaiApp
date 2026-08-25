import type { Route } from '../services/talaiApi';

// ระยะห่างที่ใช้ตัดสินว่ารถมาถึงป้ายแล้ว หน่วยเป็นเมตร
const STOP_ARRIVAL_RADIUS_METERS = 5;

// จำนวน path point ที่ยอมให้ตำแหน่งรถดูเหมือนย้อนกลับได้
// ใช้ป้องกัน GPS แกว่งเล็กน้อย แต่ไม่ให้ลำดับป้ายย้อนกลับจริง
const PATH_BACKTRACK_TOLERANCE = 4;

// จำนวน path point ที่อนุญาตให้รถเดินหน้าได้ในหนึ่ง WebSocket update
// ช่วยป้องกันการเลือกถนนช่วงอื่นที่อยู่ใกล้กัน แต่ไม่อยู่ถัดจากตำแหน่งเดิม
const PATH_FORWARD_LOOKAHEAD = 12;

// จุดเริ่มต้นและจุดปลายทางอาจใช้พิกัดเดียวกัน
// ถ้ารถเพิ่งเริ่มส่งตำแหน่ง ให้ถือว่าอยู่ช่วงต้นเส้นทางก่อน
const START_END_AMBIGUITY_RADIUS_METERS = 80;

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

    const lastPathIndex = route.pathPoints.length - 1;
    const isNearStartPoint =
        distanceInMeters(carLocation, route.pathPoints[0]) <= START_END_AMBIGUITY_RADIUS_METERS;

    // ถ้าเป็นการคำนวณครั้งแรก ให้ใช้จุดที่ใกล้ที่สุดทันที
    if (!previousState || previousState.routeId !== route.id) {
        // ต้นทางและปลายทางเป็นพิกัดเดียวกัน จึงอาจเลือก path ช่วงท้ายผิดได้
        // ในการเริ่มต้นรอบใหม่ ให้เลือก path ช่วงต้นก่อน
        if (nearestIndex >= lastPathIndex * 0.75 && isNearStartPoint) {
            return 0;
        }

        return nearestIndex;
    }

    // ตรวจกรณีรถวิ่งครบหนึ่งรอบ จากช่วงท้ายกลับไปช่วงต้นเส้นทาง
    const isCompletingLoop =
        previousState.pathIndex >= lastPathIndex * 0.75 && nearestIndex <= lastPathIndex * 0.25;

    // จำกัดพื้นที่ค้นหาให้อยู่ใกล้ตำแหน่งเดิมและไปข้างหน้า
    // เพื่อไม่ให้ถนนขนานหรือเส้นทางที่ทับกันทำให้ index กระโดดไปช่วงอื่น
    const candidateIndexes = new Set<number>();
    const firstCandidateIndex = Math.max(
        0,
        previousState.pathIndex - PATH_BACKTRACK_TOLERANCE
    );
    const lastCandidateIndex = Math.min(
        lastPathIndex,
        previousState.pathIndex + PATH_FORWARD_LOOKAHEAD
    );

    for (let index = firstCandidateIndex; index <= lastCandidateIndex; index += 1) {
        candidateIndexes.add(index);
    }

    // เมื่อครบหนึ่งรอบ ให้เพิ่ม path ช่วงต้นเข้ามาในพื้นที่ค้นหา
    if (isCompletingLoop) {
        const loopCandidateEnd = Math.min(lastPathIndex, PATH_FORWARD_LOOKAHEAD);
        for (let index = 0; index <= loopCandidateEnd; index += 1) {
            candidateIndexes.add(index);
        }
    }

    let constrainedNearestIndex = previousState.pathIndex;
    let constrainedNearestDistance = Number.POSITIVE_INFINITY;

    candidateIndexes.forEach((index) => {
        const distance = distanceInMeters(carLocation, route.pathPoints[index]);
        if (distance < constrainedNearestDistance) {
            constrainedNearestDistance = distance;
            constrainedNearestIndex = index;
        }
    });

    return constrainedNearestIndex;
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

    // ป้องกันลำดับป้ายย้อนกลับจาก GPS แกว่งหรือการเลือก path ที่อยู่ใกล้กัน
    // ยอมรับเฉพาะลำดับที่เท่าเดิมหรือมากกว่าเดิม
    // ยกเว้นกรณีป้ายสุดท้ายวนกลับไปป้ายแรก เช่น 10 -> 1
    const previousStop = previousState
        ? stops.find((stop) => stop.sequence === previousState.nextStopSequence)
        : undefined;
    const isCompletingStopLoop =
        previousStop?.sequence === stops.length && nextStop.sequence === 1;
    const shouldKeepPreviousStop =
        previousStop !== undefined &&
        nextStop.sequence < previousStop.sequence &&
        !isCompletingStopLoop;
    const resolvedNextStop = shouldKeepPreviousStop ? previousStop : nextStop;

    // บันทึกสถานะไว้ใช้ในการคำนวณ WebSocket ครั้งถัดไป
    const state: LocalStopProgressState = {
        routeId: route.id,
        // ถ้าป้ายใหม่ย้อนกลับ ให้คง pathIndex เดิมไว้ด้วย
        pathIndex: shouldKeepPreviousStop && previousState
            ? previousState.pathIndex
            : nearestPathIndex,
        nextStopSequence: resolvedNextStop.sequence,
    };

    // ส่งข้อมูลป้ายถัดไป ระยะทาง และสถานะล่าสุดกลับให้ HomeScreen
    return {
        nextStopSequence: resolvedNextStop.sequence,
        nextStopName: resolvedNextStop.name,
        distanceToNextStopMeters: distanceInMeters(carLocation, resolvedNextStop),
        state,
    };
};
