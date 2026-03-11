import React, { useState, useEffect, useMemo } from 'react';
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
  onDivisionLongPress?: (parcelId: string, divisionId: string) => void;
  userLocation?: { lat: number; lng: number; accuracy: number };
  showUserLocation: boolean;
  selectedPointId: string | null;
  centerTrigger?: number; // Used to trigger centering
  parcels?: Parcel[];
  generationFilter?: number;
}

// Find all simple cycles in the graph of connections
function findCycles(points: Point[], connections: Connection[]): Point[][] {
  const adj = new Map<string, string[]>();
  connections.forEach(c => {
    if (!adj.has(c.fromId)) adj.set(c.fromId, []);
    if (!adj.has(c.toId)) adj.set(c.toId, []);
    adj.get(c.fromId)!.push(c.toId);
    adj.get(c.toId)!.push(c.fromId);
  });

  const cycles: string[][] = [];
  const visited = new Set<string>();

  const findCycleDFS = (u: string, p: string, path: string[]) => {
    visited.add(u);
    path.push(u);

    const neighbors = adj.get(u) || [];
    for (const v of neighbors) {
      if (v === p) continue;
      if (path.includes(v)) {
        // Cycle found
        const cycle = path.slice(path.indexOf(v));
        if (cycle.length >= 3) {
          // Check if this cycle is already found (simple check)
          const sortedCycle = [...cycle].sort().join(',');
          if (!cycles.some(c => [...c].sort().join(',') === sortedCycle)) {
            cycles.push(cycle);
          }
        }
      } else if (!visited.has(v)) {
        findCycleDFS(v, u, [...path]);
      }
    }
  };

  const pointIds = Array.from(adj.keys());
  pointIds.forEach(id => {
    if (!visited.has(id)) {
      findCycleDFS(id, '', []);
    }
  });

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

function MapController({ 
  centerOn, 
  points 
}: { 
  centerOn?: { lat: number; lng: number }; 
  points: Point[] 
}) {
  const map = useMap();
  const [hasInitialFit, setHasInitialFit] = useState(false);

  // Initial fit to points - only once
  useEffect(() => {
    if (!hasInitialFit && points.length > 0) {
      const bounds = L.latLngBounds(points.map(p => [p.lat, p.lng]));
      map.fitBounds(bounds, { padding: [50, 50] });
      setHasInitialFit(true);
    }
  }, [points, map, hasInitialFit]);

  // Manual center on user - only when centerTrigger changes
  useEffect(() => {
    if (centerOn) {
      map.setView([centerOn.lat, centerOn.lng], map.getZoom() > 18 ? map.getZoom() : 18);
    }
  }, [centerOn, map]);

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
  onDivisionLongPress,
  userLocation,
  showUserLocation,
  selectedPointId,
  centerTrigger,
  parcels = [],
  generationFilter = 1
}: MapViewProps) {
  
  const cycles = findCycles(points, connections);
  const [zoom, setZoom] = useState(13);
  const longPressTimer = React.useRef<NodeJS.Timeout | null>(null);

  // Calculate generations for each cycle/parcel
  const cyclesWithGen = useMemo(() => {
    const polys = cycles.map(cycle => {
      const coords = [...cycle.map(p => [p.lng, p.lat]), [cycle[0].lng, cycle[0].lat]];
      return { 
        cycle, 
        poly: turf.polygon([coords as any]),
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
      let gen = 1;
      // Check if this poly is inside any other poly
      for (const other of polys) {
        if (item === other) continue;
        if (turf.booleanContains(other.poly, item.poly)) {
          gen = 2;
          // Check if the container is also inside something
          for (const third of polys) {
            if (third === other || third === item) continue;
            if (turf.booleanContains(third.poly, other.poly)) {
              gen = 3;
              break;
            }
          }
          if (gen === 2) break; // Found level 2, keep looking if it might be 3
        }
      }
      return { ...item, gen };
    });
  }, [cycles, connections]);

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

  const renderPolygons = () => {
    return cyclesWithGen.map((item, idx) => {
      const { cycle, gen } = item;
      
      // Strict generation filtering
      if (gen !== generationFilter) return null;

      const area = calculatePolygonArea(cycle);
      
      const parcelId = cycle.map(p => p.id).sort().join(',');
      const parcel = parcels.find(p => p.pointIds.sort().join(',') === parcelId);

      // Visibility logic based on zoom
      const isVisible = zoom > 15;
      const scale = Math.max(0.5, Math.min(1, (zoom - 14) / 4));
      
      return (
        <React.Fragment key={`cycle-group-${idx}`}>
          <Polygon 
            positions={cycle.map(p => [p.lat, p.lng])}
            pathOptions={{
              color: gen === 1 ? '#10b981' : gen === 2 ? '#6366f1' : '#f59e0b',
              fillColor: gen === 1 ? '#10b981' : gen === 2 ? '#6366f1' : '#f59e0b',
              fillOpacity: 0.1,
              weight: 2
            }}
            eventHandlers={{
              click: (e) => {
                if ((mode === 'DIVIDE' || mode === 'MANAGE') && onPolygonClick) {
                  L.DomEvent.stopPropagation(e);
                  onPolygonClick(cycle);
                }
              }
            }}
          >
            {isVisible && (
              <>
                <Tooltip permanent direction="center" className="area-tooltip">
                  <div 
                    className="flex flex-col items-center bg-white/90 backdrop-blur-sm px-2 py-1 rounded-lg border border-slate-200 shadow-sm transition-all duration-300 pointer-events-none" 
                    dir="rtl"
                    style={{ transform: `scale(${scale})`, opacity: isVisible ? 1 : 0 }}
                  >
                    <span className="text-[10px] text-slate-500 font-bold">مساحت قطعه</span>
                    <div className="flex items-baseline gap-0.5">
                      <span className="text-sm font-mono font-bold text-slate-700">{area.toLocaleString('fa-IR', { maximumFractionDigits: 1 })}</span>
                      <span className="text-[8px] text-slate-600 font-bold">متر مربع</span>
                    </div>
                  </div>
                </Tooltip>
                
                {parcel?.ownerName && (
                  <Tooltip permanent direction="center" className="owner-watermark-tooltip">
                    <div 
                      className="text-slate-900/20 font-black whitespace-nowrap pointer-events-none select-none transition-all duration-500"
                      style={{ 
                        fontSize: `${Math.max(20, area / 500)}px`,
                        transform: `rotate(-15deg)`
                      }}
                    >
                      {parcel.ownerName}
                    </div>
                  </Tooltip>
                )}
              </>
            )}
          </Polygon>

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
          centerOn={centerTrigger ? (userLocation || undefined) : undefined} 
          points={points}
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
      </MapContainer>
    </div>
  );
}
