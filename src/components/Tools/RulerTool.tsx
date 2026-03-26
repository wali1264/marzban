import React, { useMemo } from 'react';
import { Polyline, Marker, Tooltip, useMap } from 'react-leaflet';
import L from 'leaflet';
import * as turf from '@turf/turf';
import { motion, AnimatePresence } from 'motion/react';

interface RulerToolProps {
  points: [number, number][]; // [lat, lng]
  userLocation?: { lat: number; lng: number };
  zoom: number;
}

export default function RulerTool({ points, userLocation, zoom }: RulerToolProps) {
  const map = useMap();

  const rulerData = useMemo(() => {
    if (points.length < 2) return null;

    const line = turf.lineString(points.map(p => [p[1], p[0]]));
    const totalDistance = turf.length(line, { units: 'meters' });

    // Determine tick interval based on zoom
    // Zoom 13: 1km
    // Zoom 15: 100m
    // Zoom 18: 1m
    // Zoom 20+: 10cm
    let interval = 1000; // default 1km
    if (zoom >= 20) interval = 0.1;
    else if (zoom >= 18) interval = 1;
    else if (zoom >= 15) interval = 100;
    else if (zoom >= 13) interval = 1000;
    else interval = 5000;

    const ticks: { pos: [number, number]; distance: number; label: string; type: 'major' | 'minor' }[] = [];
    
    // Generate ticks along the line
    for (let d = 0; d <= totalDistance; d += interval) {
      try {
        const point = turf.along(line, d, { units: 'meters' });
        const [lng, lat] = point.geometry.coordinates;
        
        let label = '';
        if (d >= 1000) label = `${(d / 1000).toFixed(d % 1000 === 0 ? 0 : 1)}km`;
        else if (d >= 1) label = `${Math.floor(d)}m`;
        else label = `${(d * 100).toFixed(0)}cm`;

        ticks.push({
          pos: [lat, lng],
          distance: d,
          label,
          type: d % (interval * 5) === 0 ? 'major' : 'minor'
        });
      } catch (e) {
        // Skip if along fails at the very end
      }
    }

    // User projection on line
    let userProj = null;
    if (userLocation) {
      const userPt = turf.point([userLocation.lng, userLocation.lat]);
      const snapped = turf.nearestPointOnLine(line, userPt, { units: 'meters' });
      const distOnLine = snapped.properties.location || 0;
      userProj = {
        pos: [snapped.geometry.coordinates[1], snapped.geometry.coordinates[0]] as [number, number],
        distance: distOnLine
      };
    }

    return { totalDistance, ticks, userProj };
  }, [points, userLocation, zoom]);

  if (!rulerData) return null;

  return (
    <>
      {/* The Main Tape Line */}
      <Polyline
        positions={points}
        pathOptions={{
          color: '#f59e0b',
          weight: 12,
          opacity: 0.4,
          lineCap: 'butt'
        }}
      />
      <Polyline
        positions={points}
        pathOptions={{
          color: '#fbbf24',
          weight: 2,
          opacity: 0.8,
          dashArray: '1, 10'
        }}
      />

      {/* Ticks and Labels */}
      {rulerData.ticks.map((tick, i) => (
        <Marker
          key={i}
          position={tick.pos}
          icon={L.divIcon({
            className: 'ruler-tick',
            html: `
              <div class="flex flex-col items-center" style="transform: translate(-50%, -50%)">
                <div class="${tick.type === 'major' ? 'h-4 w-0.5' : 'h-2 w-px'} bg-amber-500"></div>
                ${tick.type === 'major' ? `<span class="text-[8px] font-black text-amber-700 bg-white/80 px-1 rounded mt-1">${tick.label}</span>` : ''}
              </div>
            `,
            iconSize: [0, 0]
          })}
        />
      ))}

      {/* User Position on Ruler */}
      {rulerData.userProj && (
        <Marker
          position={rulerData.userProj.pos}
          icon={L.divIcon({
            className: 'ruler-user-pos',
            html: `
              <div class="relative flex flex-col items-center">
                <div class="w-4 h-4 bg-blue-600 rounded-full border-2 border-white shadow-lg animate-pulse"></div>
                <div class="absolute top-5 bg-blue-600 text-white text-[8px] font-black px-2 py-0.5 rounded-full whitespace-nowrap shadow-xl">
                  متر ${Math.floor(rulerData.userProj.distance)}
                </div>
              </div>
            `,
            iconSize: [16, 16],
            iconAnchor: [8, 8]
          })}
        />
      )}

      {/* Start and End Markers */}
      <Marker position={points[0]} icon={L.divIcon({
        className: 'ruler-cap',
        html: '<div class="w-3 h-3 bg-amber-600 rounded-full border-2 border-white"></div>',
        iconSize: [12, 12],
        iconAnchor: [6, 6]
      })} />
      
      <Marker position={points[points.length - 1]} icon={L.divIcon({
        className: 'ruler-cap',
        html: `
          <div class="relative flex flex-col items-center">
            <div class="w-4 h-4 bg-amber-600 rounded-full border-2 border-white shadow-lg"></div>
            <div class="absolute bottom-6 bg-slate-900 text-white text-[10px] font-black px-3 py-1 rounded-xl whitespace-nowrap shadow-2xl border border-white/10">
              کل: ${rulerData.totalDistance.toFixed(1)} متر
            </div>
          </div>
        `,
        iconSize: [16, 16],
        iconAnchor: [8, 8]
      })} />
    </>
  );
}
