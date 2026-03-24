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

  const pointMap = useMemo(() => new Map(points.map(p => [p.id, p])), [points]);

  const trackingTarget = useMemo(() => 
    trackingTargetId ? pointMap.get(trackingTargetId) : null
  , [trackingTargetId, pointMap]);

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
    // 1. Start with all manually defined parcels
    const parcelItems = parcels.map(p => {
      const cycle = p.pointIds.map(id => pointMap.get(id)!).filter(Boolean);
      if (cycle.length < 3) return null;
      const coords = [...cycle.map(pt => [pt.lng, pt.lat]), [cycle[0].lng, cycle[0].lat]];
      return {
        cycle,
        poly: turf.polygon([coords as any]),
        connectionIds: new Set<string>(),
        parcel: p,
        id: p.id
      };
    }).filter((p): p is NonNullable<typeof p> => !!p);

    // 2. Add any newly detected cycles that aren't already parcels
    const existingParcelCycleIds = new Set(parcels.map(p => [...p.pointIds].sort().join(',')));
    const detectedCycles = cycles.filter(cycle => {
      const id = cycle.map(p => p.id).sort().join(',');
      return !existingParcelCycleIds.has(id);
    }).map(cycle => {
      const coords = [...cycle.map(p => [p.lng, p.lat]), [cycle[0].lng, cycle[0].lat]];
      return {
        cycle,
        poly: turf.polygon([coords as any]),
        connectionIds: new Set<string>(),
        parcel: null,
        id: cycle.map(p => p.id).sort().join(',')
      };
    });

    const allPolys = [...parcelItems, ...detectedCycles];

    // Map connections to their IDs for easy lookup
    allPolys.forEach(item => {
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

    return allPolys.map(item => {
      let gen = item.parcel?.generation;
      
      if (!gen) {
        // Count how many other polygons contain this one
        let containers = 0;
        const itemCentroid = turf.centroid(item.poly);
        
        for (const other of allPolys) {
          if (item === other) continue;
          try {
            // Use a small buffer or booleanContains for more robust containment check
            if (turf.booleanPointInPolygon(itemCentroid, other.poly)) {
              containers++;
            }
          } catch (e) {}
        }
        gen = containers + 1;
      }
      
      // Check if this cycle has children (other cycles contained within it)
      const hasChildren = allPolys.some(other => {
        if (item === other) return false;
        try {
          const otherCentroid = turf.centroid(other.poly);
          // If other is inside item, then item has children
          return turf.booleanPointInPolygon(otherCentroid, item.poly);
        } catch (e) {
          return false;
        }
      });
      
      return { ...item, gen, hasChildren, layerId: `layer-gen-${gen}` };
    });
  }, [cycles, connections, parcels, pointMap]);

  const visibleConnectionIds = useMemo(() => {
    const ids = new Set<string>();
    cyclesWithGen.forEach(item => {
      // If filter is 0 (All), we only show connections of parcels that HAVE NO CHILDREN
      // to avoid seeing internal lines of parent parcels when not needed.
      if (generationFilter === 0) {
        if (!item.hasChildren) {
          item.connectionIds.forEach(id => ids.add(id));
        }
      } else if (item.gen === generationFilter) {
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

      const from = pointMap.get(conn.fromId);
      const to = pointMap.get(conn.toId);
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
      const { cycle, gen, poly, hasChildren } = item;
      
      // Strict generation filtering with Ghost support
      const isGhost = generationFilter !== 0 && gen < generationFilter;
      if (generationFilter === 0) {
        if (hasChildren) return null; // Only show leaf parcels when "All" is selected
      } else {
        if (gen > generationFilter) return null;
        if (isGhost && !hasChildren) return null; // Only show parents of the current generation
      }

      const area = calculatePolygonArea(cycle);
      
      const parcelId = cycle.map(p => p.id).sort().join(',');
      const parcel = parcelMap.get(parcelId);

      // Visibility logic based on zoom
      const isVisible = zoom > 15;
      const scale = Math.max(0.5, Math.min(1, (zoom - 14) / 4));

      // If a parcel is highlighted, only show its details
      const shouldShowDetails = !highlightedParcelId || highlightedParcelId === parcel?.id;
      
      // Hide area card if the parcel has children (it's a parent in the current view)
      // This ensures we only see the "active" units for the current generation
      // In "All" mode, we hide the card if it has children to avoid clutter
      const showAreaCard = !isGhost && isVisible && shouldShowDetails && (generationFilter !== 0 || !hasChildren);
      
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
              color: isGhost ? '#94a3b8' : (isHighlighted ? '#f59e0b' : (gen === 1 ? '#10b981' : gen === 2 ? '#6366f1' : '#f59e0b')),
              fillColor: isGhost ? 'transparent' : (isHighlighted ? '#f59e0b' : (gen === 1 ? '#10b981' : gen === 2 ? '#6366f1' : '#f59e0b')),
              fillOpacity: isGhost ? 0 : (isHighlighted ? 0.3 : 0.1),
              weight: isGhost ? 1 : (isHighlighted ? 4 : 2),
              dashArray: isGhost ? '5, 10' : (isHighlighted ? '10, 10' : undefined),
              interactive: !isGhost
            }}
            eventHandlers={{
              click: (e) => {
                if (!isGhost && (mode === 'DIVIDE' || mode === 'MANAGE' || mode === 'ROTATE') && onPolygonClick) {
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
            {showAreaCard && (
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
          {parcel?.divisions.map(div => {
            const center = getMultiCentroid(div.geometry);
            
            return (
              <React.Fragment key={div.id}>
                {div.geometry.map((polyCoords, pIdx) => (
                  <Polygon
                    key={`${div.id}-${pIdx}`}
                    positions={polyCoords}
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
                  />
                ))}
                <Marker position={center} icon={transparentIcon} interactive={false}>
                  <Tooltip permanent direction="center">
                    <div className="bg-white/80 px-1 rounded text-[8px] font-bold text-blue-700">
                      {div.percentage}%
                    </div>
                  </Tooltip>
                </Marker>
              </React.Fragment>
            );
          })}
        </React.Fragment>
      );
    });
  };

  const highlightedParcelCenter = useMemo(() => {
    if (!highlightedParcelId) return null;
    
    // Direct lookup by ID is more reliable and avoids mutation issues
    const parcel = parcels.find(p => p.id === highlightedParcelId);
    if (!parcel) return null;

    const parcelPoints = parcel.pointIds
      .map(id => pointMap.get(id))
      .filter((p): p is Point => !!p);

    if (parcelPoints.length < 3) return null;

    const [lat, lng] = getCentroid(parcelPoints);
    return { lat, lng };
  }, [highlightedParcelId, parcels, pointMap]);

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
