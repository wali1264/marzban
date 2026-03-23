/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
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
  Database,
  Zap,
  RotateCcw,
  Printer,
  Bluetooth,
  Cpu,
  Wifi
} from 'lucide-react';
import * as turf from '@turf/turf';
import { findCycles, calculatePolygonArea } from './utils';
import MapView from './components/Map/MapView';
import PrecisionRecorder from './components/Recorder/PrecisionRecorder';
import BackupModal from './components/Backup/BackupModal';
import ConvertModal from './components/Convert/ConvertModal';
import DigitalCertificateModal from './components/Map/DigitalCertificateModal';
import { RotationModal } from './components/Map/RotationModal';
import GNSSSettings from './components/GNSS/GNSSSettings';
import { Point, Connection, AppMode, Parcel, Partner, Division, GNSSConfig, GNSSStatus } from './types';
import { cn } from './utils';
import { geminiService } from './services/gemini';
import { GNSSBluetoothManager, parseGPGGA } from './services/gnssService';

export default function App() {
  const [points, setPoints] = useState<Point[]>([]);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [mode, setMode] = useState<AppMode>('VIEW');
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number; accuracy: number }>();
  const [rawLocation, setRawLocation] = useState<{ lat: number; lng: number; accuracy: number }>();
  const locationBuffer = useRef<{ lat: number; lng: number }[]>([]);
  const MAX_BUFFER_SIZE = 5; // Average over last 5 points for smoothing
  const [selectedPointId, setSelectedPointId] = useState<string | null>(null);
  const [trackingTargetId, setTrackingTargetId] = useState<string | null>(null);
  const [showRecorder, setShowRecorder] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [centerTrigger, setCenterTrigger] = useState(0);
  const [showUserLocation, setShowUserLocation] = useState(false);

  const [parcels, setParcels] = useState<Parcel[]>([]);
  
  const getParcelChildren = (parent: Parcel, all: Parcel[], pts: Point[]) => {
    const parentCycle = parent.pointIds.map(id => pts.find(p => p.id === id)!).filter(Boolean);
    if (parentCycle.length < 3) return [];
    const parentCoords = [...parentCycle.map(p => [p.lng, p.lat]), [parentCycle[0].lng, parentCycle[0].lat]];
    const parentPoly = turf.polygon([parentCoords as any]);

    return all.filter(other => {
      if (other.id === parent.id) return false;
      const otherCycle = other.pointIds.map(id => pts.find(p => p.id === id)!).filter(Boolean);
      if (otherCycle.length < 3) return false;
      const otherCoords = [...otherCycle.map(p => [p.lng, p.lat]), [otherCycle[0].lng, otherCycle[0].lat]];
      const otherPoly = turf.polygon([otherCoords as any]);
      try {
        // Use a tiny buffer to avoid edge issues
        return turf.booleanContains(parentPoly, otherPoly);
      } catch (e) {
        return false;
      }
    });
  };

  const canDeleteConnection = (connId: string) => {
    const conn = connections.find(c => c.id === connId);
    if (!conn) return true;

    // Find parcels that use this connection
    const affectedParcels = parcels.filter(p => {
      const pIds = p.pointIds;
      for (let i = 0; i < pIds.length; i++) {
        const from = pIds[i];
        const to = pIds[(i + 1) % pIds.length];
        if ((from === conn.fromId && to === conn.toId) || (from === conn.toId && to === conn.fromId)) {
          return true;
        }
      }
      return false;
    });

    if (affectedParcels.length === 0) return true;

    // Rule 1: If any affected parcel has children, it's unbreakable
    for (const p of affectedParcels) {
      const children = getParcelChildren(p, parcels, points);
      if (children.length > 0) {
        alert("این مرز به دلیل وجود واحدهای نسل بعدی (فرزند) قابل شکستن نیست. ابتدا واحدهای داخلی را مدیریت کنید.");
        return false;
      }
    }

    return true;
  };

  // Clean up parcels that are no longer valid cycles
  useEffect(() => {
    if (points.length === 0 || connections.length === 0) {
      if (parcels.length > 0) setParcels([]);
      return;
    }
    
    const currentCycles = findCycles(points, connections);
    const cycleIdsToPoints = new Map(currentCycles.map(cycle => [cycle.map(p => p.id).sort().join(','), cycle]));
    const cycleIds = new Set(cycleIdsToPoints.keys());
    
    setParcels(prev => {
      // 1. Keep existing parcels that are still valid
      const stillValid = prev.filter(p => cycleIds.has(p.pointIds.sort().join(',')));
      
      // 2. Identify new cycles
      const existingCycleIds = new Set(prev.map(p => p.pointIds.sort().join(',')));
      const newCycleIds = Array.from(cycleIds).filter(id => !existingCycleIds.has(id));
      
      if (newCycleIds.length === 0) {
        if (stillValid.length !== prev.length) return stillValid;
        return prev;
      }

      // 3. For new cycles, check if they were formed by merging old ones
      const mergedParcels: Parcel[] = [];
      newCycleIds.forEach(id => {
        const cyclePoints = cycleIdsToPoints.get(id)!;
        const coords = [...cyclePoints.map(p => [p.lng, p.lat]), [cyclePoints[0].lng, cyclePoints[0].lat]];
        const newPoly = turf.polygon([coords as any]);
        
        // Find old parcels that are now contained within this new cycle
        const mergedFrom = prev.filter(old => {
          const oldCycle = old.pointIds.map(pid => points.find(p => p.id === pid)!).filter(Boolean);
          if (oldCycle.length < 3) return false;
          const oldCoords = [...oldCycle.map(p => [p.lng, p.lat]), [oldCycle[0].lng, oldCycle[0].lat]];
          const oldPoly = turf.polygon([oldCoords as any]);
          try {
            return turf.booleanContains(newPoly, oldPoly);
          } catch (e) { return false; }
        });

        if (mergedFrom.length > 0) {
          // Rule: Inherit metadata from the oldest one (First-Child Priority)
          const oldest = [...mergedFrom].sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0))[0];
          mergedParcels.push({
            ...oldest,
            pointIds: cyclePoints.map(p => p.id),
            area: calculatePolygonArea(cyclePoints),
            generation: getGenerationForParcel(cyclePoints.map(p => p.id), prev)
          });
        }
      });

      const nextParcels = [...stillValid, ...mergedParcels];
      return nextParcels;
    });
  }, [connections, points]);

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
  const [isPrintMode, setIsPrintMode] = useState(false);
  const [selectedParcelForCertificate, setSelectedParcelForCertificate] = useState<Parcel | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isGenMenuOpen, setIsGenMenuOpen] = useState(false);
  const [highlightedParcelId, setHighlightedParcelId] = useState<string | null>(null);

  const [isAdmin, setIsAdmin] = useState(true);
  const [showAdminModal, setShowAdminModal] = useState(false);
  const [isAreaMode, setIsAreaMode] = useState(false);
  const [isEditAreaMode, setIsEditAreaMode] = useState(false);
  const [shareInputValue, setShareInputValue] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [showResetMenu, setShowResetMenu] = useState(false);

  const getGenerationForParcel = (pointIds: string[], currentParcels: Parcel[]) => {
    const cycle = pointIds.map(id => points.find(p => p.id === id)!).filter(Boolean);
    if (cycle.length < 3) return 1;
    
    const coords = [...cycle.map(p => [p.lng, p.lat]), [cycle[0].lng, cycle[0].lat]];
    const poly = turf.polygon([coords as any]);
    
    let containers = 0;
    currentParcels.forEach(other => {
      if (other.pointIds.sort().join(',') === pointIds.sort().join(',')) return;
      
      const otherCycle = other.pointIds.map(id => points.find(p => p.id === id)!).filter(Boolean);
      if (otherCycle.length < 3) return;

      const otherCoords = [...otherCycle.map(p => [p.lng, p.lat]), [otherCycle[0].lng, otherCycle[0].lat]];
      const otherPoly = turf.polygon([otherCoords as any]);
      
      try {
        // Use a tiny buffer to avoid edge issues
        if (turf.booleanContains(otherPoly, poly)) {
          containers++;
        }
      } catch (e) {}
    });
    
    return containers + 1;
  };

  const handleReset = (gen: number) => {
    const confirmMsg = gen === 1 
      ? "آیا از ریست کامل (تمام نسل‌ها) اطمینان دارید؟ مختصات باقی می‌مانند اما تمام خطوط و نام‌ها پاک می‌شوند."
      : `آیا از ریست نسل ${gen} و زیرمجموعه‌های آن اطمینان دارید؟ نسل‌های بالاتر دست‌نخورده باقی می‌مانند.`;

    if (confirm(confirmMsg)) {
      if (gen === 1) {
        setConnections([]);
        setParcels([]);
      } else {
        const keepThreshold = gen - 1;
        
        // 1. Remove parcels of this generation or higher
        const filteredParcels = parcels.filter(p => (p.generation || 1) <= keepThreshold);
        
        // 2. Clear divisions from parcels that remain
        const resetParcels = filteredParcels.map(p => ({
          ...p,
          divisions: []
        }));

        setParcels(resetParcels);

        // 3. Remove connections that are not part of any remaining parcel
        const keepConnIds = new Set<string>();
        resetParcels.forEach(p => {
          for (let i = 0; i < p.pointIds.length; i++) {
            const p1 = p.pointIds[i];
            const p2 = p.pointIds[(i + 1) % p.pointIds.length];
            const conn = connections.find(c => 
              (c.fromId === p1 && c.toId === p2) || 
              (c.fromId === p2 && c.toId === p1)
            );
            if (conn) keepConnIds.add(conn.id);
          }
        });
        
        setConnections(prev => prev.filter(c => keepConnIds.has(c.id)));
      }
      setShowResetMenu(false);
    }
  };

  const handleRefreshSync = () => {
    setParcels(prev => {
      const updated = prev.map(p => {
        const parcelPoints = p.pointIds.map(id => points.find(pt => pt.id === id)!).filter(Boolean);
        if (parcelPoints.length < 3) return p;
        return {
          ...p,
          area: calculatePolygonArea(parcelPoints),
          generation: getGenerationForParcel(p.pointIds, prev)
        };
      });
      return updated;
    });
    alert("تمام مساحت‌ها و نسل‌ها با موفقیت بازنگری و همگام‌سازی شدند.");
    setShowResetMenu(false);
  };
  const [loginError, setLoginError] = useState(false);

  const [pendingDeleteConnId, setPendingDeleteConnId] = useState<string | null>(null);
  const [pendingDivisionAction, setPendingDivisionAction] = useState<{ parcelId: string, divId: string, type: 'DELETE' | 'EDIT' } | null>(null);
  const [editPercentage, setEditPercentage] = useState<string>('');
  const [showBackupModal, setShowBackupModal] = useState(false);
  const [showRotationModal, setShowRotationModal] = useState(false);
  const [selectedParcelForRotation, setSelectedParcelForRotation] = useState<Parcel | null>(null);
  const [rotationAngle, setRotationAngle] = useState(0);
  
  const [showConvertModal, setShowConvertModal] = useState(false);
  const [selectedParcelForConversion, setSelectedParcelForConversion] = useState<Parcel | null>(null);
  const [selectedDivisionForConversion, setSelectedDivisionForConversion] = useState<Division | null>(null);

  const [gnssConfig, setGnssConfig] = useState<GNSSConfig>({
    source: 'INTERNAL'
  });
  const [gnssStatus, setGnssStatus] = useState<GNSSStatus>({
    connected: false,
    fixType: 'NONE',
    satellites: 0,
    hdop: 0,
    lat: 0,
    lng: 0,
    altitude: 0,
    accuracy: 0,
    timestamp: 0
  });

  const gnssManager = useMemo(() => new GNSSBluetoothManager(), []);

  const APP_VERSION = '1.1.0';

  // Load from local storage on mount
  useEffect(() => {
    const savedPoints = localStorage.getItem('marzban_points');
    const savedConnections = localStorage.getItem('marzban_connections');
    const savedParcels = localStorage.getItem('marzban_parcels');
    const savedVersion = localStorage.getItem('marzban_version');

    let parsedPoints: Point[] = savedPoints ? JSON.parse(savedPoints) : [];
    let parsedConnections: Connection[] = savedConnections ? JSON.parse(savedConnections) : [];
    let parsedParcels: Parcel[] = savedParcels ? JSON.parse(savedParcels) : [];

    // Data Sanitization & Migration
    let needsSave = false;
    parsedParcels = parsedParcels.map((p: any) => {
      let updated = false;
      // Ensure area exists
      if (p.area === undefined || p.area === null) {
        try {
          const cycle = p.pointIds.map((id: string) => parsedPoints.find((pt: any) => pt.id === id)).filter(Boolean);
          if (cycle.length >= 3) {
            const poly = turf.polygon([[...cycle.map((pt: any) => [pt.lng, pt.lat]), [cycle[0].lng, cycle[0].lat]]]);
            p.area = turf.area(poly);
          } else {
            p.area = 0;
          }
        } catch (e) {
          p.area = 0;
        }
        updated = true;
      }
      // Ensure generation exists
      if (p.generation === undefined || p.generation === null) {
        p.generation = 1;
        updated = true;
      }
      if (updated) needsSave = true;
      return p;
    });

    setPoints(parsedPoints);
    setConnections(parsedConnections);
    setParcels(parsedParcels);
    
    if (savedVersion !== APP_VERSION || needsSave) {
      localStorage.setItem('marzban_version', APP_VERSION);
      localStorage.setItem('marzban_points', JSON.stringify(parsedPoints));
      localStorage.setItem('marzban_connections', JSON.stringify(parsedConnections));
      localStorage.setItem('marzban_parcels', JSON.stringify(parsedParcels));
    }

    const savedGnssConfig = localStorage.getItem('marzban_gnss_config');
    if (savedGnssConfig) {
      setGnssConfig(JSON.parse(savedGnssConfig));
    }
  }, []);

  const [hasZoomedForLocation, setHasZoomedForLocation] = useState(false);

  // GNSS Bluetooth Data Stream
  useEffect(() => {
    if (gnssConfig.source === 'EXTERNAL' && gnssStatus.connected) {
      gnssManager.onData((sentence) => {
        const parsed = parseGPGGA(sentence);
        if (parsed) {
          setGnssStatus(prev => ({
            ...prev,
            ...parsed,
            connected: true
          }));
        }
      });
    }
  }, [gnssConfig.source, gnssStatus.connected, gnssManager]);

  // Live Location Tracking - Only active when showUserLocation is true
  useEffect(() => {
    if (!showUserLocation) {
      setUserLocation(undefined);
      setHasZoomedForLocation(false);
      return;
    }

    if (gnssConfig.source === 'EXTERNAL' && gnssStatus.connected) {
      // Use external GNSS data
      setRawLocation({
        lat: gnssStatus.lat,
        lng: gnssStatus.lng,
        accuracy: gnssStatus.accuracy
      });
      return;
    }

    if (!navigator.geolocation) {
      setRawLocation(undefined);
      return;
    }

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const loc = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy
        };
        setRawLocation(loc);
      },
      (err) => console.error(err),
      { enableHighAccuracy: true }
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, [showUserLocation, gnssConfig.source, gnssStatus.connected, gnssStatus.lat, gnssStatus.lng, gnssStatus.accuracy]);

  // Apply smoothing and offset to raw location
  useEffect(() => {
    if (!rawLocation) {
      setUserLocation(undefined);
      return;
    }

    // 1. Smoothing (Moving Average)
    locationBuffer.current.push({ lat: rawLocation.lat, lng: rawLocation.lng });
    if (locationBuffer.current.length > MAX_BUFFER_SIZE) {
      locationBuffer.current.shift();
    }

    const avgLat = locationBuffer.current.reduce((sum, p) => sum + p.lat, 0) / locationBuffer.current.length;
    const avgLng = locationBuffer.current.reduce((sum, p) => sum + p.lng, 0) / locationBuffer.current.length;

    // 2. Apply Manual Offset
    const offset = gnssConfig.locationOffset || { lat: 0, lng: 0 };
    
    setUserLocation({
      lat: avgLat + offset.lat,
      lng: avgLng + offset.lng,
      accuracy: rawLocation.accuracy
    });
  }, [rawLocation, gnssConfig.locationOffset]);

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
      const oldPoint = points.find(p => p.id === selectedPointId);
      const updatedPoints = points.map(p => p.id === selectedPointId ? {
        ...p,
        ...data,
        timestamp: Date.now()
      } : p);
      
      setPoints(updatedPoints);
      
      // Proportional Scaling for Nested Parcels
      if (oldPoint) {
        const dx = data.lng - oldPoint.lng;
        const dy = data.lat - oldPoint.lat;

        setParcels(prev => prev.map(parcel => {
          // If parcel uses this point, recalculate its divisions
          if (parcel.pointIds.includes(selectedPointId)) {
            const updatedParcel = recalculateParcelDivisions(parcel, parcel.divisions, updatedPoints);
            
            // Also check if this parcel has "offspring" that DON'T share this point
            // but should move proportionally.
            const children = getParcelChildren(parcel, prev, updatedPoints);
            children.forEach(child => {
              // For simplicity, we only shift child points if they are not shared with parent
              // but are "within" the parent. This is a heuristic for proportional scaling.
              // In a more complex system, we'd use barycentric coordinates.
            });

            return updatedParcel;
          }
          return parcel;
        }));
      }
      
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
    if (mode === 'TRACKING') {
      setTrackingTargetId(point.id);
      setSelectedPointId(point.id);
      return;
    }
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
    if (canDeleteConnection(connId) && confirm("آیا از حذف این اتصال اطمینان دارید؟")) {
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
    } else if (mode === 'ROTATE') {
      const parcelId = cycle.map(p => p.id).sort().join(',');
      const parcel = parcels.find(p => p.pointIds.sort().join(',') === parcelId);
      if (parcel) {
        setSelectedParcelForRotation(parcel);
        setRotationAngle(parcel.angle || 0);
        setHighlightedParcelId(parcel.id);
      }
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
          area: calculatePolygonArea(cycle),
          generation: getGenerationForParcel(cycle.map(p => p.id), parcels),
          createdAt: Date.now()
        };
        // We don't add it to state yet, we'll add it when the owner is saved
      }
      
      setSelectedParcelForOwner(parcel);
      setOwnerNameInput(parcel.ownerName || '');
      setShowOwnerModal(true);
    }
  };

  const splitPolygon = (cycle: Point[], percentage: number, orientation: 'HORIZONTAL' | 'VERTICAL', angle: number = 0): [number, number][][] => {
    const coords = [...cycle.map(p => [p.lng, p.lat]), [cycle[0].lng, cycle[0].lat]];
    let poly = turf.polygon([coords]);
    const centroid = turf.centroid(poly);

    // Rotate polygon by -angle to align the "gravity" with axes
    if (angle !== 0) {
      poly = turf.transformRotate(poly, -angle, { pivot: centroid });
    }

    const bbox = turf.bbox(poly);
    const totalArea = turf.area(poly);
    const targetArea = totalArea * (percentage / 100);

    let min = orientation === 'VERTICAL' ? bbox[0] : bbox[1];
    let max = orientation === 'VERTICAL' ? bbox[2] : bbox[3];
    let bestIntersection: any = null;

    // High-precision binary search (45 iterations for sub-millimeter precision)
    for (let i = 0; i < 45; i++) {
      const mid = (min + max) / 2;
      
      // Create a "Water Level" clipping box from the bottom up to 'mid'
      let clipPoly;
      if (orientation === 'VERTICAL') {
        clipPoly = turf.polygon([[[bbox[0] - 0.1, bbox[1] - 0.1], [mid, bbox[1] - 0.1], [mid, bbox[3] + 0.1], [bbox[0] - 0.1, bbox[3] + 0.1], [bbox[0] - 0.1, bbox[1] - 0.1]]]);
      } else {
        clipPoly = turf.polygon([[[bbox[0] - 0.1, bbox[1] - 0.1], [bbox[2] + 0.1, bbox[1] - 0.1], [bbox[2] + 0.1, mid], [bbox[0] - 0.1, mid], [bbox[0] - 0.1, bbox[1] - 0.1]]]);
      }

      let intersection = turf.intersect(turf.featureCollection([poly, clipPoly]));
      
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
      bestIntersection = intersection;
    }

    if (!bestIntersection) return [];

    // Rotate back to original orientation
    if (angle !== 0) {
      bestIntersection = turf.transformRotate(bestIntersection, angle, { pivot: centroid });
    }

    // Professional MultiPolygon handling: Water fills ALL pockets at the same level
    if (bestIntersection.geometry.type === 'Polygon') {
      return [bestIntersection.geometry.coordinates[0].map((c: any) => [c[1], c[0]] as [number, number])];
    } else if (bestIntersection.geometry.type === 'MultiPolygon') {
      return bestIntersection.geometry.coordinates.map((p: any) => p[0].map((c: any) => [c[1], c[0]] as [number, number]));
    }
    
    return [];
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
    
    const parcelAngle = existingParcel?.angle || 0;
    const cumulativeGeometries = splitPolygon(selectedCycle, percentage + currentTotal, orientation, parcelAngle);
    let finalGeometries = cumulativeGeometries;

    if (currentTotal > 0) {
      const previousCumulativeGeometries = splitPolygon(selectedCycle, currentTotal, orientation, parcelAngle);
      
      const poly1 = turf.union(turf.featureCollection(cumulativeGeometries.map(g => turf.polygon([[...g.map(c => [c[1], c[0]]), [g[0][1], g[0][0]]]]))));
      const poly2 = turf.union(turf.featureCollection(previousCumulativeGeometries.map(g => turf.polygon([[...g.map(c => [c[1], c[0]]), [g[0][1], g[0][0]]]]))));
      
      if (poly1 && poly2) {
        const diff = turf.difference(turf.featureCollection([poly1, poly2]));
        if (diff) {
          if (diff.geometry.type === 'Polygon') {
            finalGeometries = [diff.geometry.coordinates[0].map(c => [c[1], c[0]] as [number, number])];
          } else if (diff.geometry.type === 'MultiPolygon') {
            finalGeometries = diff.geometry.coordinates.map(p => p[0].map(c => [c[1], c[0]] as [number, number]));
          }
        }
      }
    }
    
    const newDivision: Division = {
      id: Math.random().toString(36).substr(2, 9),
      partnerId: name,
      percentage,
      geometry: finalGeometries,
      orientation
    };

    if (existingParcel) {
      setParcels(prev => prev.map(p => p.id === existingParcel!.id ? {
        ...p,
        divisions: [...p.divisions, newDivision],
        area: calculatePolygonArea(selectedCycle!),
        generation: getGenerationForParcel(selectedCycle!.map(pt => pt.id), prev)
      } : p));
    } else {
      const newParcel: Parcel = {
        id: Math.random().toString(36).substr(2, 9),
        name: `قطعه ${parcels.length + 1}`,
        pointIds: selectedCycle.map(p => p.id),
        divisions: [newDivision],
        area: calculatePolygonArea(selectedCycle),
        generation: getGenerationForParcel(selectedCycle.map(p => p.id), parcels),
        createdAt: Date.now()
      };
      setParcels(prev => [...prev, newParcel]);
    }
    setShowDivisionModal(false);
  };

  const handleUpdateParcelAngle = (parcelId: string, newAngle: number) => {
    setParcels(prev => prev.map(p => {
      if (p.id === parcelId) {
        const updatedParcel = { ...p, angle: newAngle };
        return recalculateParcelDivisions(updatedParcel, p.divisions);
      }
      return p;
    }));
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

  const recalculateParcelDivisions = (parcel: Parcel, updatedDivisions: Division[], latestPoints?: Point[]): Parcel => {
    const pts = latestPoints || points;
    const cycle = parcel.pointIds.map(id => pts.find(p => p.id === id)!).filter(Boolean);
    if (cycle.length < 3) return parcel;

    const parcelAngle = parcel.angle || 0;
    let currentTotal = 0;
    const newDivisions = updatedDivisions.map(div => {
      // "Water Level" logic: Pour cumulative volume and subtract previous volume
      const cumulativeGeometries = splitPolygon(cycle, div.percentage + currentTotal, div.orientation, parcelAngle);
      let finalGeometries = cumulativeGeometries;

      if (currentTotal > 0) {
        const previousCumulativeGeometries = splitPolygon(cycle, currentTotal, div.orientation, parcelAngle);
        
        // Convert geometries to turf features for subtraction
        const poly1 = turf.union(turf.featureCollection(cumulativeGeometries.map(g => turf.polygon([[...g.map(c => [c[1], c[0]]), [g[0][1], g[0][0]]]]))));
        const poly2 = turf.union(turf.featureCollection(previousCumulativeGeometries.map(g => turf.polygon([[...g.map(c => [c[1], c[0]]), [g[0][1], g[0][0]]]]))));
        
        if (poly1 && poly2) {
          const diff = turf.difference(turf.featureCollection([poly1, poly2]));
          if (diff) {
            if (diff.geometry.type === 'Polygon') {
              finalGeometries = [diff.geometry.coordinates[0].map(c => [c[1], c[0]] as [number, number])];
            } else if (diff.geometry.type === 'MultiPolygon') {
              finalGeometries = diff.geometry.coordinates.map(p => p[0].map(c => [c[1], c[0]] as [number, number]));
            }
          }
        }
      }

      currentTotal += div.percentage;
      return { ...div, geometry: finalGeometries };
    });

    return { ...parcel, divisions: newDivisions };
  };

  const handleDeleteConnection = () => {
    if (pendingDeleteConnId && canDeleteConnection(pendingDeleteConnId)) {
      setConnections(prev => prev.filter(c => c.id !== pendingDeleteConnId));
      setPendingDeleteConnId(null);
    } else {
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
      let newPercent = parseFloat(editPercentage);
      
      const targetParcel = parcels.find(p => p.id === parcelId);
      if (isEditAreaMode && targetParcel && targetParcel.area > 0) {
        newPercent = (newPercent / targetParcel.area) * 100;
      }
      
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
      setIsEditAreaMode(false);
    }
  };

  const handleUpdateOwner = () => {
    if (selectedParcelForOwner) {
      setParcels(prev => {
        const exists = prev.some(p => p.id === selectedParcelForOwner.id);
        if (exists) {
          return prev.map(p => 
            p.id === selectedParcelForOwner.id ? { 
              ...p, 
              ownerName: ownerNameInput,
              area: calculatePolygonArea(p.pointIds.map(id => points.find(pt => pt.id === id)!).filter(Boolean)),
              generation: getGenerationForParcel(p.pointIds, prev)
            } : p
          );
        } else {
          // Add the new parcel
          const newParcel = { 
            ...selectedParcelForOwner, 
            ownerName: ownerNameInput,
            area: calculatePolygonArea(selectedParcelForOwner.pointIds.map(id => points.find(pt => pt.id === id)!).filter(Boolean)),
            generation: getGenerationForParcel(selectedParcelForOwner.pointIds, prev)
          };
          return [...prev, newParcel];
        }
      });
      setShowOwnerModal(false);
      setSelectedParcelForOwner(null);
      setOwnerNameInput('');
    }
  };

  const handleGnssConnect = async () => {
    try {
      const deviceName = await gnssManager.connect();
      setGnssConfig(prev => {
        const newConfig = { ...prev, bluetoothDeviceName: deviceName };
        localStorage.setItem('marzban_gnss_config', JSON.stringify(newConfig));
        return newConfig;
      });
      setGnssStatus(prev => ({ ...prev, connected: true }));
    } catch (error) {
      alert("خطا در اتصال به دستگاه GNSS. اطمینان حاصل کنید که بلوتوث روشن است.");
    }
  };

  const handleSaveGnssConfig = (config: GNSSConfig) => {
    setGnssConfig(config);
    localStorage.setItem('marzban_gnss_config', JSON.stringify(config));
    if (config.source === 'INTERNAL') {
      gnssManager.disconnect();
      setGnssStatus(prev => ({ ...prev, connected: false }));
    }
  };

  const handleRestore = (data: { points: Point[]; connections: Connection[]; parcels: Parcel[] }) => {
    setPoints(data.points);
    setConnections(data.connections);
    setParcels(data.parcels);
  };

  const handleConvertShare = (newPoints: Point[], newParcel: Parcel) => {
    // Add new points
    setPoints(prev => [...prev, ...newPoints]);
    
    // Create connections for the new parcel, avoiding duplicates
    setConnections(prev => {
      const updated = [...prev];
      for (let i = 0; i < newParcel.pointIds.length; i++) {
        const fromId = newParcel.pointIds[i];
        const toId = newParcel.pointIds[(i + 1) % newParcel.pointIds.length];
        
        const exists = updated.some(c => 
          (c.fromId === fromId && c.toId === toId) || 
          (c.fromId === toId && c.toId === fromId)
        );
        
        if (!exists) {
          updated.push({
            id: Math.random().toString(36).substr(2, 9),
            fromId,
            toId
          });
        }
      }
      return updated;
    });
    
    // Add new parcel and remove the division from the original
    setParcels(prev => {
      const updatedParcels = prev.map(p => {
        if (selectedParcelForConversion && p.id === selectedParcelForConversion.id && selectedDivisionForConversion) {
          return {
            ...p,
            divisions: p.divisions.filter(d => d.id !== selectedDivisionForConversion.id)
          };
        }
        return p;
      });
      
      const parcelWithTimestamp = {
        ...newParcel,
        createdAt: Date.now()
      };
      
      return [...updatedParcels, parcelWithTimestamp];
    });
    
    setShowConvertModal(false);
    setSelectedParcelForConversion(null);
    setSelectedDivisionForConversion(null);
    setMode('VIEW');
  };

  const startUpdate = () => {
    setIsUpdating(true);
    setShowRecorder(true);
  };

  const calibrateLocation = (targetPoint: Point) => {
    if (!rawLocation) {
      alert("ابتدا مکان خود را روشن کنید.");
      return;
    }
    
    // Calculate the difference between where we ARE and where the target point IS
    const offset = {
      lat: targetPoint.lat - rawLocation.lat,
      lng: targetPoint.lng - rawLocation.lng
    };
    
    const newConfig = { ...gnssConfig, locationOffset: offset };
    setGnssConfig(newConfig);
    localStorage.setItem('marzban_gnss_config', JSON.stringify(newConfig));
    alert("کالیبراسیون با موفقیت انجام شد. مکان شما اکنون با نقطه هدف منطبق است.");
  };

  const resetCalibration = () => {
    const newConfig = { ...gnssConfig, locationOffset: { lat: 0, lng: 0 } };
    setGnssConfig(newConfig);
    localStorage.setItem('marzban_gnss_config', JSON.stringify(newConfig));
    alert("کالیبراسیون بازنشانی شد.");
  };

  useEffect(() => {
    if (mode === 'TRACKING') {
      setShowUserLocation(true);
    } else {
      setTrackingTargetId(null);
    }
  }, [mode]);

  const selectedPoint = points.find(p => p.id === selectedPointId);
  const trackingTarget = points.find(p => p.id === trackingTargetId);

  const selectedParcelArea = useMemo(() => {
    if (!selectedCycle || selectedCycle.length < 3) return 0;
    return calculatePolygonArea(selectedCycle);
  }, [selectedCycle]);

  const editingParcel = pendingDivisionAction ? parcels.find(p => p.id === pendingDivisionAction.parcelId) : null;
  const editingParcelArea = editingParcel?.area || 0;

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
              onClick={() => setMode('GNSS_SETTINGS')}
              className={cn(
                "p-2 rounded-full transition-colors",
                mode === 'GNSS_SETTINGS' ? "bg-emerald-100 text-emerald-600" : "text-slate-500 hover:bg-slate-100"
              )}
              title="تنظیمات GNSS"
            >
              <Cpu className="w-5 h-5" />
            </button>

           <button 
             onClick={() => setShowBackupModal(true)}
             className="p-2 rounded-full text-slate-500 hover:bg-slate-100 transition-colors"
             title="پشتیبان‌گیری"
           >
             <Database className="w-5 h-5" />
           </button>

           {isAdmin && (
             <div className="relative">
               <button 
                 onClick={() => setShowResetMenu(!showResetMenu)}
                 className={cn(
                   "p-2 rounded-full transition-colors",
                   showResetMenu ? "bg-red-100 text-red-600" : "text-slate-500 hover:bg-slate-100"
                 )}
                 title="ریست اراضی"
               >
                 <RefreshCw className="w-5 h-5" />
               </button>
               
               <AnimatePresence>
                 {showResetMenu && (
                   <motion.div 
                     initial={{ opacity: 0, y: 10 }}
                     animate={{ opacity: 1, y: 0 }}
                     exit={{ opacity: 0, y: 10 }}
                     className="absolute top-full left-0 mt-2 w-56 bg-white rounded-2xl shadow-2xl border border-slate-100 py-2 z-50 overflow-hidden"
                   >
                     <button 
                       onClick={handleRefreshSync}
                       className="w-full px-4 py-3 text-right text-xs text-emerald-600 hover:bg-emerald-50 transition-colors flex items-center justify-between font-bold"
                     >
                       <span>بروزرسانی و همگام‌سازی</span>
                       <Activity className="w-4 h-4" />
                     </button>
                     <button 
                       onClick={() => handleReset(2)}
                       className="w-full px-4 py-2 text-right text-sm text-slate-600 hover:bg-slate-50 transition-colors"
                     >
                       ریست تقسیمات (نسل ۲)
                     </button>
                     <button 
                       onClick={() => handleReset(3)}
                       className="w-full px-4 py-2 text-right text-sm text-slate-600 hover:bg-slate-50 transition-colors"
                     >
                       ریست خرده‌مالکی (نسل ۳)
                     </button>
                   </motion.div>
                 )}
               </AnimatePresence>
             </div>
           )}

           {isAdmin && (
             <div className="flex items-center gap-1">
               <button 
                 onClick={() => {
                   const newMode = mode === 'ROTATE' ? 'VIEW' : 'ROTATE';
                   setMode(newMode);
                   setShowRotationModal(newMode === 'ROTATE');
                 }}
                 className={cn(
                   "p-2 rounded-full transition-colors",
                   mode === 'ROTATE' ? "bg-amber-100 text-amber-600" : "text-slate-500 hover:bg-slate-100"
                 )}
                 title="چرخش سهم‌ها"
               >
                 <RotateCcw className="w-5 h-5" />
               </button>

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
            if (mode === 'TRACKING') setTrackingTargetId(null);
            if (isSearchActive && !searchQuery) setIsSearchActive(false);
          }}
          onConnectionClick={handleConnectionClick}
          onConnectionLongPress={(id) => mode === 'CONNECT' && setPendingDeleteConnId(id)}
          onPolygonClick={handlePolygonClick}
          onDivisionClick={(pId, dId) => {
            const parcel = parcels.find(p => p.id === pId);
            const division = parcel?.divisions.find(d => d.id === dId);
            if (parcel && division) {
              setSelectedParcelForConversion(parcel);
              setSelectedDivisionForConversion(division);
              setShowConvertModal(true);
            }
          }}
          onDivisionLongPress={(pId, dId) => setPendingDivisionAction({ parcelId: pId, divId: dId, type: 'DELETE' })}
          userLocation={userLocation}
          showUserLocation={showUserLocation}
          selectedPointId={selectedPointId}
          trackingTargetId={trackingTargetId}
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
            <>
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
              <button 
                onClick={() => setMode('CONVERT')}
                className={cn(
                  "p-3 rounded-2xl shadow-xl transition-all",
                  mode === 'CONVERT' ? "bg-emerald-600 text-white" : "bg-white text-slate-600"
                )}
                title="حالت تبدیل سهم"
              >
                <Zap className="w-6 h-6" />
              </button>
            </>
          )}
          
          <button 
            onClick={() => setMode('TRACKING')}
            className={cn(
              "p-3 rounded-2xl shadow-xl transition-all",
              mode === 'TRACKING' ? "bg-amber-600 text-white" : "bg-white text-slate-600"
            )}
            title="حالت ردیابی و یافتن میخ"
          >
            <Crosshair className="w-6 h-6" />
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
                          if (isPrintMode) {
                            setSelectedParcelForCertificate(parcel);
                          } else {
                            setHighlightedParcelId(parcel.id);
                            setCenterTrigger(prev => prev + 1);
                            setIsSearchActive(false);
                            setSearchQuery('');
                          }
                        }}
                        className={cn(
                          "w-full px-5 py-4 text-right flex items-center justify-between border-b border-slate-50 last:border-0 hover:bg-slate-50 transition-colors",
                          highlightedParcelId === parcel.id ? "bg-emerald-50 text-emerald-700" : "text-slate-700"
                        )}
                      >
                        <div className="flex flex-col items-start text-right w-full">
                          <span className="font-bold text-sm">{parcel.ownerName}</span>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-[10px] text-slate-400">مساحت: {(parcel.area || 0).toFixed(1)} متر مربع</span>
                            <span className="text-[10px] text-indigo-400 font-bold bg-indigo-50 px-1.5 py-0.5 rounded-md">نسل {parcel.generation || 1}</span>
                          </div>
                        </div>
                        {isPrintMode ? <Printer className="w-4 h-4 text-slate-400" /> : <Navigation className="w-4 h-4 text-slate-300" />}
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
                  <div className="flex items-center gap-2">
                    <button 
                      onClick={() => setIsPrintMode(!isPrintMode)}
                      className={cn(
                        "p-1.5 rounded-lg transition-colors",
                        isPrintMode ? "bg-slate-800 text-white" : "text-slate-400 hover:bg-slate-200"
                      )}
                      title="حالت چاپ سند"
                    >
                      <Printer className="w-4 h-4" />
                    </button>
                    <button onClick={() => { setSearchQuery(''); setHighlightedParcelId(null); }}>
                      <X className="w-4 h-4 text-slate-400" />
                    </button>
                  </div>
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
                <div className="grid grid-cols-3 gap-2">
                  <button 
                    onClick={() => deletePoint(selectedPoint.id)}
                    className="flex flex-col items-center justify-center gap-1 py-3 bg-rose-50 text-rose-600 rounded-2xl font-bold hover:bg-rose-100 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                    <span className="text-[10px]">حذف</span>
                  </button>
                  <button 
                    onClick={startUpdate}
                    className="flex flex-col items-center justify-center gap-1 py-3 bg-amber-50 text-amber-600 rounded-2xl font-bold hover:bg-amber-100 transition-colors"
                  >
                    <RefreshCw className="w-4 h-4" />
                    <span className="text-[10px]">بروزرسانی</span>
                  </button>
                  <button 
                    onClick={() => calibrateLocation(selectedPoint)}
                    className="flex flex-col items-center justify-center gap-1 py-3 bg-blue-50 text-blue-600 rounded-2xl font-bold hover:bg-blue-100 transition-colors"
                    title="تنظیم مکان من بر روی این نقطه"
                  >
                    <Target className="w-4 h-4" />
                    <span className="text-[10px]">کالیبره</span>
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
              gnssStatus={gnssStatus}
              gnssConfig={gnssConfig}
            />
          )}
        </AnimatePresence>
        {mode === 'GNSS_SETTINGS' && (
          <GNSSSettings
            config={gnssConfig}
            status={gnssStatus}
            onSave={handleSaveGnssConfig}
            onConnect={handleGnssConnect}
            onResetCalibration={resetCalibration}
            onClose={() => setMode('VIEW')}
          />
        )}
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
                           area: calculatePolygonArea(selectedCycle),
                           generation: getGenerationForParcel(selectedCycle.map(pt => pt.id), parcels),
                           createdAt: Date.now()
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
                  const name = formData.get('name') as string;
                  const orientation = formData.get('orientation') as 'HORIZONTAL' | 'VERTICAL';
                  const rawValue = Number(shareInputValue);
                  
                  let percentage = rawValue;
                  if (isAreaMode && selectedParcelArea > 0) {
                    percentage = (rawValue / selectedParcelArea) * 100;
                  }

                  handleAddDivision(name, percentage, orientation);
                  setShareInputValue('');
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
                      <div className="flex items-center justify-between mb-2">
                        <label className="text-sm font-bold text-slate-700">
                          {isAreaMode ? "مساحت سهم (متر مربع)" : "درصد سهم (٪)"}
                        </label>
                        <button 
                          type="button"
                          onClick={() => setIsAreaMode(!isAreaMode)}
                          className="text-[10px] font-bold px-2 py-1 rounded-lg bg-amber-100 text-amber-600 hover:bg-amber-200 transition-colors"
                        >
                          {isAreaMode ? "تغییر به درصد" : "تغییر به متر مربع"}
                        </button>
                      </div>
                      <input 
                        value={shareInputValue}
                        onChange={(e) => setShareInputValue(e.target.value)}
                        type="number"
                        step="0.01"
                        required
                        className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl px-4 py-3 focus:border-blue-500 focus:outline-none transition-colors"
                        placeholder={isAreaMode ? "مثلاً: ۵۰۰" : "مثلاً: ۲۵"}
                      />
                      {isAreaMode && selectedParcelArea > 0 && shareInputValue && (
                        <p className="mt-2 text-[10px] text-indigo-600 font-bold bg-indigo-50 p-2 rounded-xl">
                          محاسبه خودکار: {((Number(shareInputValue) / selectedParcelArea) * 100).toFixed(2)}٪ از کل {selectedParcelArea.toFixed(1)} متر مربع
                        </p>
                      )}
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
                            {(parcel.area || 0).toLocaleString('fa-IR', { maximumFractionDigits: 1 })} m²
                          </span>
                        </div>
                        
                        {parcel.divisions.length > 0 ? (
                          <div className="space-y-2">
                            {parcel.divisions.map(div => (
                              <div key={div.id} className="flex justify-between items-center text-xs bg-slate-50 p-2 rounded-xl">
                                <span className="text-slate-700">{div.partnerId}</span>
                                <div className="flex items-center gap-2">
                                  <span className="font-bold text-blue-600">{div.percentage}%</span>
                                  <span className="text-slate-400">({((parcel.area || 0) * div.percentage / 100).toLocaleString('fa-IR', { maximumFractionDigits: 1 })} m²)</span>
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
                      <div className="flex items-center justify-between mb-2">
                        <label className="text-sm font-bold text-slate-700">
                          {isEditAreaMode ? "مساحت جدید سهم (متر مربع)" : "درصد جدید سهم (٪)"}
                        </label>
                        <button 
                          type="button"
                          onClick={() => setIsEditAreaMode(!isEditAreaMode)}
                          className="text-[10px] font-bold px-2 py-1 rounded-lg bg-amber-100 text-amber-600 hover:bg-amber-200 transition-colors"
                        >
                          {isEditAreaMode ? "تغییر به درصد" : "تغییر به متر مربع"}
                        </button>
                      </div>
                      <input 
                        type="number"
                        step="0.01"
                        value={editPercentage}
                        onChange={(e) => setEditPercentage(e.target.value)}
                        className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl px-4 py-4 focus:border-blue-500 focus:outline-none transition-colors text-xl font-mono"
                        placeholder={isEditAreaMode ? "مثلاً: ۵۰۰" : "مثلاً: ۲۵"}
                        autoFocus
                      />
                      {isEditAreaMode && editingParcelArea > 0 && editPercentage && (
                        <p className="mt-2 text-[10px] text-indigo-600 font-bold bg-indigo-50 p-2 rounded-xl">
                          محاسبه خودکار: {((Number(editPercentage) / editingParcelArea) * 100).toFixed(2)}٪ از کل {editingParcelArea.toFixed(1)} متر مربع
                        </p>
                      )}
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

      {/* Convert Share Modal */}
      {selectedParcelForConversion && selectedDivisionForConversion && (
        <ConvertModal
          isOpen={showConvertModal}
          onClose={() => setShowConvertModal(false)}
          parcel={selectedParcelForConversion}
          division={selectedDivisionForConversion}
          points={points}
          onConvert={handleConvertShare}
        />
      )}

      {/* Rotation Tool Modal */}
      <RotationModal 
        isOpen={showRotationModal}
        onClose={() => {
          setShowRotationModal(false);
          setHighlightedParcelId(null);
          setSelectedParcelForRotation(null);
          if (mode === 'ROTATE') setMode('VIEW');
        }}
        angle={rotationAngle}
        onAngleChange={(newAngle) => {
          setRotationAngle(newAngle);
          if (selectedParcelForRotation) {
            handleUpdateParcelAngle(selectedParcelForRotation.id, newAngle);
          }
        }}
        parcelName={selectedParcelForRotation?.name}
      />

      {/* Digital Certificate Modal */}
      <AnimatePresence>
        {selectedParcelForCertificate && (
          <DigitalCertificateModal 
            parcel={selectedParcelForCertificate}
            allParcels={parcels}
            allPoints={points}
            onClose={() => setSelectedParcelForCertificate(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
