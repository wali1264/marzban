import React, { useState, useEffect, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { MapContainer, TileLayer, Marker, Polyline, Circle, Polygon, Tooltip, useMapEvents, useMap } from 'react-leaflet';
import L from 'leaflet';
import * as turf from '@turf/turf';
import { Point, Connection, AppMode, Parcel } from '../../types';
import { cn, findCycles, calculatePolygonArea } from '../../utils';
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
  centerTrigger?: number; // Used to trigger centering
  parcels?: Parcel[];
  generationFilter?: number;
  highlightedParcelId?: string | null;
  onAngleChange?: (parcelId: string, angle: number) => void;
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
}

function MapController({ 
  centerOn, 
  points,
  highlightedParcelCenter,
  highlightedParcelId,
  centerTrigger
}: MapControllerProps) {
  const map = useMap();
  const [hasInitialFit, setHasInitialFit] = useState(false);
  const lastTrigger = useRef<number>(0);

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
    if (highlightedParcelId && highlightedParcelCenter) {
      map.setView([highlightedParcelCenter.lat, highlightedParcelCenter.lng], 18);
      lastTrigger.current = centerTrigger || 0;
    } else if (centerOn) {
      // Manual center trigger (e.g. user location button)
      map.setView([centerOn.lat, centerOn.lng], map.getZoom() > 18 ? map.getZoom() : 18);
    }
  }, [centerOn, highlightedParcelCenter, highlightedParcelId, map, centerTrigger]);

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

function getMultiCentroid(geometries: [number, number][][]): [number, number] {
  if (geometries.length === 0) return [0, 0];
  if (geometries.length === 1) return getCentroid(geometries[0].map(([lat, lng]) => ({ lat, lng } as Point)));
  
  // For multi-polygons, use turf to find the centroid of the collection
  const features = geometries.map(g => turf.polygon([[...g.map(c => [c[1], c[0]]), [g[0][1], g[0][0]]]]));
  const collection = turf.featureCollection(features);
  const centroid = turf.centroid(collection);
  return [centroid.geometry.coordinates[1], centroid.geometry.coordinates[0]];
}

interface RotationLineProps {
  center: { lat: number; lng: number };
  angle: number;
  onAngleChange: (angle: number) => void;
}

function RotationLine({ center, angle, onAngleChange }: RotationLineProps) {
  // Calculate endpoints based on angle
  // We'll use a fixed distance for the guide line, e.g., 30 meters
  const radius = 30; 
  
  const p1 = useMemo(() => {
    const dest = turf.destination(
      turf.point([center.lng, center.lat]),
      radius,
      angle,
      { units: 'meters' }
    );
    return [dest.geometry.coordinates[1], dest.geometry.coordinates[0]] as [number, number];
  }, [center.lat, center.lng, angle]);

  const p2 = useMemo(() => {
    const dest = turf.destination(
      turf.point([center.lng, center.lat]),
      radius,
      angle + 180,
      { units: 'meters' }
    );
    return [dest.geometry.coordinates[1], dest.geometry.coordinates[0]] as [number, number];
  }, [center.lat, center.lng, angle]);

  return (
    <>
      <Polyline 
        positions={[p1, p2]}
        pathOptions={{ color: '#f59e0b', weight: 4, dashArray: '8, 12', opacity: 0.9 }}
      />
      <Marker
        position={p1}
        draggable={true}
        eventHandlers={{
          drag: (e) => {
            const newPos = e.target.getLatLng();
            const bearing = turf.bearing(
              turf.point([center.lng, center.lat]),
              turf.point([newPos.lng, newPos.lat])
            );
            // bearing is -180 to 180, convert to 0-360
            const normalized = (bearing + 360) % 360;
            onAngleChange(Math.round(normalized * 10) / 10);
          }
        }}
        icon={L.divIcon({
          className: 'rotation-handle',
          html: `<div class="w-8 h-8 bg-amber-500 rounded-full border-4 border-white shadow-2xl flex items-center justify-center cursor-move">
            <div class="w-2 h-2 bg-white rounded-full"></div>
          </div>`,
          iconSize: [32, 32],
          iconAnchor: [16, 16]
        })}
      />
      <Marker
        position={p2}
        draggable={true}
        eventHandlers={{
          drag: (e) => {
            const newPos = e.target.getLatLng();
            const bearing = turf.bearing(
              turf.point([center.lng, center.lat]),
              turf.point([newPos.lng, newPos.lat])
            );
            // For the opposite handle, the angle is bearing + 180
            const normalized = (bearing + 180 + 360) % 360;
            onAngleChange(Math.round(normalized * 10) / 10);
          }
        }}
        icon={L.divIcon({
          className: 'rotation-handle',
          html: `<div class="w-8 h-8 bg-amber-500 rounded-full border-4 border-white shadow-2xl flex items-center justify-center cursor-move">
            <div class="w-2 h-2 bg-white rounded-full"></div>
          </div>`,
          iconSize: [32, 32],
          iconAnchor: [16, 16]
        })}
      />
    </>
  );
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
  parcels = [],
  generationFilter = 1,
  highlightedParcelId = null,
  onAngleChange
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
  const parcelMap = useMemo(() => {
    const map = new Map<string, Parcel>();
    parcels.forEach(p => {
      const id = [...p.pointIds].sort().join(',');
      map.set(id, p);
    });
    return map;
  }, [parcels]);

  const cyclesWithGen = useMemo(() => {
    const polys = cycles.map(cycle => {
      const coords = [...cycle.map(p => [p.lng, p.lat]), [cycle[0].lng, cycle[0].lat]];
      const poly = turf.polygon([coords as any]);
      return { 
        cycle, 
        poly,
        area: turf.area(poly),
        connectionIds: new Set<string>()
      };
    });

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
      let existingParcel = parcelMap.get(parcelId);
      
      // Fallback to geometric matching if ID matching fails (e.g. boundary split)
      if (!existingParcel) {
        const coords = [...item.cycle.map(p => [p.lng, p.lat]), [item.cycle[0].lng, item.cycle[0].lat]];
        const itemPoly = turf.polygon([coords as any]);
        const itemArea = turf.area(itemPoly);
        
        existingParcel = parcels.find(p => {
          // Strict area check for identity (1% tolerance)
          const areaDiff = Math.abs(p.area - itemArea);
          if (areaDiff > p.area * 0.01) return false;

          const pPoints = p.pointIds.map(id => points.find(pt => pt.id === id)).filter(Boolean);
          if (pPoints.length < 3) return false;
          const pCoords = [...pPoints.map(pt => [pt!.lng, pt!.lat]), [pPoints[0]!.lng, pPoints[0]!.lat]];
          const pPoly = turf.polygon([pCoords as any]);
          try {
            // Must be topologically equal to be the SAME parcel
            return turf.booleanEqual(itemPoly, pPoly);
          } catch (e) { return false; }
        });
      }
      
      let gen = existingParcel?.generation;
      
      if (!gen) {
        const itemCentroid = turf.centroid(item.poly);
        const itemArea = turf.area(item.poly);
        
        // 1. Check database for parents
        const parentParcels = parcels.filter(p => {
          const pPoints = p.pointIds.map(id => points.find(pt => pt.id === id)).filter(Boolean);
          if (pPoints.length < 3) return false;
          const pCoords = [...pPoints.map(pt => [pt!.lng, pt!.lat]), [pPoints[0]!.lng, pPoints[0]!.lat]];
          const pPoly = turf.polygon([pCoords as any]);
          try {
            // A parent must be significantly larger than its child
            if (p.area < itemArea * 1.02) return false;
            return turf.booleanPointInPolygon(itemCentroid, pPoly);
          } catch (e) { return false; }
        });

        if (parentParcels.length > 0) {
          const deepestParent = parentParcels.reduce((prev, curr) => 
            (curr.generation || 1) > (prev.generation || 1) ? curr : prev
          );
          gen = (deepestParent.generation || 1) + 1;
        } else {
          // 2. Fallback to geometric nesting in current cycles
          let nesting = 0;
          for (const other of polys) {
            if (item === other) continue;
            if (other.area > itemArea * 1.05) {
              try {
                if (turf.booleanPointInPolygon(itemCentroid, other.poly)) {
                  nesting++;
                }
              } catch (e) {}
            }
          }
          gen = nesting + 1;
        }
      }
      
      // Check if this cycle has children (other cycles significantly smaller contained within it)
      const hasChildren = polys.some(other => {
        if (item === other) return false;
        
        // A child must be significantly smaller than its parent to avoid precision issues
        if (other.area >= item.area * 0.95) return false;

        try {
          const otherCentroid = turf.centroid(other.poly);
          return turf.booleanPointInPolygon(otherCentroid, item.poly);
        } catch (e) {
          return false;
        }
      });
      
      const isParcel = !!existingParcel;
      return { ...item, gen, hasChildren, parcel: existingParcel, isParcel, layerId: `layer-gen-${gen}` };
    });
  }, [cycles, parcels, points, parcelMap]);

  const pointsInCycles = useMemo(() => {
    const set = new Set<string>();
    cyclesWithGen.forEach(item => item.cycle.forEach(p => set.add(p.id)));
    return set;
  }, [cyclesWithGen]);

  const filteredPoints = useMemo(() => {
    const visiblePointIds = new Set<string>();
    
    // 1. Points from visible cycles (active geometric state)
    cyclesWithGen.forEach(item => {
      // In Time Machine mode (genFilter > 0), show current gen AND next gen shares
      const isVisible = generationFilter === 0 
        ? !item.hasChildren 
        : (item.gen === generationFilter || (item.gen === generationFilter + 1 && !item.parcel));
      
      if (isVisible) {
        item.cycle.forEach(p => visiblePointIds.add(p.id));
      }
    });

    // 2. Points from historical parcels in current filter (the "floor")
    if (generationFilter !== 0) {
      parcels.forEach(p => {
        if (p.generation === generationFilter) {
          p.pointIds.forEach(id => visiblePointIds.add(id));
        }
      });
    }

    // 3. Points not in any cycle (always show these for editing/connecting)
    return points.filter(p => visiblePointIds.has(p.id) || !pointsInCycles.has(p.id));
  }, [points, generationFilter, cyclesWithGen, pointsInCycles, parcels]);

  const filteredConnections = useMemo(() => {
    const visibleConnIds = new Set<string>();

    // 1. Connections from visible cycles
    cyclesWithGen.forEach(item => {
      const isVisible = generationFilter === 0 
        ? !item.hasChildren 
        : (item.gen === generationFilter || (item.gen === generationFilter + 1 && !item.parcel));
      
      if (isVisible) {
        item.connectionIds.forEach(id => visibleConnIds.add(id));
      }
    });

    // 2. Connections from historical parcels in current filter
    if (generationFilter !== 0) {
      parcels.forEach(p => {
        if (p.generation === generationFilter) {
          const pPointIds = new Set(p.pointIds);
          connections.forEach(c => {
            if (pPointIds.has(c.fromId) && pPointIds.has(c.toId)) {
              visibleConnIds.add(c.id);
            }
          });
        }
      });
    }

    // 3. Connections not in any cycle - ONLY show if in CONNECT mode
    const connsInCycles = new Set<string>();
    cyclesWithGen.forEach(item => item.connectionIds.forEach(id => connsInCycles.add(id)));

    return connections.filter(c => visibleConnIds.has(c.id) || (mode === 'CONNECT' && !connsInCycles.has(c.id)));
  }, [connections, generationFilter, cyclesWithGen, parcels, mode]);

  const visibleConnectionIds = useMemo(() => {
    const ids = new Set<string>();
    
    // 1. Visible cycles
    cyclesWithGen.forEach(item => {
      const isVisible = generationFilter === 0 
        ? !item.hasChildren 
        : (item.gen === generationFilter || (item.gen === generationFilter + 1 && !item.parcel));
      if (isVisible) {
        item.connectionIds.forEach(id => ids.add(id));
      }
    });

    // 2. Historical parcels
    if (generationFilter !== 0) {
      parcels.forEach(p => {
        if (p.generation === generationFilter) {
          const pPointIds = new Set(p.pointIds);
          connections.forEach(c => {
            if (pPointIds.has(c.fromId) && pPointIds.has(c.toId)) {
              ids.add(c.id);
            }
          });
        }
      });
    }

    return ids;
  }, [cyclesWithGen, generationFilter, parcels, connections]);

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
    return filteredConnections.map(conn => {
      // Filter connections based on generation
      if (!visibleConnectionIds.has(conn.id) && mode !== 'CONNECT') return null;

      const from = filteredPoints.find(p => p.id === conn.fromId);
      const to = filteredPoints.find(p => p.id === conn.toId);
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
    // 1. Unified rendering logic for both historical parcels and active cycles
    // This ensures filters work accurately by treating saved parcels of the current gen as primary
    
    return (
      <React.Fragment>
        {/* Layer 1: Saved Parcels (The "Truth" for each generation) */}
        {parcels
          .filter(p => {
            if (generationFilter === 0) return !parcels.some(child => child.parentId === p.id); // Only leaf nodes in All mode
            return p.generation === generationFilter; // Specific generation in Time Machine
          })
          .map(parcel => {
            const parcelPoints = parcel.pointIds
              .map(id => points.find(pt => pt.id === id))
              .filter((pt): pt is Point => !!pt);
            
            if (parcelPoints.length < 3) return null;

            const poly = turf.polygon([[...parcelPoints.map(p => [p.lng, p.lat]), [parcelPoints[0].lng, parcelPoints[0].lat]]]);
            const area = parcel.area;
            const isHighlighted = highlightedParcelId === parcel.id;
            const isVisible = zoom > 16.5;
            const scale = Math.max(0.6, Math.min(1, (zoom - 16) / 4));
            const shouldShowDetails = !highlightedParcelId || highlightedParcelId === parcel.id;
            const isLargeEnough = area > 5 || isHighlighted;

            const centroid = turf.centroid(poly);
            const [centerLng, centerLat] = centroid.geometry.coordinates;

            return (
              <React.Fragment key={`parcel-${parcel.id}`}>
                <Polygon 
                  positions={parcelPoints.map(p => [p.lat, p.lng])}
                  pathOptions={{
                    color: isHighlighted ? '#f59e0b' : (parcel.generation === 1 ? '#10b981' : parcel.generation === 2 ? '#6366f1' : parcel.generation === 3 ? '#f59e0b' : '#ec4899'),
                    fillColor: isHighlighted ? '#f59e0b' : (parcel.generation === 1 ? '#10b981' : parcel.generation === 2 ? '#6366f1' : parcel.generation === 3 ? '#f59e0b' : '#ec4899'),
                    fillOpacity: isHighlighted ? 0.35 : 0.2,
                    weight: isHighlighted ? 5 : 3.5,
                  }}
                  eventHandlers={{
                    click: (e) => {
                      if ((mode === 'DIVIDE' || mode === 'MANAGE' || mode === 'ROTATE' || mode === 'CONVERT') && onPolygonClick) {
                        L.DomEvent.stopPropagation(e);
                        onPolygonClick(parcelPoints);
                      }
                    }
                  }}
                />
                <Marker position={[centerLat, centerLng]} icon={transparentIcon} interactive={false}>
                  {isVisible && shouldShowDetails && isLargeEnough && (
                    <Tooltip permanent direction="center" className="area-tooltip">
                      <div className="flex flex-col items-center pointer-events-none">
                        {/* Persistent Watermark */}
                        {parcel.ownerName && (
                          <div 
                            className="owner-watermark-text mb-6 opacity-30"
                            style={{ 
                              fontSize: `${Math.max(20, Math.min(72, area / 10))}px`,
                              transform: `rotate(-20deg) scale(${scale})`,
                              color: parcel.generation === 1 ? '#065f46' : parcel.generation === 2 ? '#3730a3' : '#92400e'
                            }}
                          >
                            {parcel.ownerName}
                          </div>
                        )}
                        
                        {/* Professional Area Card */}
                        <div 
                          className="relative z-20 flex flex-col items-center bg-white/98 backdrop-blur-xl px-5 py-4 rounded-[24px] border-2 border-slate-100 shadow-[0_20px_50px_rgba(0,0,0,0.15)] transition-all duration-500 min-w-[140px]" 
                          dir="rtl"
                          style={{ 
                            transform: `scale(${scale})`,
                            boxShadow: isHighlighted ? '0 0 30px rgba(245, 158, 11, 0.4)' : undefined
                          }}
                        >
                          <div className="w-full flex justify-between items-center mb-2 border-b border-slate-50 pb-2">
                            <span className="text-[11px] text-slate-400 font-black uppercase tracking-[0.1em]">مشخصات ثبتی</span>
                            <div className={`flex items-center gap-1 px-2.5 py-1 rounded-full font-black text-[10px] ${
                              parcel.generation === 1 ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' : 
                              parcel.generation === 2 ? 'bg-indigo-50 text-indigo-700 border border-indigo-100' : 
                              'bg-amber-50 text-amber-700 border border-amber-100'
                            }`}>
                              <span className="opacity-60">نسل</span>
                              <span>{parcel.generation || 1}</span>
                            </div>
                          </div>
                          
                          <div className="flex flex-col items-center mb-3">
                            <div className="flex items-baseline gap-1.5">
                              <span className="text-2xl font-mono font-black text-slate-900 tracking-tighter">
                                {(() => {
                                  const formattedArea = area.toFixed(2);
                                  const [int, dec] = formattedArea.split('.');
                                  const persianInt = parseInt(int).toLocaleString('fa-IR');
                                  const persianDec = parseInt(dec).toLocaleString('fa-IR');
                                  if (dec === '00') return persianInt;
                                  const paddedDec = dec.startsWith('0') && dec !== '00' ? `۰${persianDec}` : persianDec;
                                  return `${persianInt}/${paddedDec}`;
                                })()}
                              </span>
                              <span className="text-[12px] text-slate-500 font-black">متر مربع</span>
                            </div>
                          </div>

                          {parcel.ownerName ? (
                            <div className="w-full bg-slate-50/80 rounded-2xl p-3 flex flex-col items-center border border-slate-100">
                              <span className="text-[10px] text-slate-400 font-bold mb-1">نام مالک قطعه</span>
                              <span className="text-[15px] text-slate-900 font-black text-center leading-none drop-shadow-sm">
                                {parcel.ownerName}
                              </span>
                            </div>
                          ) : (
                            <div className="w-full bg-rose-50 rounded-2xl p-2 flex flex-col items-center border border-rose-100">
                              <span className="text-[10px] text-rose-400 font-bold italic">بدون نام مالک</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </Tooltip>
                  )}
                </Marker>
              </React.Fragment>
            );
          })}

        {/* Layer 2: Active Geometric Cycles (Future shares / Unsaved work) */}
        {generationFilter > 0 && mode === 'DIVIDE' && cyclesWithGen
          .filter(item => !item.parcel && item.gen === generationFilter + 1)
          .map((item, idx) => {
            const { cycle, poly } = item;
            const area = calculatePolygonArea(cycle);
            const centroid = turf.centroid(poly);
            const [centerLng, centerLat] = centroid.geometry.coordinates;
            const scale = Math.max(0.6, Math.min(1, (zoom - 16) / 4));

            return (
              <React.Fragment key={`active-cycle-${idx}`}>
                <Polygon 
                  positions={cycle.map(p => [p.lat, p.lng])}
                  pathOptions={{
                    color: '#f59e0b',
                    fillColor: '#f59e0b',
                    fillOpacity: 0.1,
                    weight: 2,
                    dashArray: '5, 5'
                  }}
                />
                <Marker position={[centerLat, centerLng]} icon={transparentIcon} interactive={false}>
                  {zoom > 16.5 && (
                    <Tooltip permanent direction="center" className="area-tooltip">
                      <div 
                        className="bg-amber-50/90 border border-amber-200 px-2 py-1 rounded-lg shadow-md flex flex-col items-center"
                        style={{ transform: `scale(${scale})` }}
                      >
                        <span className="text-[8px] text-amber-600 font-bold">سهم جدید</span>
                        <span className="text-xs font-mono font-bold text-amber-900">
                          {Math.round(area).toLocaleString('fa-IR')} م²
                        </span>
                      </div>
                    </Tooltip>
                  )}
                </Marker>
              </React.Fragment>
            );
          })}

        {/* Layer 3: Divisions (For CONVERT mode or when filtering for next generation) */}
        {parcels
          .filter(p => {
            // If filtering for Gen X, show divisions of Gen X-1
            if (generationFilter > 1) return p.generation === generationFilter - 1;
            // If filtering for Gen 1, divisions don't exist yet (they are Gen 2)
            if (generationFilter === 1) return false;
            // If filtering for all (0), show divisions of active parcels
            return !parcels.some(child => child.parentId === p.id);
          })
          .map(parcel => (
            <React.Fragment key={`divisions-${parcel.id}`}>
              {!parcel.isConverted && parcel.divisions.map(div => {
                const center = getMultiCentroid(div.geometry);
                const divArea = (parcel.area * div.percentage) / 100;
                
                return (
                  <React.Fragment key={div.id}>
                    {div.geometry.map((polyCoords, pIdx) => (
                      <Polygon
                        key={`${div.id}-${pIdx}`}
                        positions={polyCoords}
                        pathOptions={{
                          color: '#0ea5e9',
                          fillColor: '#0ea5e9',
                          fillOpacity: 0.15,
                          weight: 2,
                          dashArray: '8, 8'
                        }}
                        eventHandlers={{
                          click: (e) => {
                            if (mode === 'CONVERT' && onDivisionClick) {
                              L.DomEvent.stopPropagation(e);
                              onDivisionClick(parcel.id, div.id);
                            }
                          },
                          mousedown: () => handleLongPressStart(() => onDivisionLongPress?.(parcel.id, div.id)),
                          mouseup: handleLongPressEnd,
                          touchstart: () => handleLongPressStart(() => onDivisionLongPress?.(parcel.id, div.id)),
                          touchend: handleLongPressEnd,
                          contextmenu: (e) => {
                            L.DomEvent.stopPropagation(e);
                            onDivisionLongPress?.(parcel.id, div.id);
                          }
                        }}
                      />
                    ))}
                    <Marker position={center} icon={transparentIcon} interactive={false}>
                      {zoom > 16.5 && (
                        <Tooltip permanent direction="center" className="division-tooltip">
                          <div className="bg-blue-50/90 border border-blue-200 px-2 py-1 rounded-lg shadow-sm flex flex-col items-center">
                            <span className="text-[8px] text-blue-600 font-bold">سهم {div.percentage}%</span>
                            <span className="text-[10px] font-mono font-bold text-blue-900">
                              {Math.round(divArea).toLocaleString('fa-IR')} م²
                            </span>
                            {div.partnerId && (
                              <span className="text-[9px] text-blue-800 font-black mt-0.5 border-t border-blue-100 pt-0.5 w-full text-center">
                                {div.partnerId}
                              </span>
                            )}
                          </div>
                        </Tooltip>
                      )}
                    </Marker>
                  </React.Fragment>
                );
              })}
            </React.Fragment>
          ))}
      </React.Fragment>
    );
  };

  const highlightedParcelCenter = useMemo(() => {
    if (!highlightedParcelId) return null;
    
    // Direct lookup by ID is more reliable and avoids mutation issues
    const parcel = parcels.find(p => p.id === highlightedParcelId);
    if (!parcel) return null;

    const parcelPoints = parcel.pointIds
      .map(id => filteredPoints.find(p => p.id === id))
      .filter((p): p is Point => !!p);

    if (parcelPoints.length < 3) return null;

    const [lat, lng] = getCentroid(parcelPoints);
    return { lat, lng };
  }, [highlightedParcelId, parcels, points]);

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

        {filteredPoints.map(point => {
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

        {/* Rotation Guide Line */}
        {mode === 'ROTATE' && highlightedParcelId && highlightedParcelCenter && (
          <RotationLine 
            center={highlightedParcelCenter}
            angle={parcels.find(p => p.id === highlightedParcelId)?.angle || 0}
            onAngleChange={(newAngle) => onAngleChange?.(highlightedParcelId, newAngle)}
          />
        )}

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
