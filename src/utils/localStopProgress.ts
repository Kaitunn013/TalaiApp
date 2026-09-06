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
    nextStopPathIndex: number;
};

// ผลลัพธ์ที่ส่งกลับไปให้หน้าจอ เช่น ลำดับและชื่อป้ายถัดไป
export type LocalNextStopResult = {
    nextStopSequence: number;
    nextStopName: string;
    nextStopPathIndex: number;
    distanceToNextStopMeters: number;
    state: LocalStopProgressState;
};

export type LocalRouteStopOccurrence = {
    sequence: number;
    name: string;
    lat: number;
    lng: number;
    pathIndex: number;
    timeToNextSecs: number | null;
    occurrenceIndex: number;
};

const getStopIdentityKey = (
    name: string,
    lat: number,
    lng: number,
) => {
    const normalizedName = name
        .replace(/\s*(?:ขาไป|ขากลับ)\s*$/i, '')
        .trim()
        .toLowerCase();

    return normalizedName || `${lat.toFixed(6)},${lng.toFixed(6)}`;
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

// ดึง occurrence ของป้ายตามลำดับ pathPoints จริง
// ป้ายเดิมที่ถูกผ่านซ้ำระหว่างขากลับจะใช้เลขป้ายเดิม แต่มี pathIndex คนละตัว
export const getRouteStopOccurrences = (route: Route): LocalRouteStopOccurrence[] => {
    const sequenceByStopKey = new Map<string, number>();
    const occurrences: LocalRouteStopOccurrence[] = [];
    const firstNamedPointIndex = route.pathPoints.findIndex((point) => Boolean(point.name?.trim()));
    const firstNamedPoint = route.pathPoints[firstNamedPointIndex];
    const firstStopCoordinate = firstNamedPoint
        ? `${firstNamedPoint.lat.toFixed(6)},${firstNamedPoint.lng.toFixed(6)}`
        : null;
    const firstStopKey = firstNamedPoint?.name?.trim()
        ? getStopIdentityKey(firstNamedPoint.name.trim(), firstNamedPoint.lat, firstNamedPoint.lng)
        : null;
    let previousCoordinate: string | null = null;

    route.pathPoints.forEach((point, pathIndex) => {
        const name = point.name?.trim();
        if (!name) return;

        const coordinateKey = `${point.lat.toFixed(6)},${point.lng.toFixed(6)}`;
        const stopKey = getStopIdentityKey(name, point.lat, point.lng);

        // ไม่สร้าง occurrence ซ้ำสำหรับปลายทางที่ใช้พิกัดเดียวกับต้นทาง
        if (
            pathIndex > firstNamedPointIndex &&
            ((firstStopCoordinate !== null && coordinateKey === firstStopCoordinate) ||
                (firstStopKey !== null && stopKey === firstStopKey))
        ) {
            return;
        }

        // ป้องกันข้อมูลป้ายเดิมซ้ำติดกันใน pathPoints
        if (coordinateKey === previousCoordinate) return;
        previousCoordinate = coordinateKey;

        let sequence = sequenceByStopKey.get(stopKey);
        if (sequence === undefined) {
            sequence = sequenceByStopKey.size + 1;
            sequenceByStopKey.set(stopKey, sequence);
        }

        occurrences.push({
            sequence,
            name,
            lat: point.lat,
            lng: point.lng,
            pathIndex,
            timeToNextSecs: point.timeToNextSecs ?? null,
            occurrenceIndex: occurrences.length,
        });
    });

    return occurrences;
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
    // เตรียมรายการ occurrence ของป้ายตามลำดับเส้นทางจริง
    const stopOccurrences = getRouteStopOccurrences(route);

    // หาตำแหน่ง path point ที่ใกล้รถที่สุด โดยใช้สถานะก่อนหน้าช่วยกันการย้อนกลับ
    const nearestPathIndex = findNearestPathIndex(route, carLocation, previousState);

    // ถ้าไม่มีป้ายหรือไม่มีตำแหน่งบนเส้นทาง ให้จบการคำนวณ
    if (stopOccurrences.length === 0 || nearestPathIndex === null) return null;

    // เลือกป้ายแรกที่อยู่หลังตำแหน่งปัจจุบันบนเส้นทาง
    const firstCandidateIndex = stopOccurrences.findIndex(
        (stop) => stop.pathIndex > nearestPathIndex
    );
    const candidateIndex = firstCandidateIndex >= 0 ? firstCandidateIndex : 0;
    const candidateStop = stopOccurrences[candidateIndex];

    // คำนวณระยะจากรถถึงป้ายที่คาดว่าเป็นป้ายถัดไป
    const distanceToCandidate = distanceInMeters(carLocation, candidateStop);

    // ถ้ารถเข้าใกล้ป้ายไม่เกิน 35 เมตร ให้ถือว่าผ่านป้ายนั้นแล้ว
    // แล้วเลื่อนไปยังป้ายถัดไป
    const nextStopIndex =
        distanceToCandidate <= STOP_ARRIVAL_RADIUS_METERS
            ? (candidateIndex + 1) % stopOccurrences.length
            : candidateIndex;
    const nextStop = stopOccurrences[nextStopIndex];

    // บันทึกสถานะไว้ใช้ในการคำนวณ WebSocket ครั้งถัดไป
    const state: LocalStopProgressState = {
        routeId: route.id,
        // ใช้ pathIndex เป็นตัวตัดสินความคืบหน้า ไม่ใช้เลขป้ายเพียงอย่างเดียว
        pathIndex: nearestPathIndex,
        nextStopSequence: nextStop.sequence,
        nextStopPathIndex: nextStop.pathIndex,
    };

    // ส่งข้อมูลป้ายถัดไป ระยะทาง และสถานะล่าสุดกลับให้ HomeScreen
    return {
        nextStopSequence: nextStop.sequence,
        nextStopName: nextStop.name,
        nextStopPathIndex: nextStop.pathIndex,
        distanceToNextStopMeters: distanceInMeters(carLocation, nextStop),
        state,
    };
};
