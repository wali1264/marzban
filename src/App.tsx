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
  RotateCw,
  UserCog,
  Search,
  ChevronDown,
  SearchX,
  ChevronUp,
  Lock,
  ShieldCheck,
  KeyRound,
  Database
} from 'lucide-react';
import * as turf from '@turf/turf';
import MapView from './components/Map/MapView';
import PrecisionRecorder from './components/Recorder/PrecisionRecorder';
import BackupModal from './components/Backup/BackupModal';
import { Point, Connection, AppMode, Parcel, Partner, Division } from './types';
import { cn } from './utils';
import { geminiService } from './services/gemini';

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
  
  const [aiReport, setAiReport] = useState<string | null>(null);
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [showAiModal, setShowAiModal] = useState(false);
  const [showProjectInfo, setShowProjectInfo] = useState(false);
  const [generationFilter, setGenerationFilter] = useState(1);
  const [showOwnerModal, setShowOwnerModal] = useState(false);
  const [selectedParcelForOwner, setSelectedParcelForOwner] = useState<Parcel | null>(null);
  const [ownerNameInput, setOwnerNameInput] = useState('');

  const [isSearchActive, setIsSearchActive] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isGenMenuOpen, setIsGenMenuOpen] = useState(false);
  const [highlightedParcelId, setHighlightedParcelId] = useState<string | null>(null);

  const [isAdmin, setIsAdmin] = useState(false);
  const [showAdminModal, setShowAdminModal] = useState(false);
  const [adminPassword, setAdminPassword] = useState('');
  const [loginError, setLoginError] = useState(false);

  const [pendingDeleteConnId, setPendingDeleteConnId] = useState<string | null>(null);
  const [pendingDivisionAction, setPendingDivisionAction] = useState<{ parcelId: string, divId: string, type: 'DELETE' | 'EDIT' } | null>(null);
  const [editPercentage, setEditPercentage] = useState<string>('');
  const [showBackupModal, setShowBackupModal] = useState(false);

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
    } else if (mode === 'MANAGE') {
      const parcelId = cycle.map(p => p.id).sort().join(',');
      let parcel = parcels.find(p => p.pointIds.sort().join(',') === parcelId);
      
      if (!parcel) {
        // Create a temporary parcel if it doesn't exist
        parcel = {
          id: Math.random().toString(36).substr(2, 9),
          pointIds: cycle.map(p => p.id),
          ownerName: '',
          divisions: [],
          totalArea: 0 // Will be calculated if needed, but ownerName is the focus here
        };
        // We don't add it to state yet, we'll add it when the owner is saved
      }
      
      setSelectedParcelForOwner(parcel);
      setOwnerNameInput(parcel.ownerName || '');
      setShowOwnerModal(true);
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
    let existingParcel = parcels.find(p => p.pointIds.sort().join(',') === parcelId);
    
    const currentTotal = existingParcel?.divisions.reduce((sum, d) => sum + d.percentage, 0) || 0;
    if (currentTotal + percentage > 100.01) { // Small epsilon for float math
      alert(`خطا: مجموع سهام نمی‌تواند بیش از ۱۰۰٪ باشد. (باقیمانده: ${Math.max(0, 100 - currentTotal).toFixed(1)}٪)`);
      return;
    }

    // For the geometry, we split the *original* cycle but we need to account for previous divisions
    // A better way is to split the remaining polygon, but for this demo, 
    // we'll split the original polygon at (currentTotal + percentage) and subtract the previous split.
    // However, splitPolygon currently returns the *first* part.
    // Let's refine the logic: we split at currentTotal + percentage to get the "cumulative" polygon,
    // then we'd ideally subtract the previous cumulative polygon.
    // For simplicity in this version, we'll just store the cumulative geometry.
    
    const cumulativeGeometry = splitPolygon(selectedCycle, percentage + currentTotal, orientation);
    let finalGeometry = cumulativeGeometry;

    if (currentTotal > 0) {
      const previousCumulativeGeometry = splitPolygon(selectedCycle, currentTotal, orientation);
      const poly1 = turf.polygon([[...cumulativeGeometry.map(c => [c[1], c[0]]), [cumulativeGeometry[0][1], cumulativeGeometry[0][0]]]]);
      const poly2 = turf.polygon([[...previousCumulativeGeometry.map(c => [c[1], c[0]]), [previousCumulativeGeometry[0][1], previousCumulativeGeometry[0][0]]]]);
      const diff = turf.difference(turf.featureCollection([poly1, poly2]));
      
      if (diff) {
        if (diff.geometry.type === 'Polygon') {
          finalGeometry = diff.geometry.coordinates[0].map(c => [c[1], c[0]] as [number, number]);
        } else if (diff.geometry.type === 'MultiPolygon') {
          finalGeometry = diff.geometry.coordinates[0][0].map(c => [c[1], c[0]] as [number, number]);
        }
      }
    }
    
    const newDivision: Division = {
      id: Math.random().toString(36).substr(2, 9),
      partnerId: name,
      percentage,
      geometry: finalGeometry,
      orientation
    };

    if (existingParcel) {
      setParcels(prev => prev.map(p => p.id === existingParcel!.id ? {
        ...p,
        divisions: [...p.divisions, newDivision]
      } : p));
    } else {
      const newParcel: Parcel = {
        id: Math.random().toString(36).substr(2, 9),
        name: `قطعه ${parcels.length + 1}`,
        pointIds: selectedCycle.map(p => p.id),
        divisions: [newDivision],
        area: turf.area(turf.polygon([[...selectedCycle.map(p => [p.lng, p.lat]), [selectedCycle[0].lng, selectedCycle[0].lat]]]))
      };
      setParcels(prev => [...prev, newParcel]);
    }
    setShowDivisionModal(false);
  };

  const handleAiConsult = async (parcel: Parcel) => {
    setIsAiLoading(true);
    setShowAiModal(true);
    try {
      // Mocking heirs for now, in a real app we'd have a form for this
      const report = await geminiService.calculateInheritance({
        totalArea: parcel.area,
        heirs: [
          { name: 'همسر', relation: 'WIFE', count: 1 },
          { name: 'پسران', relation: 'SON', count: 2 },
          { name: 'دختران', relation: 'DAUGHTER', count: 1 }
        ]
      });
      setAiReport(report || "پاسخی دریافت نشد.");
    } catch (err) {
      setAiReport("خطا در ارتباط با هوش مصنوعی.");
    } finally {
      setIsAiLoading(false);
    }
  };

  const recalculateParcelDivisions = (parcel: Parcel, updatedDivisions: Division[]): Parcel => {
    const cycle = parcel.pointIds.map(id => points.find(p => p.id === id)!).filter(Boolean);
    if (cycle.length < 3) return parcel;

    let currentTotal = 0;
    const newDivisions = updatedDivisions.map(div => {
      const cumulativeGeometry = splitPolygon(cycle, div.percentage + currentTotal, div.orientation);
      let finalGeometry = cumulativeGeometry;

      if (currentTotal > 0) {
        const previousCumulativeGeometry = splitPolygon(cycle, currentTotal, div.orientation);
        const poly1 = turf.polygon([[...cumulativeGeometry.map(c => [c[1], c[0]]), [cumulativeGeometry[0][1], cumulativeGeometry[0][0]]]]);
        const poly2 = turf.polygon([[...previousCumulativeGeometry.map(c => [c[1], c[0]]), [previousCumulativeGeometry[0][1], previousCumulativeGeometry[0][0]]]]);
        const diff = turf.difference(turf.featureCollection([poly1, poly2]));
        
        if (diff) {
          if (diff.geometry.type === 'Polygon') {
            finalGeometry = diff.geometry.coordinates[0].map(c => [c[1], c[0]] as [number, number]);
          } else if (diff.geometry.type === 'MultiPolygon') {
            finalGeometry = diff.geometry.coordinates[0][0].map(c => [c[1], c[0]] as [number, number]);
          }
        }
      }

      currentTotal += div.percentage;
      return { ...div, geometry: finalGeometry };
    });

    return { ...parcel, divisions: newDivisions };
  };

  const handleDeleteConnection = () => {
    if (pendingDeleteConnId) {
      setConnections(prev => prev.filter(c => c.id !== pendingDeleteConnId));
      setPendingDeleteConnId(null);
    }
  };

  const handleDeleteDivision = () => {
    if (pendingDivisionAction) {
      const { parcelId, divId } = pendingDivisionAction;
      setParcels(prev => prev.map(p => {
        if (p.id !== parcelId) return p;
        const filteredDivs = p.divisions.filter(d => d.id !== divId);
        return recalculateParcelDivisions(p, filteredDivs);
      }));
      setPendingDivisionAction(null);
    }
  };

  const handleUpdateDivision = () => {
    if (pendingDivisionAction && editPercentage) {
      const { parcelId, divId } = pendingDivisionAction;
      const newPercent = parseFloat(editPercentage);
      
      setParcels(prev => prev.map(p => {
        if (p.id !== parcelId) return p;
        
        const otherDivsTotal = p.divisions
          .filter(d => d.id !== divId)
          .reduce((sum, d) => sum + d.percentage, 0);
          
        if (otherDivsTotal + newPercent > 100.01) {
          alert("خطا: مجموع سهام نمی‌تواند بیش از ۱۰۰٪ باشد.");
          return p;
        }

        const updatedDivs = p.divisions.map(d => 
          d.id === divId ? { ...d, percentage: newPercent } : d
        );
        
        return recalculateParcelDivisions(p, updatedDivs);
      }));
      setPendingDivisionAction(null);
      setEditPercentage('');
    }
  };

  const handleUpdateOwner = () => {
    if (selectedParcelForOwner) {
      setParcels(prev => {
        const exists = prev.some(p => p.id === selectedParcelForOwner.id);
        if (exists) {
          return prev.map(p => 
            p.id === selectedParcelForOwner.id ? { ...p, ownerName: ownerNameInput } : p
          );
        } else {
          // Add the new parcel
          return [...prev, { ...selectedParcelForOwner, ownerName: ownerNameInput }];
        }
      });
      setShowOwnerModal(false);
      setSelectedParcelForOwner(null);
      setOwnerNameInput('');
    }
  };

  const handleRestore = (data: { points: Point[]; connections: Connection[]; parcels: Parcel[] }) => {
    setPoints(data.points);
    setConnections(data.connections);
    setParcels(data.parcels);
  };

  const startUpdate = () => {
    setIsUpdating(true);
    setShowRecorder(true);
  };

  const selectedPoint = points.find(p => p.id === selectedPointId);

  return (
    <div className="flex flex-col h-screen w-full bg-slate-50 overflow-hidden font-sans" dir="rtl">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 px-4 py-2 flex items-center justify-between shadow-sm z-10">
        <div className="flex items-center gap-2">
           {/* Expandable Generation Menu */}
           <div className="relative">
             <button
               onClick={() => setIsGenMenuOpen(!isGenMenuOpen)}
               className="flex items-center gap-2 px-3 py-2 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-2xl text-xs font-bold text-slate-700 transition-all shadow-sm"
             >
               <span>نسل {generationFilter}</span>
               <ChevronDown className={cn("w-4 h-4 transition-transform", isGenMenuOpen && "rotate-180")} />
             </button>

             <AnimatePresence>
               {isGenMenuOpen && (
                 <motion.div
                   initial={{ opacity: 0, y: -10 }}
                   animate={{ opacity: 1, y: 0 }}
                   exit={{ opacity: 0, y: -10 }}
                   className="absolute top-full right-0 mt-2 bg-white border border-slate-100 rounded-2xl shadow-xl z-50 overflow-hidden min-w-[120px]"
                 >
                   {[1, 2, 3].map(gen => (
                     <button
                       key={gen}
                       onClick={() => {
                         setGenerationFilter(gen);
                         setIsGenMenuOpen(false);
                       }}
                       className={cn(
                         "w-full px-4 py-3 text-right text-xs font-bold transition-colors flex items-center justify-between",
                         generationFilter === gen ? "bg-indigo-50 text-indigo-600" : "text-slate-600 hover:bg-slate-50"
                       )}
                     >
                       <span>نسل {gen}</span>
                       {generationFilter === gen && <CheckCircle2 className="w-3 h-3" />}
                     </button>
                   ))}
                 </motion.div>
               )}
             </AnimatePresence>
           </div>
        </div>

        <div className="flex items-center gap-1 sm:gap-2">
           <button 
             onClick={() => {
               setIsSearchActive(!isSearchActive);
               if (isSearchActive) {
                 setSearchQuery('');
                 setHighlightedParcelId(null);
               }
             }}
             className={cn(
               "p-2 rounded-full transition-colors",
               isSearchActive ? "bg-amber-100 text-amber-600" : "text-slate-500 hover:bg-slate-100"
             )}
             title="جستجوی مالک"
           >
             {isSearchActive ? <SearchX className="w-5 h-5" /> : <Search className="w-5 h-5" />}
           </button>

           <button 
             onClick={() => setShowBackupModal(true)}
             className="p-2 rounded-full text-slate-500 hover:bg-slate-100 transition-colors"
             title="پشتیبان‌گیری"
           >
             <Database className="w-5 h-5" />
           </button>

           {isAdmin && (
             <div className="flex items-center gap-1">
               <button 
                 onClick={() => setMode(mode === 'MANAGE' ? 'VIEW' : 'MANAGE')}
                 className={cn(
                   "p-2 rounded-full transition-colors",
                   mode === 'MANAGE' ? "bg-indigo-100 text-indigo-600" : "text-slate-500 hover:bg-slate-100"
                 )}
                 title="مدیریت مالکین"
               >
                 <UserCog className="w-5 h-5" />
               </button>
               
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
             </div>
           )}

           <button 
             onClick={() => {
               if (isAdmin) {
                 setIsAdmin(false);
                 setMode('VIEW');
               } else {
                 setShowAdminModal(true);
               }
             }}
             className={cn(
               "p-2 rounded-full transition-all duration-300",
               isAdmin ? "bg-emerald-100 text-emerald-600" : "bg-slate-100 text-slate-400 hover:bg-slate-200"
             )}
             title={isAdmin ? "خروج از مدیریت" : "ورود مدیر"}
           >
             {isAdmin ? <ShieldCheck className="w-5 h-5" /> : <Lock className="w-5 h-5" />}
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
          onMapClick={() => {
            setSelectedPointId(null);
            if (isSearchActive && !searchQuery) setIsSearchActive(false);
          }}
          onConnectionClick={handleConnectionClick}
          onConnectionLongPress={(id) => mode === 'CONNECT' && setPendingDeleteConnId(id)}
          onPolygonClick={handlePolygonClick}
          onDivisionLongPress={(pId, dId) => setPendingDivisionAction({ parcelId: pId, divId: dId, type: 'DELETE' })}
          userLocation={userLocation}
          showUserLocation={showUserLocation}
          selectedPointId={selectedPointId}
          centerTrigger={centerTrigger}
          parcels={parcels}
          generationFilter={generationFilter}
          highlightedParcelId={highlightedParcelId}
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
          
          {isAdmin && (
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
          )}
          
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
        <div className="absolute bottom-8 left-0 right-0 flex flex-col items-center px-4 z-[1000] gap-3">
          <AnimatePresence>
            {isSearchActive && searchQuery.length > 0 && (
              <motion.div 
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: 20, opacity: 0 }}
                className="bg-white/95 backdrop-blur-md border border-slate-200 rounded-3xl shadow-2xl w-full max-w-md overflow-hidden max-h-60 overflow-y-auto"
              >
                {parcels.filter(p => p.ownerName?.toLowerCase().includes(searchQuery.toLowerCase())).length > 0 ? (
                  parcels
                    .filter(p => p.ownerName?.toLowerCase().includes(searchQuery.toLowerCase()))
                    .map(parcel => (
                      <button
                        key={parcel.id}
                        onClick={() => {
                          setHighlightedParcelId(parcel.id);
                          setCenterTrigger(prev => prev + 1);
                          // Zoom to parcel logic: we need to find the center of the parcel
                          // MapView handles centering via centerTrigger, but we need to tell it which point to center on
                          // For now, MapView centers on user location if available, or just triggers a re-render
                          // I'll update MapView to handle centering on a specific parcel if highlightedParcelId is set
                        }}
                        className={cn(
                          "w-full px-5 py-4 text-right flex items-center justify-between border-b border-slate-50 last:border-0 hover:bg-slate-50 transition-colors",
                          highlightedParcelId === parcel.id ? "bg-emerald-50 text-emerald-700" : "text-slate-700"
                        )}
                      >
                        <div className="flex flex-col items-start text-right w-full">
                          <span className="font-bold text-sm">{parcel.ownerName}</span>
                          <span className="text-[10px] text-slate-400">قطعه زمین شماره {parcel.id.slice(0, 4)}</span>
                        </div>
                        <Navigation className="w-4 h-4 text-slate-300" />
                      </button>
                    ))
                ) : (
                  <div className="p-8 text-center text-slate-400 text-sm">
                    مالکی با این نام پیدا نشد
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>

          <div className={cn(
            "bg-white/90 backdrop-blur-md border border-white/20 p-2 rounded-3xl shadow-2xl flex items-center gap-2 transition-all duration-500",
            (!isSearchActive && !isAdmin) ? "w-fit px-4" : "max-w-md w-full"
          )}>
            {!isSearchActive ? (
              isAdmin && (
                <button 
                  onClick={() => { setIsUpdating(false); setShowRecorder(true); }}
                  className="flex-1 flex items-center justify-center gap-2 py-4 bg-emerald-600 text-white rounded-2xl font-bold shadow-lg shadow-emerald-200 transition-all active:scale-95"
                >
                  <Crosshair className="w-5 h-5" />
                  ثبت مختصات دقیق
                </button>
              )
            ) : (
              <div className="flex-1 flex items-center gap-2 px-4 py-1 bg-slate-100 rounded-2xl border border-slate-200/50">
                <Search className="w-5 h-5 text-slate-400" />
                <input 
                  type="text"
                  autoFocus
                  placeholder="جستجوی نام مالک..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="flex-1 py-3 bg-transparent border-none outline-none text-sm font-bold text-slate-700 placeholder:text-slate-400 text-right"
                  dir="rtl"
                />
                {searchQuery && (
                  <button onClick={() => { setSearchQuery(''); setHighlightedParcelId(null); }}>
                    <X className="w-4 h-4 text-slate-400" />
                  </button>
                )}
              </div>
            )}
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
              
              {isAdmin && (
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
              )}
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
                {/* AI Suggestion Button */}
                {selectedCycle && (
                  <button 
                    onClick={() => {
                      const parcelId = selectedCycle.map(p => p.id).sort().join(',');
                      const p = parcels.find(p => p.pointIds.sort().join(',') === parcelId);
                      if (p) handleAiConsult(p);
                      else {
                         // Create a temporary parcel for AI consult
                         const tempParcel: Parcel = {
                           id: 'temp',
                           name: 'موقت',
                           pointIds: selectedCycle.map(pt => pt.id),
                           divisions: [],
                           area: turf.area(turf.polygon([[...selectedCycle.map(pt => [pt.lng, pt.lat]), [selectedCycle[0].lng, selectedCycle[0].lat]]]))
                         };
                         handleAiConsult(tempParcel);
                      }
                    }}
                    className="w-full mb-6 py-3 bg-gradient-to-r from-indigo-600 to-violet-600 text-white rounded-2xl font-bold flex items-center justify-center gap-2 shadow-lg shadow-indigo-100"
                  >
                    <Activity className="w-4 h-4" />
                    مشاوره هوشمند تقسیم ارث (AI)
                  </button>
                )}

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
      {/* Project Info Modal */}
      <AnimatePresence>
        {showProjectInfo && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[2000] flex items-center justify-center p-4" dir="rtl">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-[32px] shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[80vh]"
            >
              <div className="p-6 border-b border-slate-100 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="bg-emerald-100 p-2 rounded-xl">
                    <Info className="w-6 h-6 text-emerald-600" />
                  </div>
                  <h2 className="text-xl font-bold text-slate-900">اطلاعات کلی پروژه</h2>
                </div>
                <button onClick={() => setShowProjectInfo(false)} className="p-2 hover:bg-slate-100 rounded-full">
                  <X className="w-5 h-5 text-slate-400" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-6 space-y-6">
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
                    <span className="text-[10px] text-slate-500 block mb-1">تعداد نقاط ثبت شده</span>
                    <span className="text-xl font-bold text-slate-900">{points.length} نقطه</span>
                  </div>
                  <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
                    <span className="text-[10px] text-slate-500 block mb-1">تعداد قطعات شناسایی شده</span>
                    <span className="text-xl font-bold text-slate-900">{parcels.length} قطعه</span>
                  </div>
                </div>

                {parcels.length > 0 ? (
                  <div className="space-y-4">
                    <h3 className="font-bold text-slate-800 text-sm">لیست قطعات و تقسیمات:</h3>
                    {parcels.map((parcel, idx) => (
                      <div key={parcel.id} className="border border-slate-100 rounded-2xl p-4 bg-white shadow-sm">
                        <div className="flex justify-between items-center mb-3">
                          <span className="font-bold text-slate-900">{parcel.name}</span>
                          <span className="text-xs font-mono text-emerald-600 bg-emerald-50 px-2 py-1 rounded-lg">
                            {parcel.area.toLocaleString('fa-IR', { maximumFractionDigits: 1 })} m²
                          </span>
                        </div>
                        
                        {parcel.divisions.length > 0 ? (
                          <div className="space-y-2">
                            {parcel.divisions.map(div => (
                              <div key={div.id} className="flex justify-between items-center text-xs bg-slate-50 p-2 rounded-xl">
                                <span className="text-slate-700">{div.partnerId}</span>
                                <div className="flex items-center gap-2">
                                  <span className="font-bold text-blue-600">{div.percentage}%</span>
                                  <span className="text-slate-400">({(parcel.area * div.percentage / 100).toLocaleString('fa-IR', { maximumFractionDigits: 1 })} m²)</span>
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="text-[10px] text-slate-400 italic">هنوز تقسیمی برای این قطعه ثبت نشده است.</p>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-12">
                    <div className="bg-slate-50 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                      <Layers className="w-8 h-8 text-slate-300" />
                    </div>
                    <p className="text-sm text-slate-500">هنوز هیچ قطعه‌ای (Polygon) ایجاد نشده است. نقاط را به هم متصل کنید تا قطعات شکل بگیرند.</p>
                  </div>
                )}
              </div>

              <div className="p-6 bg-slate-50 border-t border-slate-100">
                <button 
                  onClick={() => setShowProjectInfo(false)}
                  className="w-full py-4 bg-slate-900 text-white rounded-2xl font-bold shadow-xl active:scale-95 transition-all"
                >
                  بستن
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* AI Modal */}
      <AnimatePresence>
        {showAiModal && (
          <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-md z-[3000] flex items-center justify-center p-4" dir="rtl">
            <motion.div 
              initial={{ y: 50, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 50, opacity: 0 }}
              className="bg-white rounded-[40px] shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col overflow-hidden"
            >
              <div className="p-8 border-b border-slate-100 flex items-center justify-between bg-indigo-50/50">
                <div className="flex items-center gap-4">
                  <div className="bg-indigo-600 p-3 rounded-2xl shadow-lg shadow-indigo-200">
                    <Activity className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <h2 className="text-2xl font-black text-slate-900">مشاور هوشمند مرزبان</h2>
                    <p className="text-sm text-indigo-600 font-bold">تحلیل فقهی و حقوقی تقسیم اراضی</p>
                  </div>
                </div>
                <button onClick={() => setShowAiModal(false)} className="p-3 hover:bg-white rounded-full transition-colors shadow-sm">
                  <X className="w-6 h-6 text-slate-400" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-8 bg-slate-50/50">
                {isAiLoading ? (
                  <div className="flex flex-col items-center justify-center h-64 gap-6">
                    <div className="relative">
                      <div className="w-16 h-16 border-4 border-indigo-100 border-t-indigo-600 rounded-full animate-spin" />
                      <Activity className="absolute inset-0 m-auto w-6 h-6 text-indigo-600 animate-pulse" />
                    </div>
                    <div className="text-center">
                      <p className="text-lg font-bold text-slate-800">در حال تحلیل قوانین و محاسبات...</p>
                      <p className="text-sm text-slate-500 mt-1">این فرآیند ممکن است چند لحظه زمان ببرد</p>
                    </div>
                  </div>
                ) : (
                  <div className="prose prose-slate max-w-none">
                    <div className="bg-white p-6 rounded-3xl border border-indigo-100 shadow-sm leading-relaxed text-slate-700 whitespace-pre-wrap font-medium">
                      {aiReport}
                    </div>
                    
                    <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="bg-emerald-50 p-4 rounded-2xl border border-emerald-100">
                        <h4 className="font-bold text-emerald-800 text-sm mb-1">توصیه فنی</h4>
                        <p className="text-xs text-emerald-700">برای دقت بیشتر، حتماً نقاط مرزی را در ساعات اولیه روز که سیگنال GPS پایدارتر است ثبت کنید.</p>
                      </div>
                      <div className="bg-amber-50 p-4 rounded-2xl border border-amber-100">
                        <h4 className="font-bold text-amber-800 text-sm mb-1">نکته حقوقی</h4>
                        <p className="text-xs text-amber-700">این محاسبات جنبه مشورتی دارد. برای رسمیت قانونی، تاییدیه مراجع ذی‌صلاح الزامی است.</p>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div className="p-6 bg-white border-t border-slate-100 flex justify-end">
                <button 
                  onClick={() => setShowAiModal(false)}
                  className="px-8 py-4 bg-slate-900 text-white rounded-2xl font-bold shadow-xl active:scale-95 transition-all"
                >
                  متوجه شدم
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Owner Modal */}
      <AnimatePresence>
        {showOwnerModal && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[3000] flex items-center justify-center p-4" dir="rtl">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-[32px] shadow-2xl w-full max-w-md overflow-hidden"
            >
              <div className="p-6 border-b border-slate-100 flex items-center justify-between">
                <h2 className="text-xl font-bold text-slate-900">مدیریت مالک قطعه</h2>
                <button onClick={() => setShowOwnerModal(false)} className="p-2 hover:bg-slate-100 rounded-full">
                  <X className="w-5 h-5 text-slate-400" />
                </button>
              </div>

              <div className="p-8 space-y-6">
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-2">نام مالک زمین</label>
                  <input 
                    type="text"
                    value={ownerNameInput}
                    onChange={(e) => setOwnerNameInput(e.target.value)}
                    className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl px-4 py-4 focus:border-indigo-500 focus:outline-none transition-colors text-lg"
                    placeholder="مثلاً: پدربزرگ (حاج محمد)"
                    autoFocus
                  />
                </div>
                
                <div className="grid grid-cols-2 gap-3">
                  <button 
                    onClick={() => {
                      setOwnerNameInput('');
                      handleUpdateOwner();
                    }}
                    className="py-4 bg-slate-100 text-rose-600 rounded-2xl font-bold hover:bg-rose-50 transition-colors"
                  >
                    حذف نام
                  </button>
                  <button 
                    onClick={handleUpdateOwner}
                    className="py-4 bg-indigo-600 text-white rounded-2xl font-bold shadow-lg shadow-indigo-100 hover:bg-indigo-700 transition-all active:scale-95"
                  >
                    ثبت نام مالک
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Admin Login Modal */}
      <AnimatePresence>
        {showAdminModal && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[5000] flex items-center justify-center p-4" dir="rtl">
            <motion.div 
              initial={{ scale: 0.9, y: 20, opacity: 0 }}
              animate={{ scale: 1, y: 0, opacity: 1 }}
              exit={{ scale: 0.9, y: 20, opacity: 0 }}
              className="bg-white rounded-[40px] shadow-2xl w-full max-w-md overflow-hidden border border-white/20"
            >
              <div className="p-8 text-center bg-gradient-to-b from-slate-50 to-white">
                <div className="w-20 h-20 bg-indigo-100 rounded-3xl flex items-center justify-center mx-auto mb-6 shadow-inner">
                  <KeyRound className="w-10 h-10 text-indigo-600" />
                </div>
                <h2 className="text-2xl font-black text-slate-900 mb-2">ورود به پنل مدیریت</h2>
                <p className="text-slate-500 text-sm">برای دسترسی به ابزارهای ویرایشی، رمز عبور را وارد کنید</p>
              </div>

              <div className="p-8 pt-0 space-y-6">
                <div className="relative">
                  <input 
                    type="password"
                    value={adminPassword}
                    onChange={(e) => {
                      setAdminPassword(e.target.value);
                      setLoginError(false);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        if (adminPassword === 'Alliwali@1264') {
                          setIsAdmin(true);
                          setShowAdminModal(false);
                          setAdminPassword('');
                        } else {
                          setLoginError(true);
                        }
                      }
                    }}
                    className={cn(
                      "w-full bg-slate-50 border-2 rounded-3xl px-6 py-5 focus:outline-none transition-all text-center text-2xl tracking-[0.5em] font-mono",
                      loginError ? "border-rose-500 bg-rose-50 text-rose-600" : "border-slate-100 focus:border-indigo-500 text-slate-900"
                    )}
                    placeholder="••••••••"
                    autoFocus
                  />
                  {loginError && (
                    <motion.p 
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="text-rose-500 text-xs font-bold mt-3 text-center"
                    >
                      رمز عبور اشتباه است. دوباره تلاش کنید.
                    </motion.p>
                  )}
                </div>
                
                <div className="grid grid-cols-1 gap-3">
                  <button 
                    onClick={() => {
                      if (adminPassword === 'Alliwali@1264') {
                        setIsAdmin(true);
                        setShowAdminModal(false);
                        setAdminPassword('');
                      } else {
                        setLoginError(true);
                      }
                    }}
                    className="py-5 bg-indigo-600 text-white rounded-[24px] font-bold shadow-xl shadow-indigo-200 hover:bg-indigo-700 transition-all active:scale-95 flex items-center justify-center gap-2"
                  >
                    <ShieldCheck className="w-5 h-5" />
                    تایید و ورود
                  </button>
                  <button 
                    onClick={() => {
                      setShowAdminModal(false);
                      setAdminPassword('');
                      setLoginError(false);
                    }}
                    className="py-4 text-slate-400 font-bold hover:text-slate-600 transition-colors"
                  >
                    انصراف
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Delete Connection Modal */}
      <AnimatePresence>
        {pendingDeleteConnId && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[3000] flex items-center justify-center p-4" dir="rtl">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-[32px] shadow-2xl w-full max-w-sm p-8 text-center"
            >
              <div className="bg-rose-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-6">
                <Scissors className="w-8 h-8 text-rose-600" />
              </div>
              <h2 className="text-xl font-bold text-slate-900 mb-2">قطع اتصال مرزی</h2>
              <p className="text-slate-500 text-sm mb-8">آیا از حذف این اتصال و شکستن مرز اطمینان دارید؟</p>
              
              <div className="grid grid-cols-2 gap-3">
                <button 
                  onClick={() => setPendingDeleteConnId(null)}
                  className="py-4 bg-slate-100 text-slate-600 rounded-2xl font-bold hover:bg-slate-200 transition-colors"
                >
                  انصراف
                </button>
                <button 
                  onClick={handleDeleteConnection}
                  className="py-4 bg-rose-600 text-white rounded-2xl font-bold shadow-lg shadow-rose-100 hover:bg-rose-700 transition-all active:scale-95"
                >
                  قطع اتصال
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Division Action Modal (Delete/Edit) */}
      <AnimatePresence>
        {pendingDivisionAction && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[3000] flex items-center justify-center p-4" dir="rtl">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-[32px] shadow-2xl w-full max-w-md overflow-hidden"
            >
              <div className="p-6 border-b border-slate-100 flex items-center justify-between">
                <h2 className="text-xl font-bold text-slate-900">مدیریت سهم اراضی</h2>
                <button onClick={() => setPendingDivisionAction(null)} className="p-2 hover:bg-slate-100 rounded-full">
                  <X className="w-5 h-5 text-slate-400" />
                </button>
              </div>

              <div className="p-8">
                {pendingDivisionAction.type === 'DELETE' ? (
                  <div className="text-center">
                    <div className="bg-rose-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-6">
                      <Trash2 className="w-8 h-8 text-rose-600" />
                    </div>
                    <p className="text-slate-700 font-medium mb-8">آیا مایل به حذف کامل این سهم از قطعه زمین هستید؟</p>
                    
                    <div className="grid grid-cols-2 gap-3">
                      <button 
                        onClick={() => setPendingDivisionAction(prev => prev ? { ...prev, type: 'EDIT' } : null)}
                        className="py-4 bg-blue-50 text-blue-600 rounded-2xl font-bold hover:bg-blue-100 transition-colors flex items-center justify-center gap-2"
                      >
                        <RotateCw className="w-5 h-5" />
                        ویرایش درصد
                      </button>
                      <button 
                        onClick={handleDeleteDivision}
                        className="py-4 bg-rose-600 text-white rounded-2xl font-bold shadow-lg shadow-rose-100 hover:bg-rose-700 transition-all active:scale-95"
                      >
                        حذف قطعی
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-6">
                    <div>
                      <label className="block text-sm font-bold text-slate-700 mb-2">درصد جدید سهم (٪)</label>
                      <input 
                        type="number"
                        value={editPercentage}
                        onChange={(e) => setEditPercentage(e.target.value)}
                        className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl px-4 py-4 focus:border-blue-500 focus:outline-none transition-colors text-xl font-mono"
                        placeholder="مثلاً: ۲۵"
                        autoFocus
                      />
                    </div>
                    
                    <div className="grid grid-cols-2 gap-3">
                      <button 
                        onClick={() => setPendingDivisionAction(prev => prev ? { ...prev, type: 'DELETE' } : null)}
                        className="py-4 bg-slate-100 text-slate-600 rounded-2xl font-bold hover:bg-slate-200 transition-colors"
                      >
                        بازگشت
                      </button>
                      <button 
                        onClick={handleUpdateDivision}
                        className="py-4 bg-blue-600 text-white rounded-2xl font-bold shadow-lg shadow-blue-100 hover:bg-blue-700 transition-all active:scale-95"
                      >
                        بروزرسانی سهم
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Backup Modal */}
      <BackupModal 
        isOpen={showBackupModal}
        onClose={() => setShowBackupModal(false)}
        points={points}
        connections={connections}
        parcels={parcels}
        onRestore={handleRestore}
      />
    </div>
  );
}
