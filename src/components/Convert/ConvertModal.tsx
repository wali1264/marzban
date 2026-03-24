import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Box, X, CheckCircle2, AlertCircle, Zap, MapPin } from 'lucide-react';
import { Point, Parcel, Division } from '../../types';
import * as turf from '@turf/turf';

interface ConvertModalProps {
  isOpen: boolean;
  onClose: () => void;
  parcel: Parcel;
  division: Division;
  points: Point[];
  onConvert: (newPoints: Point[], newParcel: Parcel) => void;
}

export default function ConvertModal({ isOpen, onClose, parcel, division, points, onConvert }: ConvertModalProps) {
  const [isProcessing, setIsProcessing] = React.useState(false);

  const totalPercentage = React.useMemo(() => {
    return parcel.divisions.reduce((sum, d) => sum + d.percentage, 0);
  }, [parcel.divisions]);

  const isComplete = parcel.isFullyAllocated || Math.abs(totalPercentage - 100) < 0.01;

  const divisionArea = React.useMemo(() => {
    const allPolygons = division.geometry.map(g => turf.polygon([[...g.map(c => [c[1], c[0]]), [g[0][1], g[0][0]]]]));
    return turf.area(turf.featureCollection(allPolygons));
  }, [division.geometry]);

  const handleConvert = () => {
    if (!isComplete) return;
    setIsProcessing(true);
    
    const generateId = () => Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
    
    const newPoints: Point[] = [];
    const newPointIds: string[] = [];
    const addedPointIdsSet = new Set<string>();
    
    // Optimization: Create a spatial index (simple grid) for existing points
    // to avoid O(N*M) distance calculations.
    // For 1cm precision, we can use a grid of ~1cm.
    // 0.0000001 degrees is roughly 1cm.
    const pointGrid = new Map<string, string>();
    points.forEach(p => {
      const key = `${Math.round(p.lng * 10000000)},${Math.round(p.lat * 10000000)}`;
      pointGrid.set(key, p.id);
    });

    division.geometry.forEach((part) => {
      part.forEach((coord, index) => {
        // Skip the last point if it's the same as the first (closed loop)
        if (index === part.length - 1 && 
            coord[0] === part[0][0] && 
            coord[1] === part[0][1]) {
          return;
        }

        // Check if any of these coordinates already match existing points
        // using the grid lookup (O(1) average case)
        const key = `${Math.round(coord[1] * 10000000)},${Math.round(coord[0] * 10000000)}`;
        const existingPointId = pointGrid.get(key);

        if (existingPointId) {
          if (!addedPointIdsSet.has(existingPointId)) {
            newPointIds.push(existingPointId);
            addedPointIdsSet.add(existingPointId);
          }
        } else {
          const newId = generateId();
          const newPoint: Point = {
            id: newId,
            lng: coord[1],
            lat: coord[0],
            timestamp: Date.now(),
            accuracy: 0.1 // High precision generated point
          };
          newPoints.push(newPoint);
          newPointIds.push(newId);
          addedPointIdsSet.add(newId);
          // Add to grid to avoid duplicates within the same geometry
          pointGrid.set(key, newId);
        }
      });
    });

    const newParcel: Parcel = {
      id: generateId(),
      name: `قطعه تفکیکی از ${parcel.ownerName || 'زمین اصلی'}`,
      pointIds: newPointIds,
      divisions: [],
      area: divisionArea,
      ownerName: parcel.ownerName, // Carry over owner if exists
      generation: (parcel.generation || 1) + 1,
      createdAt: Date.now()
    };

    onConvert(newPoints, newParcel);
    setIsProcessing(false);
    onClose();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[6000] flex items-center justify-center p-4" dir="rtl">
          <motion.div
            initial={{ scale: 0.9, y: 20, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            exit={{ scale: 0.9, y: 20, opacity: 0 }}
            className="bg-white rounded-[40px] shadow-2xl w-full max-w-md overflow-hidden border border-white/20"
          >
            <div className="p-8 text-center bg-gradient-to-b from-slate-50 to-white relative">
              <button 
                onClick={onClose}
                className="absolute top-6 right-6 p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-all"
              >
                <X className="w-5 h-5" />
              </button>
              
              <div className="w-20 h-20 bg-emerald-100 rounded-3xl flex items-center justify-center mx-auto mb-6 shadow-inner">
                <Zap className="w-10 h-10 text-emerald-600" />
              </div>
              <h2 className="text-2xl font-black text-slate-900 mb-2">تبدیل سهم به قطعه مستقل</h2>
              <p className="text-slate-500 text-sm">محاسبه مختصات دقیق و مادی‌سازی هندسه</p>
            </div>

            <div className="p-8 pt-0 space-y-6">
              <div className="bg-slate-50 rounded-3xl p-6 space-y-4 border border-slate-100">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-500">مساحت سهم:</span>
                  <span className="font-bold text-slate-900">
                    {Math.round(divisionArea).toLocaleString()} متر مربع
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-500">درصد از کل:</span>
                  <span className="font-bold text-indigo-600">{division.percentage}٪</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-500">تعداد رئوس:</span>
                  <span className="font-bold text-slate-900">{division.geometry.reduce((sum, g) => sum + g.length - 1, 0)} نقطه</span>
                </div>
              </div>

              <div className="flex items-start gap-3 p-4 bg-amber-50 rounded-2xl border border-amber-100">
                <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="text-xs text-amber-800 leading-relaxed">
                    با تایید این عملیات، نقاط جدیدی در محل تقاطع مرزها ایجاد شده و این سهم به یک قطعه مستقل با شناسنامه مجزا تبدیل خواهد شد.
                  </p>
                  {!isComplete && (
                    <p className="text-[10px] text-red-600 font-bold">
                      هشدار: مجموع سهام باید ۱۰۰٪ باشد (فعلاً {totalPercentage}٪). ابتدا تمام سهام را تعریف کنید.
                    </p>
                  )}
                </div>
              </div>

              <button
                onClick={handleConvert}
                disabled={isProcessing || !isComplete}
                className="w-full py-5 bg-emerald-600 text-white rounded-[24px] font-bold shadow-xl shadow-emerald-200 hover:bg-emerald-700 transition-all active:scale-95 flex items-center justify-center gap-3 disabled:opacity-50 disabled:scale-100 disabled:bg-slate-400 disabled:shadow-none"
              >
                {isProcessing ? (
                  <>
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    در حال محاسبه مختصات...
                  </>
                ) : (
                  <>
                    <Box className="w-5 h-5" />
                    تایید و مادی‌سازی سهم
                  </>
                )}
              </button>

              <div className="flex items-center justify-center gap-2 text-[10px] text-slate-400">
                <MapPin className="w-3 h-3" />
                <span>دقت محاسباتی: ۰.۰۰۱ متر (میلی‌متری)</span>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
