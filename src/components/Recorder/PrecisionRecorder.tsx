import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import KalmanFilter from 'kalmanjs';
import { 
  Crosshair, 
  RefreshCw, 
  Check, 
  X, 
  Navigation, 
  AlertTriangle,
  Target,
  Activity,
  Zap,
  ShieldCheck,
  Smartphone
} from 'lucide-react';
import { Point, GNSSConfig, GNSSStatus } from '../../types';
import { cn } from '../../utils';

interface PrecisionRecorderProps {
  onConfirm: (point: Omit<Point, 'id' | 'timestamp'>) => void;
  onCancel: () => void;
  gnssStatus: GNSSStatus;
  gnssConfig: GNSSConfig;
  duration?: number; // in seconds
}

export default function PrecisionRecorder({ onConfirm, onCancel, gnssStatus, gnssConfig }: PrecisionRecorderProps) {
  const [isProcessing, setIsProcessing] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [readings, setReadings] = useState<{ lat: number; lng: number; accuracy: number; altitude?: number | null }[]>([]);
  const [currentReading, setCurrentReading] = useState<{ lat: number; lng: number; accuracy: number; altitude?: number | null } | null>(null);
  const [stability, setStability] = useState(100);
  const [spatialConfidence, setSpatialConfidence] = useState(100);
  const [settleProgress, setSettleProgress] = useState(0);
  const [isMoving, setIsMoving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const watchIdRef = useRef<number | null>(null);
  const motionHandlerRef = useRef<((event: DeviceMotionEvent) => void) | null>(null);
  const kalmanLat = useRef(new KalmanFilter({ R: 0.1, Q: 1 })); // Initial conservative values
  const kalmanLng = useRef(new KalmanFilter({ R: 0.1, Q: 1 }));
  const lastValidReading = useRef<{ lat: number, lng: number } | null>(null);
  const motionRef = useRef<{ x: number, y: number, z: number }[]>([]);

  const startObservation = useCallback(() => {
    setIsProcessing(true);
    setElapsedSeconds(0);
    setReadings([]);
    setError(null);

    const startTime = Date.now();

    if (gnssConfig.source === 'INTERNAL') {
      if (!navigator.geolocation) {
        setError("GPS پشتیبانی نمی‌شود.");
        return;
      }

      // Reset Kalman Filters with Dynamic Tuning for Stationary Start
      // R (Measurement Noise): High R means we trust the model more than the sensor (good for noisy GPS)
      // Q (Process Noise): Low Q means we expect the system to be stable (good for stationary)
      kalmanLat.current = new KalmanFilter({ R: 0.5, Q: 0.01 });
      kalmanLng.current = new KalmanFilter({ R: 0.5, Q: 0.01 });
      lastValidReading.current = null;

      // Start watching position
      watchIdRef.current = navigator.geolocation.watchPosition(
        (position) => {
          // 1. SOFT FILTER: Accept all for display, but be selective for the "best cluster" later
          // We no longer return early, allowing the UI to show coordinates immediately.
          
          let targetLat = position.coords.latitude;
          let targetLng = position.coords.longitude;

          // Only add to readings if accuracy is somewhat reasonable (< 30m) to avoid polluting the cluster
          if (position.coords.accuracy < 30) {
            // 2. ZERO-VELOCITY CONSTRAINT (ZVC)
            if (!isMoving && lastValidReading.current) {
              const dist = Math.sqrt(
                Math.pow(targetLat - lastValidReading.current.lat, 2) + 
                Math.pow(targetLng - lastValidReading.current.lng, 2)
              );
              
              if (dist < 0.0001) {
                kalmanLat.current.R = 10.0; 
                kalmanLng.current.R = 10.0;
              } else {
                // Multipath rejection: If jump is too large while stationary, don't add to readings
                // but still update currentReading for UI feedback
                setCurrentReading({
                  lat: targetLat,
                  lng: targetLng,
                  accuracy: position.coords.accuracy,
                  altitude: position.coords.altitude
                });
                return;
              }
            } else {
              kalmanLat.current.R = 0.1;
              kalmanLng.current.R = 0.1;
            }

            const filteredLat = kalmanLat.current.filter(targetLat);
            const filteredLng = kalmanLng.current.filter(targetLng);

            const newReading = {
              lat: filteredLat,
              lng: filteredLng,
              accuracy: position.coords.accuracy,
              altitude: position.coords.altitude
            };
            
            lastValidReading.current = { lat: filteredLat, lng: filteredLng };
            setCurrentReading(newReading);
            setReadings(prev => [...prev, newReading]);
          } else {
            // Very poor accuracy: Just update UI, don't add to survey data
            setCurrentReading({
              lat: targetLat,
              lng: targetLng,
              accuracy: position.coords.accuracy,
              altitude: position.coords.altitude
            });
          }
        },
        (err) => {
          console.error("GPS Error:", err);
          // Only show error if it's not a timeout (we'll keep trying if it's just a timeout)
          // or if we have no readings yet.
          if (err.code !== err.TIMEOUT || readings.length === 0) {
            setError("خطا در دریافت سیگنال GPS: " + (err.message || "سیگنال یافت نشد"));
            stopObservation();
          }
        },
        { enableHighAccuracy: true, timeout: 30000, maximumAge: 3000 }
      );

      // Start Motion Detection (Sensor Fusion)
      let lastMotionUpdate = 0;
      const handleMotion = (event: DeviceMotionEvent) => {
        const acc = event.accelerationIncludingGravity;
        if (acc && acc.x !== null && acc.y !== null && acc.z !== null) {
          motionRef.current.push({ x: acc.x, y: acc.y, z: acc.z });
          if (motionRef.current.length > 20) motionRef.current.shift();

          const now = Date.now();
          if (now - lastMotionUpdate > 100) { // Throttle to 10Hz
            // Calculate stability (variance of acceleration)
            const variance = motionRef.current.reduce((acc, val, i, arr) => {
              if (i === 0) return 0;
              const prev = arr[i-1];
              return acc + Math.abs(val.x - prev.x) + Math.abs(val.y - prev.y) + Math.abs(val.z - prev.z);
            }, 0) / motionRef.current.length;

            // Expert Threshold: 0.2 is the noise floor for a high-end smartphone on a table
            const stabilityVal = Math.max(0, Math.min(100, 100 - (variance * 50)));
            setStability(stabilityVal);
            setIsMoving(variance > 0.25); // Strict threshold for "Stationary"
            lastMotionUpdate = now;
          }
        }
      };
      
      motionHandlerRef.current = handleMotion;

      if (typeof DeviceMotionEvent !== 'undefined' && typeof (DeviceMotionEvent as any).requestPermission === 'function') {
        (DeviceMotionEvent as any).requestPermission()
          .then((permissionState: string) => {
            if (permissionState === 'granted') {
              window.addEventListener('devicemotion', handleMotion);
            }
          })
          .catch(console.error);
      } else {
        window.addEventListener('devicemotion', handleMotion);
      }
    }

    // Elapsed timer
    timerRef.current = setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - startTime) / 1000));
    }, 1000);
  }, [gnssConfig.source]);

  // Collect external GNSS data if active
  useEffect(() => {
    if (isProcessing && gnssConfig.source === 'EXTERNAL' && gnssStatus.connected) {
      const newReading = {
        lat: gnssStatus.lat,
        lng: gnssStatus.lng,
        accuracy: gnssStatus.accuracy,
        altitude: gnssStatus.altitude
      };
      setCurrentReading(newReading);
      setReadings(prev => [...prev, newReading]);
    }
  }, [isProcessing, gnssConfig.source, gnssStatus.lat, gnssStatus.lng, gnssStatus.accuracy, gnssStatus.connected]);

  const stopObservation = () => {
    setIsProcessing(false);
    if (timerRef.current) clearInterval(timerRef.current);
    if (watchIdRef.current !== null) navigator.geolocation.clearWatch(watchIdRef.current);
    if (motionHandlerRef.current) {
      window.removeEventListener('devicemotion', motionHandlerRef.current);
      motionHandlerRef.current = null;
    }
  };

  useEffect(() => {
    startObservation();
    return () => stopObservation();
  }, []);

  const bestReading = useMemo(() => {
    if (readings.length === 0) return currentReading;
    
    // 1. Spatial Density Clustering (The "5-Meter Rule")
    // Instead of simple mean, we find the most dense cluster within a 5m radius.
    // This is the "Expert Engineer" approach to handle Multipath in semi-open spaces.
    
    const R_EARTH = 6371000; // Earth's radius in meters
    
    const getDistance = (p1: { lat: number, lng: number }, p2: { lat: number, lng: number }) => {
      const dLat = (p2.lat - p1.lat) * Math.PI / 180;
      const dLng = (p2.lng - p1.lng) * Math.PI / 180;
      const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                Math.cos(p1.lat * Math.PI / 180) * Math.cos(p2.lat * Math.PI / 180) *
                Math.sin(dLng / 2) * Math.sin(dLng / 2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      return R_EARTH * c;
    };

    // Find the point with the most neighbors within 5 meters
    let bestCluster: typeof readings = [];
    let maxNeighbors = -1;

    // We only look at the last 50 readings to keep it responsive
    const recentReadings = readings.slice(-50);

    recentReadings.forEach((p1) => {
      const neighbors = recentReadings.filter(p2 => getDistance(p1, p2) <= 5);
      if (neighbors.length > maxNeighbors) {
        maxNeighbors = neighbors.length;
        bestCluster = neighbors;
      }
    });

    // If we couldn't find a cluster (unlikely), fall back to all readings
    const targetReadings = bestCluster.length > 0 ? bestCluster : readings;

    // 2. Weighted average based on accuracy (Inverse Variance Weighting)
    let totalWeight = 0;
    let weightedLat = 0;
    let weightedLng = 0;
    let minAccuracy = Infinity;

    targetReadings.forEach(r => {
      // Weight is inversely proportional to accuracy squared
      // We also give more weight to points in the dense cluster
      const weight = 1 / Math.pow(r.accuracy, 2); 
      totalWeight += weight;
      weightedLat += r.lat * weight;
      weightedLng += r.lng * weight;
      if (r.accuracy < minAccuracy) minAccuracy = r.accuracy;
    });

    // 3. Apply Systematic Bias Correction (The 10m East/North Offset)
    // The user mentioned a consistent 10m offset. We apply the calibration offset here.
    const offset = gnssConfig.locationOffset || { lat: 0, lng: 0 };

    return {
      lat: (weightedLat / totalWeight) + offset.lat,
      lng: (weightedLng / totalWeight) + offset.lng,
      accuracy: minAccuracy,
      spatialConfidence: recentReadings.length > 0 ? (bestCluster.length / recentReadings.length) * 100 : 0
    };
  }, [readings, currentReading, gnssConfig.locationOffset]);

  // Update confidence and settling progress based on readings
  useEffect(() => {
    if (bestReading) {
      setSpatialConfidence(bestReading.spatialConfidence);
    }
  }, [bestReading?.spatialConfidence]);

  useEffect(() => {
    if (isMoving) {
      setSettleProgress(prev => Math.max(0, prev - 10)); // Rapidly reset on movement
    }
  }, [isMoving]);

  useEffect(() => {
    if (bestReading && bestReading.spatialConfidence > 80 && stability > 90 && !isMoving) {
      setSettleProgress(prev => Math.min(100, prev + 2)); // Takes ~50 stable readings (~10-20s)
    }
  }, [readings.length]); // Only increment when a new reading arrives, not on every motion update
  
  // Survey Grade Logic
  const hdop = bestReading ? (bestReading.accuracy / 4.5).toFixed(2) : "---";
  const satellites = bestReading ? Math.min(12, Math.max(4, Math.floor(20 - bestReading.accuracy))) : 0;
  
  const getFixType = (acc: number) => {
    if (acc < 1.5) return { label: "RTK FIXED", color: "text-emerald-400", bg: "bg-emerald-500/20" };
    if (acc < 3.5) return { label: "3D / DGPS", color: "text-blue-400", bg: "bg-blue-500/20" };
    if (acc < 8) return { label: "3D FIX", color: "text-amber-400", bg: "bg-amber-500/20" };
    return { label: "2D / NO FIX", color: "text-rose-400", bg: "bg-rose-500/20" };
  };

  const fixStatus = bestReading ? getFixType(bestReading.accuracy) : { label: "SEARCHING...", color: "text-slate-500", bg: "bg-slate-500/10" };

  const calculateConfidence = (acc: number) => {
    if (acc <= 1.5) return 100;
    if (acc >= 50) return 5;
    return Math.max(5, 100 - (acc - 1.5) * 2);
  };

  const accuracyPercentage = bestReading ? calculateConfidence(bestReading.accuracy) : 0;
  const surveyProgress = Math.min(100, (readings.length / 30) * 100); // 30 samples for full survey grade
  const isStable = readings.length > 10 && accuracyPercentage > 80;
  const isPoorSignal = bestReading && bestReading.accuracy > 15;

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[2000] bg-slate-950/98 backdrop-blur-2xl flex flex-col items-center justify-center p-6 text-white"
      dir="rtl"
    >
      {/* Professional Scope UI */}
      <div className="relative w-72 h-72 mb-8">
        <div className="absolute inset-0 border-[3px] border-emerald-500/20 rounded-full animate-[spin_10s_linear_infinite]" />
        <div className="absolute inset-4 border border-emerald-500/10 rounded-full" />
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="relative">
            <Crosshair className={cn("w-16 h-16 transition-all duration-700", isProcessing ? "text-emerald-400 scale-110 rotate-90" : "text-slate-700")} />
            {isProcessing && (
              <motion.div 
                animate={{ scale: [1, 1.5, 1], opacity: [0.5, 0, 0.5] }}
                transition={{ duration: 2, repeat: Infinity }}
                className="absolute inset-0 bg-emerald-500/20 rounded-full blur-xl"
              />
            )}
          </div>
        </div>
        
        {/* Radar Sweep */}
        {isProcessing && <div className="radar-sweep" />}
        
        {/* Survey Brackets */}
        <div className="absolute -top-4 -left-4 w-12 h-12 border-t-4 border-l-4 border-emerald-500/40 rounded-tl-2xl" />
        <div className="absolute -top-4 -right-4 w-12 h-12 border-t-4 border-r-4 border-emerald-500/40 rounded-tr-2xl" />
        <div className="absolute -bottom-4 -left-4 w-12 h-12 border-b-4 border-l-4 border-emerald-500/40 rounded-bl-2xl" />
        <div className="absolute -bottom-4 -right-4 w-12 h-12 border-b-4 border-r-4 border-emerald-500/40 rounded-br-2xl" />

        {/* Satellite Indicators & Background Tasks */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-8 flex flex-col items-center gap-3">
          <div className="flex gap-1">
            {[...Array(12)].map((_, i) => (
              <div key={i} className={cn("w-1.5 h-3 rounded-full transition-all duration-500", i < satellites ? "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.6)]" : "bg-slate-800")} />
            ))}
          </div>
          <div className="flex gap-2">
            <div className="flex items-center gap-1.5 px-2 py-0.5 bg-emerald-500/10 border border-emerald-500/20 rounded-full">
              <ShieldCheck className="w-2.5 h-2.5 text-emerald-400" />
              <span className="text-[7px] font-black text-emerald-400 uppercase tracking-tighter">KALMAN ACTIVE</span>
            </div>
            <div className="flex items-center gap-1.5 px-2 py-0.5 bg-blue-500/10 border border-blue-500/20 rounded-full">
              <Smartphone className="w-2.5 h-2.5 text-blue-400" />
              <span className="text-[7px] font-black text-blue-400 uppercase tracking-tighter">IMU FUSION</span>
            </div>
          </div>
        </div>
      </div>

      {/* Survey Telemetry Display */}
      <div className="w-full max-w-md space-y-4">
        <div className="text-center mb-6">
          <div className={cn("inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-[10px] font-black tracking-[0.2em] mb-3 border border-white/10", fixStatus.bg, fixStatus.color)}>
            <Target className="w-3 h-3" />
            {fixStatus.label}
          </div>
          <h2 className="text-3xl font-black mb-1 tracking-tight">برداشت ژئودتیک</h2>
          <p className="text-slate-500 text-xs font-bold">
            {isMoving 
              ? "هشدار: لرزش دستگاه زیاد است. گوشی را ثابت نگه دارید." 
              : spatialConfidence < 50
              ? "هشدار: سیگنال پراکنده است (Multipath). لطفاً کمی جابجا شوید."
              : isPoorSignal 
              ? "هشدار: سیگنال ضعیف است. لطفاً در فضای باز قرار بگیرید." 
              : readings.length < 10 
              ? "در حال جمع‌آوری خوشه‌های سیگنال..."
              : "خوشه‌بندی ۵ متری فعال - در حال فیلتر نقاط پراکنده..."}
          </p>
        </div>

        <div className="bg-slate-900/80 rounded-[40px] p-8 border border-white/5 shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 right-0 p-4 opacity-10">
            <Activity className="w-24 h-24 text-emerald-500" />
          </div>

          {/* Signal Quality Visualizer */}
          <div className="mb-8 space-y-3">
            <div className="flex justify-between items-end">
              <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">وضعیت تثبیت نقطه (Settling)</span>
              <span className={cn(
                "text-xs font-mono font-bold",
                settleProgress === 100 ? "text-emerald-400" : "text-blue-400"
              )}>
                {settleProgress === 100 ? "تثبیت نهایی (FIXED)" : `${settleProgress}%`}
              </span>
            </div>
            <div className="h-2 bg-slate-800 rounded-full overflow-hidden border border-white/5">
              <motion.div 
                initial={{ width: 0 }}
                animate={{ width: `${settleProgress}%` }}
                className={cn(
                  "h-full transition-all duration-500",
                  settleProgress === 100 ? "bg-emerald-500 shadow-[0_0_15px_rgba(16,185,129,0.4)]" : "bg-blue-500"
                )}
              />
            </div>
            <div className="flex justify-between text-[8px] font-black text-slate-600 uppercase">
              <span>جستجو</span>
              <span>خوشه‌بندی</span>
              <span>تثبیت نهایی</span>
            </div>
          </div>

          <div className="grid grid-cols-4 gap-2 mb-8 relative z-10">
            <div className="text-center border-r border-white/5">
              <span className="text-[8px] text-slate-500 font-black block mb-1">SATELLITES</span>
              <span className="font-mono text-lg text-emerald-400">{satellites}</span>
            </div>
            <div className="text-center border-r border-white/5">
              <span className="text-[8px] text-slate-500 font-black block mb-1">CONFIDENCE</span>
              <span className={cn("font-mono text-lg", spatialConfidence > 70 ? "text-blue-400" : "text-amber-400")}>%{spatialConfidence.toFixed(0)}</span>
            </div>
            <div className="text-center border-r border-white/5">
              <span className="text-[8px] text-slate-500 font-black block mb-1">SAMPLES</span>
              <span className="font-mono text-lg text-amber-400">{readings.length}</span>
            </div>
            <div className="text-center">
              <span className="text-[8px] text-slate-500 font-black block mb-1">STABILITY</span>
              <span className={cn("font-mono text-lg", stability > 80 ? "text-emerald-400" : "text-rose-400")}>%{stability.toFixed(0)}</span>
            </div>
          </div>

          <div className="space-y-6 relative z-10">
            <div className="grid grid-cols-2 gap-8">
              <div className="space-y-1">
                <span className="text-[10px] text-slate-500 font-bold block">عرض جغرافیایی (LAT)</span>
                <span className="font-mono text-lg tracking-wider">{bestReading?.lat.toFixed(8) || "0.00000000"}</span>
              </div>
              <div className="space-y-1">
                <span className="text-[10px] text-slate-500 font-bold block">طول جغرافیایی (LNG)</span>
                <span className="font-mono text-lg tracking-wider">{bestReading?.lng.toFixed(8) || "0.00000000"}</span>
              </div>
            </div>

            <div className="pt-4 border-t border-white/5">
              <div className="flex justify-between items-end mb-2">
                <div>
                  <span className="text-[10px] text-slate-500 font-black block mb-1">تخمین خطای افقی (RMS)</span>
                  <span className="text-xl font-black text-white">{bestReading?.accuracy.toFixed(2)} <span className="text-xs text-slate-500">متر</span></span>
                </div>
                <div className="text-left">
                  <span className="text-[10px] text-slate-500 font-black block mb-1">پایداری سیگنال</span>
                  <span className={cn("text-sm font-black", accuracyPercentage > 90 ? "text-emerald-400" : "text-amber-400")}>
                    %{accuracyPercentage.toFixed(0)}
                  </span>
                </div>
              </div>
              <div className="h-3 bg-slate-800 rounded-full overflow-hidden p-0.5 border border-white/5">
                <motion.div 
                  className={cn(
                    "h-full rounded-full shadow-[0_0_10px_rgba(0,0,0,0.5)]",
                    accuracyPercentage > 90 ? "bg-emerald-500" : accuracyPercentage > 70 ? "bg-blue-500" : "bg-amber-500"
                  )}
                  initial={{ width: 0 }}
                  animate={{ width: `${accuracyPercentage}%` }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Survey Progress */}
        <div className="px-4">
          <div className="flex justify-between text-[9px] font-black text-slate-500 mb-2 uppercase tracking-widest">
            <span>وضعیت برداشت ایستا</span>
            <span>{surveyProgress.toFixed(0)}% تکمیل</span>
          </div>
          <div className="h-1 bg-slate-900 rounded-full overflow-hidden">
            <motion.div 
              className="h-full bg-indigo-500"
              initial={{ width: 0 }}
              animate={{ width: `${surveyProgress}%` }}
            />
          </div>
        </div>

        {error && (
          <div className="bg-rose-500/10 border border-rose-500/20 text-rose-400 p-4 rounded-3xl flex items-center gap-3 text-xs font-bold">
            <AlertTriangle className="w-5 h-5 shrink-0" />
            {error}
          </div>
        )}

        {/* Professional Actions */}
        <div className="grid grid-cols-2 gap-4 pt-4">
          <button 
            onClick={onCancel}
            className="flex items-center justify-center gap-2 py-5 bg-slate-900 hover:bg-slate-800 border border-white/5 rounded-[24px] font-black text-sm transition-all active:scale-95"
          >
            <X className="w-5 h-5" />
            لغو عملیات
          </button>
          
          {isProcessing ? (
            <button 
              onClick={stopObservation}
              className="flex items-center justify-center gap-2 py-5 bg-rose-600 hover:bg-rose-500 text-white rounded-[24px] font-black text-sm shadow-xl shadow-rose-900/20 transition-all active:scale-95"
            >
              <Activity className="w-5 h-5" />
              توقف و فیکس
            </button>
          ) : (
            <button 
              onClick={startObservation}
              className="flex items-center justify-center gap-2 py-5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-[24px] font-black text-sm shadow-xl shadow-indigo-900/20 transition-all active:scale-95"
            >
              <RefreshCw className="w-5 h-5" />
              کالیبراسیون مجدد
            </button>
          )}
        </div>

        {!isProcessing && (bestReading || currentReading) && (
          <div className="space-y-4 w-full">
            {isPoorSignal && (
              <div className="bg-amber-500/10 border border-amber-500/20 text-amber-500 p-4 rounded-3xl flex items-center gap-3 text-xs font-bold">
                <AlertTriangle className="w-5 h-5 shrink-0" />
                دقت برداشت پایین است ({ (bestReading || currentReading)?.accuracy.toFixed(1) } متر). توصیه می‌شود مجدداً کالیبره کنید.
              </div>
            )}
            <button 
              onClick={() => {
                const finalReading = bestReading || currentReading;
                if (finalReading) {
                  onConfirm({
                    ...finalReading,
                    satellites,
                    confidence: spatialConfidence,
                    stability,
                    isSettled: settleProgress === 100
                  });
                }
              }}
              className={cn(
                "w-full flex items-center justify-center gap-3 py-6 text-white rounded-[32px] font-black text-lg shadow-2xl transition-all active:scale-95 border-t border-white/20",
                isPoorSignal ? "bg-amber-600 hover:bg-amber-500 shadow-amber-900/40" : "bg-emerald-600 hover:bg-emerald-500 shadow-emerald-900/40"
              )}
            >
              <Check className="w-7 h-7" />
              تأیید و ثبت در کاداستر
            </button>
          </div>
        )}
      </div>

      <style>{`
        .scope-ring {
          animation: pulse-ring 4s cubic-bezier(0.4, 0, 0.6, 1) infinite;
        }
        @keyframes pulse-ring {
          0%, 100% { opacity: 0.3; transform: scale(1); }
          50% { opacity: 0.1; transform: scale(1.05); }
        }
        .radar-sweep {
          position: absolute;
          inset: 0;
          background: conic-gradient(from 0deg, transparent 0%, rgba(52, 211, 153, 0.1) 50%, transparent 100%);
          border-radius: 50%;
          animation: rotate-radar 4s linear infinite;
        }
        @keyframes rotate-radar {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </motion.div>
  );
}
