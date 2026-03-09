/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  MapPin, 
  Plus, 
  Link as LinkIcon, 
  Trash2, 
  Save, 
  Navigation, 
  Layers, 
  Settings, 
  Info, 
  Maximize2, 
  CheckCircle2, 
  X,
  Target,
  Activity,
  RefreshCw,
  Crosshair,
  Eye,
  EyeOff,
  Users,
  Scissors,
  RotateCw
} from 'lucide-react';
import * as turf from '@turf/turf';
import MapView from './components/Map/MapView';
import PrecisionRecorder from './components/Recorder/PrecisionRecorder';
import { Point, Connection, AppMode, Parcel, Partner, Division } from './types';
import { cn } from './utils';

export default function App() {
  const [points, setPoints] = useState<Point[]>([]);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [mode, setMode] = useState<AppMode>('VIEW');
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number; accuracy: number }>();
  const [selectedPointId, setSelectedPointId] = useState<string | null>(null);
  const [showRecorder, setShowRecorder] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [centerTrigger, setCenterTrigger] = useState(0);
  const [showUserLocation, setShowUserLocation] = useState(false);

  const [parcels, setParcels] = useState<Parcel[]>([]);
  const [showDivisionModal, setShowDivisionModal] = useState(false);
  const [selectedCycle, setSelectedCycle] = useState<Point[] | null>(null);

  // Load from local storage on mount
  useEffect(() => {
    const savedPoints = localStorage.getItem('marzban_points');
    const savedConnections = localStorage.getItem('marzban_connections');
    const savedParcels = localStorage.getItem('marzban_parcels');
    if (savedPoints) setPoints(JSON.parse(savedPoints));
    if (savedConnections) setConnections(JSON.parse(savedConnections));
    if (savedParcels) setParcels(JSON.parse(savedParcels));
  }, []);

  const [hasZoomedForLocation, setHasZoomedForLocation] = useState(false);

  // Live Location Tracking - Only active when showUserLocation is true
  useEffect(() => {
    if (!navigator.geolocation || !showUserLocation) {
      setUserLocation(undefined);
      setHasZoomedForLocation(false);
      return;
    }

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const loc = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy
        };
        setUserLocation(loc);
      },
      (err) => console.error(err),
      { enableHighAccuracy: true }
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, [showUserLocation]);

  // One-time zoom when turning on location and first fix is received
  useEffect(() => {
    if (showUserLocation && userLocation && !hasZoomedForLocation) {
      setCenterTrigger(prev => prev + 1);
      setHasZoomedForLocation(true);
    }
  }, [showUserLocation, userLocation, hasZoomedForLocation]);

  // Save to local storage on change
  useEffect(() => {
    localStorage.setItem('marzban_points', JSON.stringify(points));
    localStorage.setItem('marzban_connections', JSON.stringify(connections));
    localStorage.setItem('marzban_parcels', JSON.stringify(parcels));
  }, [points, connections, parcels]);

  const handleRecorderConfirm = (data: Omit<Point, 'id' | 'timestamp'>) => {
    if (isUpdating && selectedPointId) {
      setPoints(prev => prev.map(p => p.id === selectedPointId ? {
        ...p,
        ...data,
        timestamp: Date.now()
      } : p));
      setIsUpdating(false);
    } else {
      const newPoint: Point = {
        id: Math.random().toString(36).substr(2, 9),
        ...data,
        timestamp: Date.now()
      };
      setPoints(prev => [...prev, newPoint]);
      setSelectedPointId(newPoint.id);
    }
    setShowRecorder(false);
  };

  const handlePointClick = (point: Point) => {
    if (mode === 'CONNECT') {
      if (selectedPointId && selectedPointId !== point.id) {
        // Create connection from selected to clicked
        const exists = connections.some(c => 
          (c.fromId === selectedPointId && c.toId === point.id) ||
          (c.fromId === point.id && c.toId === selectedPointId)
        );
        
        if (!exists) {
          const newConn: Connection = {
            id: Math.random().toString(36).substr(2, 9),
            fromId: selectedPointId,
            toId: point.id
          };
          setConnections(prev => [...prev, newConn]);
        }
        // Chain: update selection to the new point
        setSelectedPointId(point.id);
      } else {
        setSelectedPointId(point.id);
      }
    } else {
      setSelectedPointId(point.id);
    }
  };

  const handleConnectionClick = (connId: string) => {
    if (confirm("آیا از حذف این اتصال اطمینان دارید؟")) {
      setConnections(prev => prev.filter(c => c.id !== connId));
    }
  };

  const deletePoint = (id: string) => {
    if (confirm("آیا از حذف این مختصات اطمینان دارید؟")) {
      // Find connections to this point
      const connectedConns = connections.filter(c => c.fromId === id || c.toId === id);
      
      // If point has exactly 2 connections, we can "bypass" it
      if (connectedConns.length === 2) {
        const neighborIds = connectedConns.map(c => c.fromId === id ? c.toId : c.fromId);
        const [n1, n2] = neighborIds;
        
        // Check if neighbors are already connected
        const neighborsConnected = connections.some(c => 
          (c.fromId === n1 && c.toId === n2) || (c.fromId === n2 && c.toId === n1)
        );

        if (!neighborsConnected) {
          const bypassConn: Connection = {
            id: Math.random().toString(36).substr(2, 9),
            fromId: n1,
            toId: n2
          };
          setConnections(prev => [...prev.filter(c => c.fromId !== id && c.toId !== id), bypassConn]);
        } else {
          setConnections(prev => prev.filter(c => c.fromId !== id && c.toId !== id));
        }
      } else {
        setConnections(prev => prev.filter(c => c.fromId !== id && c.toId !== id));
      }

      setPoints(prev => prev.filter(p => p.id !== id));
      setSelectedPointId(null);
    }
  };

  const handlePolygonClick = (cycle: Point[]) => {
    if (mode === 'DIVIDE') {
      setSelectedCycle(cycle);
      setShowDivisionModal(true);
    }
  };

  const splitPolygon = (cycle: Point[], percentage: number, orientation: 'HORIZONTAL' | 'VERTICAL'): [number, number][] => {
    const coords = [...cycle.map(p => [p.lng, p.lat]), [cycle[0].lng, cycle[0].lat]];
    const poly = turf.polygon([coords]);
    const bbox = turf.bbox(poly);
    const totalArea = turf.area(poly);
    const targetArea = totalArea * (percentage / 100);

    let min = orientation === 'VERTICAL' ? bbox[0] : bbox[1];
    let max = orientation === 'VERTICAL' ? bbox[2] : bbox[3];
    let bestCoords: [number, number][] = [];

    // Binary search for the split line
    for (let i = 0; i < 20; i++) {
      const mid = (min + max) / 2;
      let splitLine;
      
      if (orientation === 'VERTICAL') {
        splitLine = turf.lineString([[mid, bbox[1] - 0.1], [mid, bbox[3] + 0.1]]);
      } else {
        splitLine = turf.lineString([[bbox[0] - 0.1, mid], [bbox[2] + 0.1, mid]]);
      }

      const polyLine = turf.polygonToLine(poly);
      const split = turf.lineSplit(polyLine as any, splitLine);
      if (split.features.length < 2) {
        if (orientation === 'VERTICAL') min = mid; else min = mid;
        continue;
      }

      // Create a clipping polygon
      let clipPoly;
      if (orientation === 'VERTICAL') {
        clipPoly = turf.polygon([[[bbox[0], bbox[1]], [mid, bbox[1]], [mid, bbox[3]], [bbox[0], bbox[3]], [bbox[0], bbox[1]]]]);
      } else {
        clipPoly = turf.polygon([[[bbox[0], bbox[1]], [bbox[2], bbox[1]], [bbox[2], mid], [bbox[0], mid], [bbox[0], bbox[1]]]]);
      }

      const intersection = turf.intersect(turf.featureCollection([poly, clipPoly]));
      if (!intersection) {
        min = mid;
        continue;
      }

      const currentArea = turf.area(intersection);
      if (currentArea < targetArea) {
        min = mid;
      } else {
        max = mid;
      }

      if (intersection.geometry.type === 'Polygon') {
        bestCoords = intersection.geometry.coordinates[0] as [number, number][];
      } else if (intersection.geometry.type === 'MultiPolygon') {
        bestCoords = intersection.geometry.coordinates[0][0] as [number, number][];
      }
    }

    // Convert back to [lat, lng] for Leaflet
    return bestCoords.map(c => [c[1], c[0]] as [number, number]);
  };

  const handleAddDivision = (name: string, percentage: number, orientation: 'HORIZONTAL' | 'VERTICAL') => {
    if (!selectedCycle) return;

    const parcelId = selectedCycle.map(p => p.id).sort().join(',');
    const existingParcel = parcels.find(p => p.pointIds.sort().join(',') === parcelId);
    
    const currentTotal = existingParcel?.divisions.reduce((sum, d) => sum + d.percentage, 0) || 0;
    if (currentTotal + percentage > 100) {
      alert(`خطا: مجموع سهام نمی‌تواند بیش از ۱۰۰٪ باشد. (باقیمانده: ${100 - currentTotal}٪)`);
      return;
    }

    const geometry = splitPolygon(selectedCycle, percentage + currentTotal, orientation);
    // Note: This simple split logic needs refinement for multiple divisions, 
    // but for now it demonstrates the concept.
    
    const newDivision: Division = {
      id: Math.random().toString(36).substr(2, 9),
      partnerId: name,
      percentage,
      geometry,
      orientation
    };

    if (existingParcel) {
      setParcels(prev => prev.map(p => p.id === existingParcel.id ? {
        ...p,
        divisions: [...p.divisions, newDivision]
      } : p));
    } else {
      const newParcel: Parcel = {
        id: Math.random().toString(36).substr(2, 9),
        name: "قطعه جدید",
        pointIds: selectedCycle.map(p => p.id),
        divisions: [newDivision],
        area: turf.area(turf.polygon([[...selectedCycle.map(p => [p.lng, p.lat]), [selectedCycle[0].lng, selectedCycle[0].lat]]]))
      };
      setParcels(prev => [...prev, newParcel]);
    }
    setShowDivisionModal(false);
  };

  const startUpdate = () => {
    setIsUpdating(true);
    setShowRecorder(true);
  };

  const selectedPoint = points.find(p => p.id === selectedPointId);

  return (
    <div className="flex flex-col h-screen w-full bg-slate-50 overflow-hidden font-sans" dir="rtl">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 px-4 py-3 flex items-center justify-between shadow-sm z-10">
        <div className="flex items-center gap-2">
          <div className="bg-emerald-600 p-2 rounded-lg shadow-emerald-200 shadow-lg">
            <Layers className="text-white w-5 h-5" />
          </div>
          <div>
            <h1 className="font-bold text-slate-900 text-lg leading-tight">مرزبان</h1>
            <p className="text-xs text-slate-500">سیستم نقشه‌برداری اراضی</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
           <button 
             onClick={() => setMode(mode === 'DIVIDE' ? 'VIEW' : 'DIVIDE')}
             className={cn(
               "p-2 rounded-full transition-colors",
               mode === 'DIVIDE' ? "bg-blue-100 text-blue-600" : "text-slate-500 hover:bg-slate-100"
             )}
             title="حالت تقسیم اراضی"
           >
             <Users className="w-5 h-5" />
           </button>
           <button className="p-2 text-slate-500 hover:bg-slate-100 rounded-full transition-colors">
             <Settings className="w-5 h-5" />
           </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 relative">
        <MapView 
          points={points}
          connections={connections}
          mode={mode}
          onPointClick={handlePointClick}
          onMapClick={() => setSelectedPointId(null)}
          onConnectionClick={handleConnectionClick}
          onPolygonClick={handlePolygonClick}
          userLocation={userLocation}
          showUserLocation={showUserLocation}
          selectedPointId={selectedPointId}
          centerTrigger={centerTrigger}
          parcels={parcels}
        />

        {/* Floating Controls */}
        <div className="absolute top-4 right-4 flex flex-col gap-2 z-[1000]">
          <button 
            onClick={() => setMode('VIEW')}
            className={cn(
              "p-3 rounded-2xl shadow-xl transition-all",
              mode === 'VIEW' ? "bg-emerald-600 text-white" : "bg-white text-slate-600"
            )}
            title="حالت مشاهده"
          >
            <Navigation className="w-6 h-6" />
          </button>
          <button 
            onClick={() => setMode('CONNECT')}
            className={cn(
              "p-3 rounded-2xl shadow-xl transition-all",
              mode === 'CONNECT' ? "bg-emerald-600 text-white" : "bg-white text-slate-600"
            )}
            title="حالت اتصال مرزها"
          >
            <LinkIcon className="w-6 h-6" />
          </button>
          
          <div className="h-px bg-slate-200 my-1" />

          <button 
            onClick={() => setShowUserLocation(!showUserLocation)}
            className={cn(
              "p-3 rounded-2xl shadow-xl transition-all",
              showUserLocation ? "bg-blue-600 text-white" : "bg-white text-slate-600"
            )}
            title={showUserLocation ? "مخفی‌سازی مکان من" : "نمایش مکان من"}
          >
            {showUserLocation ? <Eye className="w-6 h-6" /> : <EyeOff className="w-6 h-6" />}
          </button>

          <button 
            onClick={() => {
              setShowUserLocation(true);
              setCenterTrigger(prev => prev + 1);
            }}
            className="p-3 bg-white text-blue-600 rounded-2xl shadow-xl transition-all hover:bg-blue-50 active:scale-95"
            title="موقعیت من"
          >
            <Target className="w-6 h-6" />
          </button>
        </div>

        {/* Bottom Action Bar */}
        <div className="absolute bottom-8 left-0 right-0 flex justify-center px-4 z-[1000]">
          <div className="bg-white/90 backdrop-blur-md border border-white/20 p-2 rounded-3xl shadow-2xl flex items-center gap-2 max-w-md w-full">
            <button 
              onClick={() => { setIsUpdating(false); setShowRecorder(true); }}
              className="flex-1 flex items-center justify-center gap-2 py-4 bg-emerald-600 text-white rounded-2xl font-bold shadow-lg shadow-emerald-200 transition-all active:scale-95"
            >
              <Crosshair className="w-5 h-5" />
              ثبت مختصات دقیق
            </button>
            
            <div className="w-px h-8 bg-slate-200 mx-1" />
            
            <button 
              className="p-4 text-slate-600 hover:bg-slate-100 rounded-2xl transition-colors"
              title="اطلاعات پروژه"
            >
              <Info className="w-6 h-6" />
            </button>
          </div>
        </div>

        {/* Selected Point Info Panel */}
        <AnimatePresence>
          {selectedPoint && mode !== 'CONNECT' && (
            <motion.div 
              initial={{ y: 100, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 100, opacity: 0 }}
              className="absolute bottom-32 left-4 right-4 bg-white rounded-3xl shadow-2xl p-5 z-[1000] border border-slate-100"
            >
              <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-3">
                  <div className="bg-emerald-100 p-2.5 rounded-2xl">
                    <MapPin className="text-emerald-600 w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-900 text-lg">مختصات ثبت شده</h3>
                    <p className="text-xs font-mono text-slate-500">
                      {selectedPoint.lat.toFixed(8)}, {selectedPoint.lng.toFixed(8)}
                    </p>
                  </div>
                </div>
                <button 
                  onClick={() => setSelectedPointId(null)}
                  className="p-2 hover:bg-slate-100 rounded-full transition-colors"
                >
                  <X className="w-5 h-5 text-slate-400" />
                </button>
              </div>

              <div className="bg-slate-50 rounded-2xl p-3 mb-5 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Activity className="w-4 h-4 text-emerald-500" />
                  <span className="text-xs text-slate-600 font-medium">دقت ثبت: {selectedPoint.accuracy.toFixed(2)} متر</span>
                </div>
                <span className="text-[10px] text-slate-400">{new Date(selectedPoint.timestamp).toLocaleString('fa-IR')}</span>
              </div>
              
              <div className="grid grid-cols-2 gap-3">
                <button 
                  onClick={() => deletePoint(selectedPoint.id)}
                  className="flex items-center justify-center gap-2 py-4 bg-rose-50 text-rose-600 rounded-2xl font-bold hover:bg-rose-100 transition-colors"
                >
                  <Trash2 className="w-5 h-5" />
                  حذف
                </button>
                <button 
                  onClick={startUpdate}
                  className="flex items-center justify-center gap-2 py-4 bg-amber-50 text-amber-600 rounded-2xl font-bold hover:bg-amber-100 transition-colors"
                >
                  <RefreshCw className="w-5 h-5" />
                  بروزرسانی
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Precision Recorder Overlay */}
        <AnimatePresence>
          {showRecorder && (
            <PrecisionRecorder 
              onConfirm={handleRecorderConfirm}
              onCancel={() => { setShowRecorder(false); setIsUpdating(false); }}
            />
          )}
        </AnimatePresence>
      </main>

      {/* Mode Indicator */}
      {mode !== 'VIEW' && (
        <div className="absolute top-20 left-1/2 -translate-x-1/2 bg-amber-500 text-white px-5 py-2 rounded-full text-sm font-bold shadow-xl z-[1000] flex items-center gap-2 border border-white/20">
          <div className="w-2 h-2 bg-white rounded-full animate-pulse" />
          {mode === 'CONNECT' ? "حالت اتصال زنجیره‌ای فعال است" : 
           mode === 'DIVIDE' ? "حالت تقسیم اراضی: روی یک قطعه کلیک کنید" : "حالت ویرایش"}
        </div>
      )}

      {/* Division Modal */}
      <AnimatePresence>
        {showDivisionModal && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[2000] flex items-center justify-center p-4" dir="rtl">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-[32px] shadow-2xl w-full max-w-md overflow-hidden"
            >
              <div className="p-6 border-b border-slate-100 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="bg-blue-100 p-2 rounded-xl">
                    <Scissors className="w-6 h-6 text-blue-600" />
                  </div>
                  <h2 className="text-xl font-bold text-slate-900">تقسیم سهم و شرکا</h2>
                </div>
                <button onClick={() => setShowDivisionModal(false)} className="p-2 hover:bg-slate-100 rounded-full">
                  <X className="w-5 h-5 text-slate-400" />
                </button>
              </div>

              <div className="p-6">
                <form onSubmit={(e) => {
                  e.preventDefault();
                  const formData = new FormData(e.currentTarget);
                  handleAddDivision(
                    formData.get('name') as string,
                    Number(formData.get('percentage')),
                    formData.get('orientation') as 'HORIZONTAL' | 'VERTICAL'
                  );
                }}>
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-bold text-slate-700 mb-2">نام شریک / فرزند</label>
                      <input 
                        name="name"
                        required
                        className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl px-4 py-3 focus:border-blue-500 focus:outline-none transition-colors"
                        placeholder="مثلاً: احمد (نسل دوم)"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-bold text-slate-700 mb-2">درصد سهم (٪)</label>
                      <input 
                        name="percentage"
                        type="number"
                        min="1"
                        max="100"
                        required
                        className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl px-4 py-3 focus:border-blue-500 focus:outline-none transition-colors"
                        placeholder="مثلاً: ۵۰"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-bold text-slate-700 mb-2">جهت تقسیم</label>
                      <div className="grid grid-cols-2 gap-3">
                        <label className="relative flex items-center justify-center p-4 bg-slate-50 rounded-2xl border-2 border-transparent cursor-pointer has-[:checked]:border-blue-500 has-[:checked]:bg-blue-50 transition-all">
                          <input type="radio" name="orientation" value="VERTICAL" defaultChecked className="sr-only" />
                          <div className="flex flex-col items-center gap-1">
                            <div className="w-px h-4 bg-slate-400" />
                            <span className="text-xs font-bold">عمودی</span>
                          </div>
                        </label>
                        <label className="relative flex items-center justify-center p-4 bg-slate-50 rounded-2xl border-2 border-transparent cursor-pointer has-[:checked]:border-blue-500 has-[:checked]:bg-blue-50 transition-all">
                          <input type="radio" name="orientation" value="HORIZONTAL" className="sr-only" />
                          <div className="flex flex-col items-center gap-1">
                            <div className="h-px w-4 bg-slate-400" />
                            <span className="text-xs font-bold">افقی</span>
                          </div>
                        </label>
                      </div>
                    </div>
                  </div>

                  <button 
                    type="submit"
                    className="w-full mt-8 py-4 bg-blue-600 text-white rounded-2xl font-bold shadow-lg shadow-blue-100 hover:bg-blue-700 transition-all active:scale-95 flex items-center justify-center gap-2"
                  >
                    <CheckCircle2 className="w-5 h-5" />
                    تایید و ایجاد سهم
                  </button>
                </form>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
