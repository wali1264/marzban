import React, { useState, useEffect, useCallback } from 'react';
import { MapContainer, TileLayer, Marker, Polyline, Circle, useMapEvents, useMap } from 'react-leaflet';
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

// Utility to calculate area in square meters using Shoelace formula on projected coordinates
function calculateArea(points: Point[], connections: Connection[]): number {
  if (points.length < 3) return 0;

  // Simple approach: find a closed loop or just use points in order of connections
  // For now, let's use the points that are part of any connection
  const connectedPointIds = new Set<string>();
  connections.forEach(c => {
    connectedPointIds.add(c.fromId);
    connectedPointIds.add(c.toId);
  });

  if (connectedPointIds.size < 3) return 0;

  // To calculate area correctly, we need an ordered list of vertices.
  // This is complex with arbitrary connections. 
  // Let's assume the user connects them in order.
  // We'll try to build a path.
  const orderedPoints: Point[] = [];
  if (connections.length > 0) {
    let currentId = connections[0].fromId;
    const visited = new Set<string>();
    
    while (currentId && !visited.has(currentId)) {
      visited.add(currentId);
      const p = points.find(pt => pt.id === currentId);
      if (p) orderedPoints.push(p);
      
      const nextConn = connections.find(c => c.fromId === currentId && !visited.has(c.toId));
      currentId = nextConn ? nextConn.toId : '';
    }
  }

  if (orderedPoints.length < 3) return 0;

  // Approximate area on sphere
  const radius = 6378137; // Earth radius in meters
  let area = 0;
  for (let i = 0; i < orderedPoints.length; i++) {
    const p1 = orderedPoints[i];
    const p2 = orderedPoints[(i + 1) % orderedPoints.length];
    
    const lat1 = p1.lat * Math.PI / 180;
    const lon1 = p1.lng * Math.PI / 180;
    const lat2 = p2.lat * Math.PI / 180;
    const lon2 = p2.lng * Math.PI / 180;
    
    area += (lon2 - lon1) * (2 + Math.sin(lat1) + Math.sin(lat2));
  }
  
  return Math.abs(area * radius * radius / 2.0);
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
  
  const area = calculateArea(points, connections);

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
      </MapContainer>

      {/* Area Display Overlay */}
      {area > 0 && (
        <div className="absolute top-4 left-4 z-[1000] bg-white/90 backdrop-blur-md px-4 py-2 rounded-2xl shadow-xl border border-emerald-100 flex flex-col items-start" dir="rtl">
          <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">مساحت تقریبی</span>
          <div className="flex items-baseline gap-1">
            <span className="text-xl font-mono font-bold text-emerald-700">{area.toLocaleString('fa-IR', { maximumFractionDigits: 1 })}</span>
            <span className="text-xs text-emerald-600 font-bold">متر مربع</span>
          </div>
          <div className="text-[9px] text-slate-400 mt-1">بر اساس زنجیره اتصالات</div>
        </div>
      )}
    </div>
  );
}
