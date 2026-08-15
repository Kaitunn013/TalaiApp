import { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Dimensions,
  PanResponder,
  ScrollView,
} from 'react-native';

const SCREEN_HEIGHT = Dimensions.get('window').height;
const SHEET_HEIGHT = SCREEN_HEIGHT * 0.5;
const HEADER_VISIBLE_HEIGHT = 100;
const EXPANDED_TRANSLATE_Y = 0;
const COLLAPSED_TRANSLATE_Y = SHEET_HEIGHT - HEADER_VISIBLE_HEIGHT;

const clampTranslateY = (value: number) =>
  Math.max(EXPANDED_TRANSLATE_Y, Math.min(COLLAPSED_TRANSLATE_Y, value));

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

type LiveCar = {
  carId: string;
  lat: number;
  lng: number;
  status: string;
  eta: unknown;
};

const isParkingStopName = (name: string) => {
  const n = name.trim().toLowerCase();
  return n.includes('park') || n.includes('จอด') || n.includes('parking') || n.includes('ศร.2');
};

export default function RoutesBottomSheet({
  routes,
  liveCars,
  onSelectRoute,
  selectedRouteId,
  selectedCarId,
  onSelectCar,
  onSelectStop,
  onOpen,
}: {
  routes: Route[];
  liveCars: LiveCar[];
  onSelectRoute: (route: Route) => void;
  selectedRouteId: string | null;
  selectedCarId?: string | null;
  onSelectCar?: (carId: string | null) => void;
  onSelectStop?: (stop: { lat: number; lng: number; name?: string | null }) => void;
  onOpen?: () => void;
}) {
  const translateY = useRef(new Animated.Value(EXPANDED_TRANSLATE_Y)).current;
  const lastTranslateY = useRef(EXPANDED_TRANSLATE_Y);
  const CARD_WIDTH = Math.round(Dimensions.get('window').width * 0.44);

  useEffect(() => {
    translateY.setValue(EXPANDED_TRANSLATE_Y);
    lastTranslateY.current = EXPANDED_TRANSLATE_Y;
  }, []);

  const animateToPosition = (toValue: number) => {
    Animated.spring(translateY, {
      toValue,
      tension: 80,
      friction: 12,
      useNativeDriver: false,
    }).start();

    lastTranslateY.current = toValue;
    if (toValue === EXPANDED_TRANSLATE_Y) {
      try {
        onOpen?.();
      } catch (e) {
        // ignore
      }
    }
  };

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gestureState) =>
        Math.abs(gestureState.dy) > Math.abs(gestureState.dx),

      onPanResponderMove: (_, gestureState) => {
        const newTranslateY = clampTranslateY(
          lastTranslateY.current + gestureState.dy
        );

        translateY.setValue(newTranslateY);
      },

      onPanResponderRelease: (_, gestureState) => {
        const newTranslateY = clampTranslateY(
          lastTranslateY.current + gestureState.dy
        );
        const shouldExpand =
          newTranslateY < COLLAPSED_TRANSLATE_Y / 2 || gestureState.vy < -0.5;
        const targetPosition = shouldExpand
          ? EXPANDED_TRANSLATE_Y
          : COLLAPSED_TRANSLATE_Y;

        animateToPosition(targetPosition);
      },
    })
  ).current;

  return (
    <Animated.View
      style={[
        styles.container,
        {
          transform: [{
            translateY: translateY.interpolate({
              inputRange: [EXPANDED_TRANSLATE_Y, COLLAPSED_TRANSLATE_Y],
              outputRange: [EXPANDED_TRANSLATE_Y, COLLAPSED_TRANSLATE_Y],
              extrapolate: 'clamp',
            })
          }]
        },
      ]}
    >
      <View {...panResponder.panHandlers} style={styles.handleContainer}>
        <View style={styles.handle} />
        <Text style={styles.header}>สายรถตะลัย</Text>
        <Text style={styles.subHeader}>ลากขึ้นเพื่อดูจุดจอดทั้งหมด</Text>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        scrollEnabled={true}
        style={styles.scrollView}
      >
        <View style={{ paddingVertical: 15 }}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.horizontalList}
          >
            {
              (() => {
                const arr = [...routes];
                const idxTest = arr.findIndex((r) => (r.name || '').trim().toLowerCase() === 'test');
                const idxHo = arr.findIndex((r) => (r.name || '').trim() === 'สายหอใน');

                if (idxTest !== -1 && idxHo !== -1 && idxTest !== idxHo) {
                  const [hoRoute] = arr.splice(idxHo, 1);
                  const insertIndex = idxHo < idxTest ? idxTest : idxTest;
                  arr.splice(insertIndex, 0, hoRoute);
                }

                // Separate TEST routes to optionally show them at the end
                const testRoutes = arr.filter((r) => (r.name || '').trim().toLowerCase() === 'test');
                let display = arr.filter((r) => (r.name || '').trim().toLowerCase() !== 'test');

                const order = ['สายหน้ามอ', 'สายหอใน'];
                display.sort((a, b) => {
                  const nameA = (a.name || '').trim();
                  const nameB = (b.name || '').trim();
                  const indexA = order.indexOf(nameA);
                  const indexB = order.indexOf(nameB);
                  if (indexA !== -1 && indexB !== -1) {
                    return indexA - indexB;
                  }
                  if (indexA !== -1) return -1;
                  if (indexB !== -1) return 1;
                  return 0;
                });

                // Always insert TEST routes after 'สายหอใน' if present, otherwise append to end
                if (testRoutes.length > 0) {
                  const idxHoDisplay = display.findIndex((r) => (r.name || '').trim() === 'สายหอใน');
                  if (idxHoDisplay !== -1) {
                    display.splice(idxHoDisplay + 1, 0, ...testRoutes);
                  } else {
                    display = display.concat(testRoutes);
                  }
                }

                return display.map((route) => {
                  const isActive = selectedRouteId === route.id;

                  return (
                    <TouchableOpacity
                      key={route.id}
                      style={[styles.cardHorizontal, { width: CARD_WIDTH }, isActive && styles.activeCard]}
                      onPress={() => onSelectRoute(route)}
                      activeOpacity={0.7}
                    >
                      <Text
                        style={[styles.cardText, isActive && styles.activeText]}
                        numberOfLines={1}
                      >
                        {route.name}
                      </Text>
                    </TouchableOpacity>
                  );
                });
              })()
            }
          </ScrollView>
        </View>

        {(() => {
          const selectedRoute = routes.find((r) => r.id === selectedRouteId);
          const stopPoints = selectedRoute
            ? (() => {
              const pathPoints = selectedRoute.pathPoints || [];
              const seenCoords = new Set<string>();
              const stops: {
                sequence: number;
                sortSequence: number;
                name: string;
                isParking: boolean;
                lat: number;
                lng: number;
              }[] = [];

              pathPoints.forEach((point) => {
                // `sequence` exists on every route point. Only named points
                // are actual stops, matching the markers shown on the map.
                const pointName = point.name?.trim();
                if (!pointName) {
                  return;
                }
                const coordKey = `${point.lat.toFixed(6)},${point.lng.toFixed(6)}`;
                if (seenCoords.has(coordKey)) {
                  return;
                }
                seenCoords.add(coordKey);

                const sortSequence = point.routestop_sequence ?? Number.MAX_SAFE_INTEGER;
                const name = point.name || 'ไม่มีชื่อจุดจอด';
                stops.push({
                  sequence: 0,
                  sortSequence,
                  name,
                  isParking: isParkingStopName(name),
                  lat: point.lat,
                  lng: point.lng,
                });
              });

              return stops
                .sort((a, b) => a.sortSequence - b.sortSequence)
                .map((stop, index) => ({ ...stop, sequence: index + 1 }));
            })()
            : [];

          if (stopPoints.length === 0) return null;

          return (
            <View style={styles.stopsContainer}>
              <View style={styles.stopsHeaderRow}>
                <Text style={styles.stopsTitle} numberOfLines={1} ellipsizeMode="tail">
                  จุดจอดรถ · {selectedRoute?.name}
                </Text>
                {liveCars.length > 1 && onSelectCar ? (
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.carButtonsRow}
                    style={styles.carButtonsScroll}
                  >
                    {liveCars.map((car, index) => {
                      const isActive = selectedCarId === car.carId;
                      return (
                        <TouchableOpacity
                          key={`car-${car.carId}-${index}`}
                          style={[
                            styles.carChip,
                            isActive && styles.carChipActive,
                          ]}
                          onPress={() => onSelectCar(car.carId)}
                          activeOpacity={0.7}
                        >
                          <Text style={[styles.carChipText, isActive && styles.activeText]}>
                            {`รถ ${index + 1}`}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                ) : null}
              </View>
              <View style={styles.stopsListWrapper}>
                <View style={styles.timelineLine} />
                {stopPoints.map((stop, idx) => {
                  const isFirst = idx === 0;
                  const isLast = idx === stopPoints.length - 1;
                  return (
                    <TouchableOpacity
                      key={`${stop.sequence}-${idx}`}
                      style={styles.stopItem}
                      onPress={() => onSelectStop?.({ lat: stop.lat, lng: stop.lng, name: stop.name })}
                      activeOpacity={0.7}
                    >
                      <View style={styles.stopNumberCircle}>
                        <Text style={styles.stopNumberText}>{stop.sequence}</Text>
                      </View>
                      <View style={styles.stopTextGroup}>
                        <Text style={styles.stopNameText}>{stop.name}</Text>
                        {stop.isParking ? (
                          <Text style={styles.stopTag}>จุดจอดรถ</Text>
                        ) : isFirst ? (
                          <Text style={styles.stopTag}>ป้ายต้นทาง</Text>
                        ) : isLast ? (
                          <Text style={styles.stopTag}>ป้ายปลายทาง</Text>
                        ) : null}
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          );
        })()}
      </ScrollView>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: SHEET_HEIGHT,
    backgroundColor: 'white',
    borderTopLeftRadius: 25,
    borderTopRightRadius: 25,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 5,
    elevation: 10,
  },
  handleContainer: {
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  handle: {
    width: 50,
    height: 5,
    backgroundColor: '#ccc',
    borderRadius: 10,
    marginBottom: 8,
  },
  header: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#000',
  },
  subHeader: {
    fontSize: 12,
    color: '#9ca3af',
    marginTop: 2,
  },

  scrollView: {
    flex: 1,
    paddingHorizontal: 15,
  },
  horizontalList: {
    paddingHorizontal: 12,
    alignItems: 'stretch',
  },
  stopsHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  stopsTitle: {
    marginRight: 8,
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
  },
  carButtonsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    flexGrow: 1,
  },
  cardHorizontal: {
    height: 64,
    borderWidth: 1.5,
    borderColor: '#e5e7eb',
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 14,
    marginRight: 10,
    backgroundColor: '#fafafa',
  },
  activeCard: {
    backgroundColor: '#006a4e',
    borderColor: '#006a4e',
    shadowColor: '#006a4e',
    shadowOpacity: 0.3,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  cardText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#111827',
    textAlign: 'center',
  },
  activeText: {
    color: '#fff',
  },
  carChip: {
    alignItems: 'center',
    justifyContent: 'center',
    height: 32,
    paddingHorizontal: 12,
    borderWidth: 1.2,
    borderColor: '#e5e7eb',
    borderRadius: 16,
    marginRight: 8,
    backgroundColor: '#fafafa',
  },
  carChipActive: {
    backgroundColor: '#006a4e',
    borderColor: '#006a4e',
  },
  carChipText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#111827',
  },
  carButtonsScroll: {
    flex: 1,
    paddingVertical: 2,
  },
  stopsContainer: {
    paddingHorizontal: 15,
    paddingTop: 10,
    paddingBottom: 25,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
    marginTop: 0,
  },
  stopItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 0.5,
    borderBottomColor: '#f5f5f5',
  },
  stopNumberCircle: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#006a4e',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  stopNumberText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  stopTextGroup: {
    flex: 1,
  },
  stopNameText: {
    fontSize: 15,
    color: '#333',
    fontWeight: '500',
  },
  stopTag: {
    fontSize: 11,
    color: '#9ca3af',
    marginTop: 2,
    fontWeight: '600',
  },
  stopsListWrapper: {
    position: 'relative',
  },
  timelineLine: {
    position: 'absolute',
    left: 12,
    top: 12,
    bottom: 20,
    width: 2,
    backgroundColor: '#006a4e',
    opacity: 0.25,
  },
});
