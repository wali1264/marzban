import React, { useState, useMemo, useEffect } from 'react';
import { Polyline, Marker, useMap } from 'react-leaflet';
import L from 'leaflet';
import * as turf from '@turf/turf';
import { Point } from '../../types';

interface RulerToolProps {
  startPoint?: Point;
  endPoint?: Point;
  userLocation?: { lat: number; lng: number };
}

export default function RulerTool({ startPoint, endPoint, userLocation }: RulerToolProps) {
  const [handleProgress, setHandleProgress] = useState(1.0); // 0 to 1
  
  // Reset handle to end when points change
  useEffect(() => {
    setHandleProgress(1.0);
  }, [startPoint?.id, endPoint?.id]);

  const rulerData = useMemo(() => {
    if (!startPoint || !endPoint) return null;

    const line = turf.lineString([
      [startPoint.lng, startPoint.lat],
      [endPoint.lng, endPoint.lat]
    ]);
    const totalDistance = turf.length(line, { units: 'meters' });
    
    // Calculate handle position
    const handlePos = turf.along(line, totalDistance * handleProgress, { units: 'meters' });
    const [hLng, hLat] = handlePos.geometry.coordinates;
    const currentDistance = totalDistance * handleProgress;

    return { 
      totalDistance, 
      currentDistance,
      handlePos: [hLat, hLng] as [number, number],
      startPos: [startPoint.lat, startPoint.lng] as [number, number],
      endPos: [endPoint.lat, endPoint.lng] as [number, number]
    };
  }, [startPoint, endPoint, handleProgress]);

  if (!rulerData) {
    // If only start point is selected, show a highlight on it
    if (startPoint) {
      return (
        <Marker 
          position={[startPoint.lat, startPoint.lng]} 
          icon={L.divIcon({
            className: 'ruler-start-highlight',
            html: `
              <div class="relative flex items-center justify-center">
                <div class="absolute w-12 h-12 bg-amber-500/20 rounded-full animate-ping"></div>
                <div class="w-6 h-6 bg-amber-500 rounded-full border-4 border-white shadow-xl"></div>
              </div>
            `,
            iconSize: [48, 48],
            iconAnchor: [24, 24]
          })}
        />
      );
    }
    return null;
  }

  return (
    <>
      {/* The Main Line */}
      <Polyline
        positions={[rulerData.startPos, rulerData.endPos]}
        pathOptions={{
          color: '#f59e0b',
          weight: 8,
          opacity: 0.4,
          lineCap: 'round'
        }}
      />
      <Polyline
        positions={[rulerData.startPos, rulerData.endPos]}
        pathOptions={{
          color: '#fbbf24',
          weight: 2,
          opacity: 0.8,
          dashArray: '5, 10'
        }}
      />

      {/* Start Marker */}
      <Marker 
        position={rulerData.startPos} 
        icon={L.divIcon({
          className: 'ruler-cap',
          html: '<div class="w-5 h-5 bg-amber-600 rounded-full border-4 border-white shadow-lg"></div>',
          iconSize: [20, 20],
          iconAnchor: [10, 10]
        })} 
      />
      
      {/* End Marker */}
      <Marker 
        position={rulerData.endPos} 
        icon={L.divIcon({
          className: 'ruler-cap',
          html: '<div class="w-5 h-5 bg-slate-400 rounded-full border-4 border-white shadow-lg"></div>',
          iconSize: [20, 20],
          iconAnchor: [10, 10]
        })} 
      />

      {/* Draggable Handle / Card */}
      <Marker
        position={rulerData.handlePos}
        draggable={true}
        eventHandlers={{
          dragend: (e) => {
            const marker = e.target;
            const pos = marker.getLatLng();
            
            // Project final drag position onto the line to find nearest point
            const line = turf.lineString([
              [startPoint!.lng, startPoint!.lat],
              [endPoint!.lng, endPoint!.lat]
            ]);
            const pt = turf.point([pos.lng, pos.lat]);
            const snapped = turf.nearestPointOnLine(line, pt, { units: 'meters' });
            
            // Calculate progress along line
            const totalDist = turf.length(line, { units: 'meters' });
            const distFromStart = turf.distance(
              turf.point([startPoint!.lng, startPoint!.lat]),
              snapped,
              { units: 'meters' }
            );
            
            setHandleProgress(Math.min(1, Math.max(0, distFromStart / totalDist)));
          }
        }}
        icon={L.divIcon({
          className: 'ruler-handle',
          html: `
            <div class="relative flex flex-col items-center">
              <div class="bg-white px-5 py-3 rounded-3xl shadow-[0_20px_50px_rgba(0,0,0,0.2)] border-2 border-amber-500 flex flex-col items-center min-w-[120px] transition-transform cursor-grab active:cursor-grabbing">
                <div class="flex items-center gap-2 mb-1">
                  <div class="w-1.5 h-1.5 bg-amber-500 rounded-full animate-pulse"></div>
                  <span class="text-[10px] text-slate-400 font-black uppercase tracking-[0.2em]">فاصله دیجیتال</span>
                </div>
                <div class="flex items-baseline gap-1">
                  <span class="text-2xl font-black text-slate-800 tabular-nums">${rulerData.currentDistance.toFixed(1)}</span>
                  <span class="text-xs font-bold text-amber-600">متر</span>
                </div>
                <div class="w-12 h-1.5 bg-slate-100 rounded-full mt-2 overflow-hidden">
                  <div class="h-full bg-amber-500 transition-all duration-75" style="width: ${handleProgress * 100}%"></div>
                </div>
              </div>
              <div class="w-0.5 h-8 bg-amber-500 shadow-sm"></div>
              <div class="w-6 h-6 bg-amber-500 rounded-full border-4 border-white shadow-xl flex items-center justify-center">
                <div class="w-1.5 h-1.5 bg-white rounded-full"></div>
              </div>
            </div>
          `,
          iconSize: [140, 120],
          iconAnchor: [70, 108]
        })}
      />
    </>
  );
}
