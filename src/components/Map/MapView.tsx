import React, { useState, useEffect, useCallback } from 'react';
import { MapContainer, TileLayer, Marker, Polyline, Circle, Polygon, Tooltip, useMapEvents, useMap } from 'react-leaflet';
import L from 'leaflet';
import { Point, Connection, AppMode } from '../../types';
import { MapPin, Navigation, Target } from 'lucide-react';

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
  userLocation?: { lat: number; lng: number; accuracy: number };
  showUserLocation: boolean;
  selectedPointId: string | null;
  centerTrigger?: number; // Used to trigger centering
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

function MapEvents({ onMapClick }: { onMapClick: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(e) {
      onMapClick(e.latlng.lat, e.latlng.lng);
    },
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
  userLocation,
  showUserLocation,
  selectedPointId,
  centerTrigger
}: MapViewProps) {
  
  const cycles = findCycles(points, connections);

  const renderConnections = () => {
    return connections.map(conn => {
      const from = points.find(p => p.id === conn.fromId);
      const to = points.find(p => p.id === conn.toId);
      if (from && to) {
        return (
          <Polyline 
            key={conn.id} 
            positions={[[from.lat, from.lng], [to.lat, to.lng]]} 
            color="#10b981" 
            weight={6}
            opacity={0.6}
            eventHandlers={{
              click: (e) => {
                L.DomEvent.stopPropagation(e);
                onConnectionClick(conn.id);
              }
            }}
          />
        );
      }
      return null;
    });
  };

  const renderPolygons = () => {
    return cycles.map((cycle, idx) => {
      const area = calculatePolygonArea(cycle);
      const centroid = getCentroid(cycle);
      return (
        <Polygon 
          key={`cycle-${idx}`}
          positions={cycle.map(p => [p.lat, p.lng])}
          pathOptions={{
            color: '#10b981',
            fillColor: '#10b981',
            fillOpacity: 0.15,
            weight: 0
          }}
        >
          <Tooltip permanent direction="center" className="area-tooltip">
            <div className="flex flex-col items-center bg-white/90 backdrop-blur-sm px-2 py-1 rounded-lg border border-emerald-200 shadow-sm" dir="rtl">
              <span className="text-[10px] text-slate-500 font-bold">مساحت</span>
              <div className="flex items-baseline gap-0.5">
                <span className="text-sm font-mono font-bold text-emerald-700">{area.toLocaleString('fa-IR', { maximumFractionDigits: 1 })}</span>
                <span className="text-[8px] text-emerald-600 font-bold">متر مربع</span>
              </div>
            </div>
          </Tooltip>
        </Polygon>
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
        
        <MapEvents onMapClick={onMapClick} />
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
