import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Crosshair, 
  RefreshCw, 
  Check, 
  X, 
  Navigation, 
  AlertTriangle,
  Target,
  Activity
} from 'lucide-react';
import { Point } from '../../types';
import { cn } from '../../utils';

interface PrecisionRecorderProps {
  onConfirm: (point: Omit<Point, 'id' | 'timestamp'>) => void;
  onCancel: () => void;
  duration?: number; // in seconds
}

export default function PrecisionRecorder({ onConfirm, onCancel }: PrecisionRecorderProps) {
  const [isProcessing, setIsProcessing] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [readings, setReadings] = useState<{ lat: number; lng: number; accuracy: number }[]>([]);
  const [currentReading, setCurrentReading] = useState<{ lat: number; lng: number; accuracy: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const watchIdRef = useRef<number | null>(null);

  const startObservation = useCallback(() => {
    if (!navigator.geolocation) {
      setError("GPS پشتیبانی نمی‌شود.");
      return;
    }

    setIsProcessing(true);
    setElapsedSeconds(0);
    setReadings([]);
    setError(null);

    const startTime = Date.now();

    // Start watching position
    watchIdRef.current = navigator.geolocation.watchPosition(
      (position) => {
        const newReading = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracy: position.coords.accuracy
        };
        setCurrentReading(newReading);
        setReadings(prev => [...prev, newReading]);
      },
      (err) => {
        console.error(err);
        setError("خطا در دریافت سیگنال GPS");
        stopObservation();
      },
      { enableHighAccuracy: true }
    );

    // Elapsed timer
    timerRef.current = setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - startTime) / 1000));
    }, 1000);
  }, []);

  const stopObservation = () => {
    setIsProcessing(false);
    if (timerRef.current) clearInterval(timerRef.current);
    if (watchIdRef.current !== null) navigator.geolocation.clearWatch(watchIdRef.current);
  };

  useEffect(() => {
    startObservation();
    return () => stopObservation();
  }, []);

  const getWeightedAverage = () => {
    if (readings.length === 0) return currentReading;
    
    // Weighted average based on accuracy (lower accuracy = higher weight)
    let totalWeight = 0;
    let weightedLat = 0;
    let weightedLng = 0;
    let minAccuracy = Infinity;

    readings.forEach(r => {
      const weight = 1 / (r.accuracy * r.accuracy); // Inverse square weight
      totalWeight += weight;
      weightedLat += r.lat * weight;
      weightedLng += r.lng * weight;
      if (r.accuracy < minAccuracy) minAccuracy = r.accuracy;
    });

    return {
      lat: weightedLat / totalWeight,
      lng: weightedLng / totalWeight,
      accuracy: minAccuracy // We report the best accuracy achieved
    };
  };

  const bestReading = getWeightedAverage();
  
  // Improved confidence formula: 
  // 3m or less = 100%
  // 10m = 85%
  // 20m = 65%
  // 50m = 30%
  const calculateConfidence = (acc: number) => {
    if (acc <= 3) return 100;
    if (acc >= 100) return 5;
    return Math.max(5, 100 - (acc - 3) * 1.5);
  };

  const accuracyPercentage = bestReading ? calculateConfidence(bestReading.accuracy) : 0;

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[2000] bg-slate-900/95 backdrop-blur-xl flex flex-col items-center justify-center p-6 text-white"
      dir="rtl"
    >
      {/* Scope UI */}
      <div className="relative w-64 h-64 mb-8">
        <div className="absolute inset-0 border-2 border-emerald-500/30 rounded-full scope-ring" />
        <div className="absolute inset-4 border border-emerald-500/20 rounded-full" />
        <div className="absolute inset-0 flex items-center justify-center">
          <Crosshair className={cn("w-12 h-12 transition-all", isProcessing ? "text-emerald-500 scale-110" : "text-slate-500")} />
        </div>
        
        {/* Scanning lines */}
        {isProcessing && <div className="scan-line" />}
        
        {/* Corner Brackets */}
        <div className="absolute top-0 left-0 w-8 h-8 border-t-2 border-l-2 border-emerald-500 rounded-tl-lg" />
        <div className="absolute top-0 right-0 w-8 h-8 border-t-2 border-r-2 border-emerald-500 rounded-tr-lg" />
        <div className="absolute bottom-0 left-0 w-8 h-8 border-b-2 border-l-2 border-emerald-500 rounded-bl-lg" />
        <div className="absolute bottom-0 right-0 w-8 h-8 border-b-2 border-r-2 border-emerald-500 rounded-br-lg" />
      </div>

      {/* Data Display */}
      <div className="w-full max-w-sm space-y-6 text-center">
        <div>
          <h2 className="text-2xl font-bold mb-1">تقویت دقت مختصات</h2>
          <p className="text-slate-400 text-sm">سیستم در حال میانگین‌گیری وزنی از سیگنال‌هاست...</p>
        </div>

        <div className="bg-slate-800/50 rounded-3xl p-6 border border-slate-700">
          <div className="flex justify-between items-center mb-6 px-2">
            <div className="text-right">
              <span className="text-[10px] text-slate-500 uppercase tracking-wider block">زمان سپری شده</span>
              <span className="font-mono text-xl text-emerald-400">{elapsedSeconds} ثانیه</span>
            </div>
            <div className="text-left">
              <span className="text-[10px] text-slate-500 uppercase tracking-wider block">تعداد نمونه‌ها</span>
              <span className="font-mono text-xl text-emerald-400">{readings.length}</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 mb-6">
            <div className="text-right">
              <span className="text-xs text-slate-500 block mb-1">عرض جغرافیایی</span>
              <span className="font-mono text-base">{bestReading?.lat.toFixed(8) || "---"}</span>
            </div>
            <div className="text-right">
              <span className="text-xs text-slate-500 block mb-1">طول جغرافیایی</span>
              <span className="font-mono text-base">{bestReading?.lng.toFixed(8) || "---"}</span>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex justify-between text-xs mb-1">
              <span className="text-slate-400">دقت فعلی: {bestReading?.accuracy.toFixed(2) || "---"} متر</span>
              <span className={cn(
                "font-bold",
                accuracyPercentage > 85 ? "text-emerald-400" : accuracyPercentage > 60 ? "text-amber-400" : "text-rose-400"
              )}>
                {accuracyPercentage.toFixed(0)}% اطمینان
              </span>
            </div>
            <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
              <motion.div 
                className={cn(
                  "h-full transition-colors duration-500",
                  accuracyPercentage > 85 ? "bg-emerald-500" : accuracyPercentage > 60 ? "bg-amber-500" : "bg-rose-500"
                )}
                initial={{ width: 0 }}
                animate={{ width: `${accuracyPercentage}%` }}
              />
            </div>
          </div>
        </div>

        {error && (
          <div className="bg-rose-500/20 border border-rose-500/50 text-rose-200 p-3 rounded-2xl flex items-center gap-2 text-sm">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            {error}
          </div>
        )}

        {/* Actions */}
        <div className="grid grid-cols-2 gap-3 pt-4">
          <button 
            onClick={onCancel}
            className="flex items-center justify-center gap-2 py-4 bg-slate-800 hover:bg-slate-700 rounded-2xl font-bold transition-all"
          >
            <X className="w-5 h-5" />
            انصراف
          </button>
          
          {isProcessing ? (
            <button 
              onClick={stopObservation}
              className="flex items-center justify-center gap-2 py-4 bg-rose-600 hover:bg-rose-500 text-white rounded-2xl font-bold transition-all"
            >
              <Activity className="w-5 h-5" />
              توقف و تحلیل
            </button>
          ) : (
            <button 
              onClick={startObservation}
              className="flex items-center justify-center gap-2 py-4 bg-amber-500 hover:bg-amber-600 text-white rounded-2xl font-bold transition-all"
            >
              <RefreshCw className="w-5 h-5" />
              شروع مجدد
            </button>
          )}
        </div>

        {!isProcessing && bestReading && (
          <button 
            onClick={() => onConfirm(bestReading)}
            className="w-full flex items-center justify-center gap-2 py-5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-2xl font-bold shadow-lg shadow-emerald-900/20 transition-all active:scale-95 mt-4"
          >
            <Check className="w-6 h-6" />
            تایید و ثبت نهایی مختصات
          </button>
        )}
        
        {isProcessing && (
          <p className="text-[10px] text-slate-500 italic">
            نکته: هرچه بیشتر در این حالت بمانید، میانگین‌گیری دقیق‌تر خواهد بود.
          </p>
        )}
      </div>
    </motion.div>
  );
}
