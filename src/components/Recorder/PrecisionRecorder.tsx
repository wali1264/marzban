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

export default function PrecisionRecorder({ onConfirm, onCancel, duration = 10 }: PrecisionRecorderProps) {
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
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
    setProgress(0);
    setReadings([]);
    setError(null);

    const startTime = Date.now();
    const totalMs = duration * 1000;

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

    // Progress timer
    timerRef.current = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const p = Math.min((elapsed / totalMs) * 100, 100);
      setProgress(p);

      if (p >= 100) {
        stopObservation();
      }
    }, 100);
  }, [duration]);

  const stopObservation = () => {
    setIsProcessing(false);
    if (timerRef.current) clearInterval(timerRef.current);
    if (watchIdRef.current !== null) navigator.geolocation.clearWatch(watchIdRef.current);
  };

  useEffect(() => {
    startObservation();
    return () => stopObservation();
  }, []);

  const getBestReading = () => {
    if (readings.length === 0) return currentReading;
    // Simple logic: return the reading with best accuracy
    return readings.reduce((prev, curr) => prev.accuracy < curr.accuracy ? prev : curr);
  };

  const bestReading = getBestReading();
  const accuracyPercentage = bestReading ? Math.max(0, 100 - (bestReading.accuracy * 2)) : 0;

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[2000] bg-slate-900/90 backdrop-blur-md flex flex-col items-center justify-center p-6 text-white"
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
          <h2 className="text-2xl font-bold mb-1">پردازش مختصات دقیق</h2>
          <p className="text-slate-400 text-sm">در حال میانگین‌گیری از سیگنال‌های دریافتی...</p>
        </div>

        <div className="bg-slate-800/50 rounded-3xl p-6 border border-slate-700">
          <div className="grid grid-cols-2 gap-4 mb-6">
            <div className="text-right">
              <span className="text-xs text-slate-500 block mb-1">عرض جغرافیایی (Lat)</span>
              <span className="font-mono text-lg">{currentReading?.lat.toFixed(8) || "---"}</span>
            </div>
            <div className="text-right">
              <span className="text-xs text-slate-500 block mb-1">طول جغرافیایی (Lng)</span>
              <span className="font-mono text-lg">{currentReading?.lng.toFixed(8) || "---"}</span>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex justify-between text-xs mb-1">
              <span className="text-slate-400">دقت تخمینی: {bestReading?.accuracy.toFixed(2) || "---"} متر</span>
              <span className={cn(
                "font-bold",
                accuracyPercentage > 80 ? "text-emerald-400" : "text-amber-400"
              )}>
                {accuracyPercentage.toFixed(0)}% اطمینان
              </span>
            </div>
            <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
              <motion.div 
                className="h-full bg-emerald-500"
                initial={{ width: 0 }}
                animate={{ width: `${progress}%` }}
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
          
          {!isProcessing ? (
            <button 
              onClick={startObservation}
              className="flex items-center justify-center gap-2 py-4 bg-amber-500 hover:bg-amber-600 text-white rounded-2xl font-bold transition-all"
            >
              <RefreshCw className="w-5 h-5" />
              تلاش مجدد
            </button>
          ) : (
            <div className="flex items-center justify-center gap-2 py-4 bg-slate-800 text-slate-500 rounded-2xl font-bold cursor-not-allowed">
              <Activity className="w-5 h-5 animate-pulse" />
              در حال پردازش...
            </div>
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
      </div>
    </motion.div>
  );
}
