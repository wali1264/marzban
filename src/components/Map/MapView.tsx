import React, { useState, useEffect, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { MapContainer, TileLayer, Marker, Polyline, Circle, Polygon, Tooltip, useMapEvents, useMap } from 'react-leaflet';
import L from 'leaflet';
import * as turf from '@turf/turf';
import { Point, Connection, AppMode, Parcel } from '../../types';
import { MapPin, Navigation, Target, Users } from 'lucide-react';

// Fix for default marker icons in Leaflet with React
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';

let DefaultIcon = L.icon({
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
});
L.Marker.prototype.options.icon = DefaultIcon;

interface MapViewProps {
  points: Point[];
  connections: Connection[];
  mode: AppMode;
  onPointClick: (point: Point) => void;
  onMapClick: (lat: number, lng: number) => void;
  onConnectionClick: (connectionId: string) => void;
  onConnectionLongPress?: (connectionId: string) => void;
  onPolygonClick?: (points: Point[]) => void;
  onDivisionClick?: (parcelId: string, divisionId: string) => void;
  onDivisionLongPress?: (parcelId: string, divisionId: string) => void;
  userLocation?: { lat: number; lng: number; accuracy: number };
  showUserLocation: boolean;
  selectedPointId: string | null;
  trackingTargetId?: string | null;
  centerTrigger?: number;
  parcelCenterTrigger?: number;
  parcels?: Parcel[];
  generationFilter?: number;
  highlightedParcelId?: string | null;
}

// Find all simple cycles in the graph of connections
// For planar graphs, we want the "minimal" cycles (faces)
function findCycles(points: Point[], connections: Connection[]): Point[][] {
  const adj = new Map<string, string[]>();
  connections.forEach(c => {
    if (!adj.has(c.fromId)) adj.set(c.fromId, []);
    if (!adj.has(c.toId)) adj.set(c.toId, []);
    adj.get(c.fromId)!.push(c.toId);
    adj.get(c.toId)!.push(c.fromId);
  });

  const cycles: string[][] = [];
  const pointIds = Array.from(adj.keys());

  // To find all minimal cycles, we can start a DFS from every node
  // and limit the search depth or use a more exhaustive approach
  const findFromNode = (startNode: string) => {
    const stack: { u: string; p: string; path: string[] }[] = [{ u: startNode, p: '', path: [] }];
    
    while (stack.length > 0) {
      const { u, p, path } = stack.pop()!;
      
      if (path.includes(u)) {
        const cycle = path.slice(path.indexOf(u));
        if (cycle.length >= 3) {
          const sortedCycle = [...cycle].sort().join(',');
          if (!cycles.some(c => [...c].sort().join(',') === sortedCycle)) {
            cycles.push(cycle);
          }
        }
        continue;
      }

      if (path.length > 50) continue; // Limit depth to prevent infinite loops/performance issues

      const neighbors = adj.get(u) || [];
      for (const v of neighbors) {
        if (v === p) continue;
        stack.push({ u: v, p: u, path: [...path, u] });
      }
    }
  };

  pointIds.forEach(id => findFromNode(id));

  // Return all discovered cycles
  return cycles.map(cycleIds => 
    cycleIds.map(id => points.find(p => p.id === id)!).filter(Boolean)
  );
}

// Precise area calculation in square meters
function calculatePolygonArea(nodes: Point[]): number {
  if (nodes.length < 3) return 0;
  
  const radius = 6378137; // Earth radius
  let area = 0;
  
  for (let i = 0; i < nodes.length; i++) {
    const p1 = nodes[i];
    const p2 = nodes[(i + 1) % nodes.length];
    
    const lat1 = p1.lat * Math.PI / 180;
    const lon1 = p1.lng * Math.PI / 180;
    const lat2 = p2.lat * Math.PI / 180;
    const lon2 = p2.lng * Math.PI / 180;
    
    area += (lon2 - lon1) * (2 + Math.sin(lat1) + Math.sin(lat2));
  }
  
  return Math.abs(area * radius * radius / 2.0);
}

// Calculate geometric center of points
function getCentroid(nodes: Point[]): [number, number] {
  const lat = nodes.reduce((sum, p) => sum + p.lat, 0) / nodes.length;
  const lng = nodes.reduce((sum, p) => sum + p.lng, 0) / nodes.length;
  return [lat, lng];
}

interface MapControllerProps {
  centerOn?: { lat: number; lng: number };
  points: Point[];
  highlightedParcelCenter?: { lat: number; lng: number };
  highlightedParcelId?: string | null;
  centerTrigger?: number;
  parcelCenterTrigger?: number;
}

function MapController({ 
  centerOn, 
  points,
  highlightedParcelCenter,
  highlightedParcelId,
  centerTrigger,
  parcelCenterTrigger
}: MapControllerProps) {
  const map = useMap();
  const [hasInitialFit, setHasInitialFit] = useState(false);
  const lastTrigger = useRef<number>(0);
  const lastParcelTrigger = useRef<number>(0);

  // Initial fit to points - only once
  useEffect(() => {
    if (!hasInitialFit && points.length > 0) {
      const bounds = L.latLngBounds(points.map(p => [p.lat, p.lng]));
      map.fitBounds(bounds, { padding: [50, 50] });
      setHasInitialFit(true);
    }
  }, [points, map, hasInitialFit]);

  // Manual center on user or highlighted parcel
  useEffect(() => {
    // If we have a highlighted parcel and it's a new trigger or new ID
    if (highlightedParcelId && highlightedParcelCenter && parcelCenterTrigger !== lastParcelTrigger.current) {
      map.setView([highlightedParcelCenter.lat, highlightedParcelCenter.lng], 18);
      lastParcelTrigger.current = parcelCenterTrigger || 0;
    } else if (centerOn && centerTrigger !== lastTrigger.current) {
      // Manual center trigger (e.g. user location button)
      map.setView([centerOn.lat, centerOn.lng], map.getZoom() > 18 ? map.getZoom() : 18);
      lastTrigger.current = centerTrigger || 0;
    }
  }, [centerOn, highlightedParcelCenter, highlightedParcelId, map, centerTrigger, parcelCenterTrigger]);

  return null;
}

function MapEvents({ onMapClick, onZoomEnd }: { onMapClick: (lat: number, lng: number) => void, onZoomEnd: (zoom: number) => void }) {
  useMapEvents({
    click(e) {
      onMapClick(e.latlng.lat, e.latlng.lng);
    },
    zoomend(e) {
      onZoomEnd(e.target.getZoom());
    }
  });
  return null;
}

export default function MapView({ 
  points, 
  connections, 
  mode, 
  onPointClick, 
  onMapClick,
  onConnectionClick,
  onConnectionLongPress,
  onPolygonClick,
  onDivisionClick,
  onDivisionLongPress,
  userLocation,
  showUserLocation,
  selectedPointId,
  trackingTargetId,
  centerTrigger,
  parcelCenterTrigger,
  parcels = [],
  generationFilter = 1,
  highlightedParcelId = null
}: MapViewProps) {
  
  const cycles = useMemo(() => findCycles(points, connections), [points, connections]);
  const [zoom, setZoom] = useState(13);

  const trackingTarget = useMemo(() => 
    trackingTargetId ? points.find(p => p.id === trackingTargetId) : null
  , [trackingTargetId, points]);

  const trackingDistance = useMemo(() => {
    if (userLocation && trackingTarget) {
      const from = turf.point([userLocation.lng, userLocation.lat]);
      const to = turf.point([trackingTarget.lng, trackingTarget.lat]);
      return turf.distance(from, to, { units: 'meters' });
    }
    return null;
  }, [userLocation, trackingTarget]);

  const longPressTimer = React.useRef<NodeJS.Timeout | null>(null);

  // Calculate generations for each cycle/parcel
  const cyclesWithGen = useMemo(() => {
    const polys = cycles.map(cycle => {
      if (cycle.length < 3) return null;
      try {
        const coords = [...cycle.map(p => [p.lng, p.lat]), [cycle[0].lng, cycle[0].lat]];
        return { 
          cycle, 
          poly: turf.polygon([coords as any]),
          connectionIds: new Set<string>()
        };
      } catch (e) {
        console.error("Error creating polygon for cycle:", e);
        return null;
      }
    }).filter((p): p is NonNullable<typeof p> => p !== null);

    // Map connections to their IDs for easy lookup
    polys.forEach(item => {
      for (let i = 0; i < item.cycle.length; i++) {
        const p1 = item.cycle[i];
        const p2 = item.cycle[(i + 1) % item.cycle.length];
        const conn = connections.find(c => 
          (c.fromId === p1.id && c.toId === p2.id) || 
          (c.fromId === p2.id && c.toId === p1.id)
        );
        if (conn) item.connectionIds.add(conn.id);
      }
    });

    return polys.map(item => {
      const parcelId = item.cycle.map(p => p.id).sort().join(',');
      const existingParcel = parcels.find(p => p.pointIds.sort().join(',') === parcelId);
      
      let gen = existingParcel?.generation;
      
      if (!gen) {
        // Count how many other polygons contain this one
        let containers = 0;
        for (const other of polys) {
          if (item === other) continue;
          // Use a small buffer to handle shared edges
          try {
            if (turf.booleanContains(other.poly, item.poly)) {
              containers++;
            }
          } catch (e) {
            // Turf might fail on some complex geometries
          }
        }
        gen = containers + 1;
      }
      
      return { ...item, gen, layerId: `layer-gen-${gen}` };
    });
  }, [cycles, connections, parcels]);

  const visibleConnectionIds = useMemo(() => {
    const ids = new Set<string>();
    cyclesWithGen.forEach(item => {
      if (item.gen === generationFilter) {
        item.connectionIds.forEach(id => ids.add(id));
      }
    });
    return ids;
  }, [cyclesWithGen, generationFilter]);

  const handleLongPressStart = (callback?: () => void) => {
    if (!callback) return;
    longPressTimer.current = setTimeout(() => {
      callback();
      longPressTimer.current = null;
    }, 500);
  };

  const handleLongPressEnd = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  const renderConnections = () => {
    return connections.map(conn => {
      // Filter connections based on generation
      if (!visibleConnectionIds.has(conn.id) && mode !== 'CONNECT') return null;

      const from = points.find(p => p.id === conn.fromId);
      const to = points.find(p => p.id === conn.toId);
      if (from && to) {
        return (
          <Polyline 
            key={conn.id} 
            positions={[[from.lat, from.lng], [to.lat, to.lng]]} 
            color={mode === 'CONNECT' ? "#10b981" : generationFilter === 1 ? '#10b981' : generationFilter === 2 ? '#6366f1' : '#f59e0b'} 
            weight={6}
            opacity={0.6}
            eventHandlers={{
              click: (e) => {
                L.DomEvent.stopPropagation(e);
                onConnectionClick(conn.id);
              },
              mousedown: () => handleLongPressStart(() => onConnectionLongPress?.(conn.id)),
              mouseup: handleLongPressEnd,
              touchstart: () => handleLongPressStart(() => onConnectionLongPress?.(conn.id)),
              touchend: handleLongPressEnd,
              contextmenu: (e) => {
                L.DomEvent.stopPropagation(e);
                onConnectionLongPress?.(conn.id);
              }
            }}
          />
        );
      }
      return null;
    });
  };

  const transparentIcon = useMemo(() => L.divIcon({
    className: 'bg-transparent',
    html: '',
    iconSize: [0, 0],
    iconAnchor: [0, 0]
  }), []);

  const renderPolygons = () => {
    return cyclesWithGen.map((item, idx) => {
      const { cycle, gen, poly } = item;
      
      // Strict generation filtering
      if (gen !== generationFilter) return null;

      const area = calculatePolygonArea(cycle);
      
      const parcelId = cycle.map(p => p.id).sort().join(',');
      const parcel = parcels.find(p => p.pointIds.sort().join(',') === parcelId);

      // Visibility logic based on zoom
      const isVisible = zoom > 15;
      const scale = Math.max(0.5, Math.min(1, (zoom - 14) / 4));

      // If a parcel is highlighted, only show its details
      const shouldShowDetails = !highlightedParcelId || highlightedParcelId === parcel?.id;
      
      // Calculate centroid for precise positioning
      const centroid = turf.centroid(poly);
      const [centerLng, centerLat] = centroid.geometry.coordinates;

      // Zoom-based scaling for owner name
      const baseFontSize = Math.max(16, Math.sqrt(area) / 3);
      const zoomScale = Math.pow(1.15, zoom - 18);
      const finalFontSize = baseFontSize * zoomScale;
      const ownerOpacity = Math.min(0.25, Math.max(0, (zoom - 15) * 0.08));

      const isHighlighted = highlightedParcelId === parcel?.id;

      return (
        <React.Fragment key={`cycle-group-${idx}`}>
          <Polygon 
            positions={cycle.map(p => [p.lat, p.lng])}
            pathOptions={{
              color: isHighlighted ? '#f59e0b' : (gen === 1 ? '#10b981' : gen === 2 ? '#6366f1' : '#f59e0b'),
              fillColor: isHighlighted ? '#f59e0b' : (gen === 1 ? '#10b981' : gen === 2 ? '#6366f1' : '#f59e0b'),
              fillOpacity: isHighlighted ? 0.3 : 0.1,
              weight: isHighlighted ? 4 : 2,
              dashArray: isHighlighted ? '10, 10' : undefined
            }}
            eventHandlers={{
              click: (e) => {
                if ((mode === 'DIVIDE' || mode === 'MANAGE' || mode === 'ROTATE') && onPolygonClick) {
                  L.DomEvent.stopPropagation(e);
                  onPolygonClick(cycle);
                }
              }
            }}
          />

          {/* Centered Marker for Tooltips (Area Card & Owner Name) */}
          <Marker 
            position={[centerLat, centerLng]} 
            icon={transparentIcon}
            interactive={false}
          >
            {isVisible && shouldShowDetails && (
              <Tooltip permanent direction="center" className="area-tooltip">
                <div className="relative flex items-center justify-center">
                  {/* Owner Name Watermark */}
                  {parcel?.ownerName && (
                    <div 
                      className="absolute font-black whitespace-nowrap pointer-events-none select-none transition-all duration-500 text-slate-900"
                      style={{ 
                        fontSize: `${finalFontSize}px`,
                        opacity: ownerOpacity,
                        transform: `rotate(-15deg)`,
                        zIndex: 0
                      }}
                    >
                      {parcel.ownerName}
                    </div>
                  )}
                  
                  {/* Area Card */}
                  <div 
                    className="relative z-10 flex flex-col items-center bg-white/90 backdrop-blur-sm px-2 py-1 rounded-lg border border-slate-200 shadow-sm transition-all duration-300 pointer-events-none" 
                    dir="rtl"
                    style={{ transform: `scale(${scale})`, opacity: isVisible ? 1 : 0 }}
                  >
                    <span className="text-[10px] text-slate-500 font-bold">مساحت قطعه</span>
                    <div className="flex items-baseline gap-0.5">
                      <span className="text-sm font-mono font-bold text-slate-700">
                        {(() => {
                          const integerPart = Math.floor(area);
                          const decimalPart = Math.round((area - integerPart) * 100);
                          if (decimalPart === 0) return integerPart.toLocaleString('fa-IR');
                          return `${integerPart.toLocaleString('fa-IR')}/${decimalPart.toLocaleString('fa-IR')}`;
                        })()}
                      </span>
                      <span className="text-[8px] text-slate-600 font-bold">متر مربع</span>
                    </div>
                  </div>
                </div>
              </Tooltip>
            )}
          </Marker>

          {/* Render Divisions if any */}
          {parcels.find(p => {
            const cycleIds = cycle.map(pt => pt.id).sort().join(',');
            const parcelIds = p.pointIds.sort().join(',');
            return cycleIds === parcelIds;
          })?.divisions.map(div => {
            const parcel = parcels.find(p => p.pointIds.sort().join(',') === cycle.map(pt => pt.id).sort().join(','));
            return (
              <Polygon
                key={div.id}
                positions={div.geometry}
                pathOptions={{
                  color: '#0ea5e9',
                  fillColor: '#0ea5e9',
                  fillOpacity: 0.2,
                  weight: 2,
                  dashArray: '5, 5'
                }}
                eventHandlers={{
                  click: (e) => {
                    if (mode === 'CONVERT' && onDivisionClick && parcel) {
                      L.DomEvent.stopPropagation(e);
                      onDivisionClick(parcel.id, div.id);
                    }
                  },
                  mousedown: () => handleLongPressStart(() => parcel && onDivisionLongPress?.(parcel.id, div.id)),
                  mouseup: handleLongPressEnd,
                  touchstart: () => handleLongPressStart(() => parcel && onDivisionLongPress?.(parcel.id, div.id)),
                  touchend: handleLongPressEnd,
                  contextmenu: (e) => {
                    L.DomEvent.stopPropagation(e);
                    parcel && onDivisionLongPress?.(parcel.id, div.id);
                  }
                }}
              >
                 <Tooltip permanent direction="center">
                  <div className="bg-white/80 px-1 rounded text-[8px] font-bold text-blue-700">
                    {div.percentage}%
                  </div>
                </Tooltip>
              </Polygon>
            );
          })}
        </React.Fragment>
      );
    });
  };

  const highlightedParcelCenter = useMemo(() => {
    if (!highlightedParcelId) return null;
    const item = cyclesWithGen.find(c => {
      const parcelId = c.cycle.map(p => p.id).sort().join(',');
      const parcel = parcels?.find(p => p.pointIds.sort().join(',') === parcelId);
      return parcel?.id === highlightedParcelId;
    });
    if (!item) return null;
    const centroid = turf.centroid(item.poly);
    return { lat: centroid.geometry.coordinates[1], lng: centroid.geometry.coordinates[0] };
  }, [highlightedParcelId, cyclesWithGen, parcels]);

  const centerOn = useMemo(() => {
    if (centerTrigger && userLocation) return userLocation;
    return undefined;
  }, [centerTrigger, userLocation]);

  return (
    <div className="relative w-full h-full">
      <MapContainer 
        center={[34.5553, 69.2075]} // Default to Kabul
        zoom={13} 
        maxZoom={22}
        className="w-full h-full"
        zoomControl={false}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          maxZoom={22}
          maxNativeZoom={19}
        />
        
        <MapEvents onMapClick={() => onMapClick(0, 0)} onZoomEnd={setZoom} />
        <MapController 
          centerOn={centerOn} 
          points={points}
          highlightedParcelCenter={highlightedParcelCenter || undefined}
          highlightedParcelId={highlightedParcelId}
          centerTrigger={centerTrigger}
          parcelCenterTrigger={parcelCenterTrigger}
        />
        
        {/* Live User Location - Only shown if toggled ON */}
        {showUserLocation && userLocation && (
          <Marker 
            position={[userLocation.lat, userLocation.lng]}
            icon={L.divIcon({
              className: 'user-location-icon',
              html: `<div class="relative flex items-center justify-center">
                <div class="w-3 h-3 bg-blue-600 rounded-full border-2 border-white shadow-lg"></div>
              </div>`,
              iconSize: [20, 20],
              iconAnchor: [10, 10]
            })}
          />
        )}

        {points.map(point => {
          const isSelected = selectedPointId === point.id;
          return (
            <Marker 
              key={point.id} 
              position={[point.lat, point.lng]}
              eventHandlers={{
                click: (e) => {
                  L.DomEvent.stopPropagation(e);
                  onPointClick(point);
                },
              }}
              icon={L.divIcon({
                className: 'custom-div-icon',
                html: `<div class="relative flex items-center justify-center">
                  <div class="absolute w-8 h-8 bg-emerald-500/20 rounded-full ${isSelected ? 'animate-ping' : ''}"></div>
                  <div class="w-4 h-4 ${isSelected ? 'bg-amber-500' : 'bg-emerald-600'} rounded-full border-2 border-white shadow-lg transition-colors"></div>
                </div>`,
                iconSize: [32, 32],
                iconAnchor: [16, 16]
              })}
            />
          );
        })}

        {renderConnections()}
        {renderPolygons()}

        {/* Tracking Line and Distance */}
        {mode === 'TRACKING' && userLocation && trackingTarget && (
          <>
            <Polyline 
              positions={[
                [userLocation.lat, userLocation.lng],
                [trackingTarget.lat, trackingTarget.lng]
              ]}
              pathOptions={{ color: '#f59e0b', weight: 3, dashArray: '10, 10', opacity: 0.8 }}
            />
          </>
        )}
      </MapContainer>

      {/* Tracking Distance Overlay */}
      <AnimatePresence>
        {mode === 'TRACKING' && trackingDistance !== null && (
          <motion.div
            initial={{ y: 50, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 50, opacity: 0 }}
            className="absolute bottom-24 left-1/2 -translate-x-1/2 z-[2000] bg-white/90 backdrop-blur-md px-6 py-4 rounded-[32px] border border-amber-200 shadow-2xl flex flex-col items-center min-w-[200px]"
          >
            <div className="flex items-center gap-2 mb-1">
              <div className="w-2 h-2 bg-amber-500 rounded-full animate-pulse" />
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">فاصله تا هدف (میخ)</span>
            </div>
            <div className="flex items-baseline gap-1">
              <span className="text-3xl font-black text-slate-900 tabular-nums">
                {(() => {
                  const integerPart = Math.floor(trackingDistance);
                  const decimalPart = Math.round((trackingDistance - integerPart) * 100);
                  if (decimalPart === 0) return integerPart.toLocaleString('fa-IR');
                  return `${integerPart.toLocaleString('fa-IR')}/${decimalPart.toLocaleString('fa-IR')}`;
                })()}
              </span>
              <span className="text-xs font-bold text-slate-600">متر</span>
            </div>
            <p className="text-[9px] text-slate-400 mt-2 font-medium">برای دقت بیشتر، به آرامی حرکت کنید</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
