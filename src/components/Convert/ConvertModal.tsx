import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Box, X, CheckCircle2, AlertCircle, Zap, MapPin } from 'lucide-react';
import { Point, Parcel, Division, Connection } from '../../types';
import * as turf from '@turf/turf';

interface ConvertModalProps {
  isOpen: boolean;
  onClose: () => void;
  parcel: Parcel;
  division?: Division | null;
  points: Point[];
  connections: Connection[];
  onConvert: (newPoints: Point[], newParcels: Parcel[], newConnections: Connection[]) => void;
}

export default function ConvertModal({ isOpen, onClose, parcel, division, points, connections, onConvert }: ConvertModalProps) {
  const [isProcessing, setIsProcessing] = React.useState(false);

  const totalPercentage = React.useMemo(() => {
    return parcel.divisions.reduce((sum, d) => sum + d.percentage, 0);
  }, [parcel.divisions]);

  const isComplete = parcel.isAngleSet || Math.abs(totalPercentage - 100) < 0.01;

  const handleConvert = () => {
    if (!isComplete) return;
    setIsProcessing(true);
    
    const generateId = () => Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
    
    const allNewPoints: Point[] = [];
    const allNewParcels: Parcel[] = [];
    const allNewConnections: Connection[] = [];
    
    const nextGeneration = (parcel.generation || 1) + 1;
    
    // Determine which divisions to convert
    const divisionsToConvert = division ? [division] : parcel.divisions;

    divisionsToConvert.forEach((div, divIdx) => {
      const newPointIds: string[] = [];
      
      div.geometry.forEach((part) => {
        const partPointIds: string[] = [];
        
        part.forEach((coord, index) => {
          // Skip the last point if it's the same as the first (closed loop)
          if (index === part.length - 1 && 
              coord[0] === part[0][0] && 
              coord[1] === part[0][1]) {
            return;
          }

          // Check if we already created a point for this coordinate in this batch
          const existingNewPoint = allNewPoints.find(p => {
            const distance = turf.distance(
              turf.point([p.lng, p.lat]),
              turf.point([coord[1], coord[0]]),
              { units: 'meters' }
            );
            return distance < 0.01; // 1cm threshold
          });

          if (existingNewPoint) {
            if (!partPointIds.includes(existingNewPoint.id)) {
              partPointIds.push(existingNewPoint.id);
            }
          } else {
            const newId = generateId();
            const newPoint: Point = {
              id: newId,
              lng: coord[1],
              lat: coord[0],
              timestamp: Date.now(),
              accuracy: 0.1, // High precision generated point
              generation: nextGeneration
            };
            allNewPoints.push(newPoint);
            partPointIds.push(newId);
          }
        });

        // Add connections for this part
        for (let i = 0; i < partPointIds.length; i++) {
          const fromId = partPointIds[i];
          const toId = partPointIds[(i + 1) % partPointIds.length];
          
          // Check if connection already exists in this batch
          const connExists = allNewConnections.some(c => 
            (c.fromId === fromId && c.toId === toId) || 
            (c.fromId === toId && c.toId === fromId)
          );

          if (!connExists) {
            allNewConnections.push({
              id: generateId(),
              fromId,
              toId,
              generation: nextGeneration
            });
          }
        }

        // Collect all point IDs for the parcel
        partPointIds.forEach(id => {
          if (!newPointIds.includes(id)) {
            newPointIds.push(id);
          }
        });
      });

      const allPolygons = div.geometry.map(g => turf.polygon([[...g.map(c => [c[1], c[0]]), [g[0][1], g[0][0]]]]));
      const totalArea = turf.area(turf.featureCollection(allPolygons));

      const newParcel: Parcel = {
        id: generateId(),
        name: `قطعه تفکیکی ${divIdx + 1} از ${parcel.ownerName || 'زمین اصلی'}`,
        pointIds: newPointIds,
        divisions: [],
        area: totalArea,
        ownerName: div.partnerId || parcel.ownerName, // Use partner name if available
        generation: nextGeneration,
        parentId: parcel.id,
        createdAt: Date.now()
      };
      
      allNewParcels.push(newParcel);
    });

    onConvert(allNewPoints, allNewParcels, allNewConnections);
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
              <h2 className="text-2xl font-black text-slate-900 mb-2">
                {division ? "تبدیل سهم به قطعه مستقل" : "تبدیل تمام سهام به قطعات مستقل"}
              </h2>
              <p className="text-slate-500 text-sm">محاسبه مختصات دقیق و مادی‌سازی هندسه</p>
            </div>

            <div className="p-8 pt-0 space-y-6">
              <div className="bg-slate-50 rounded-3xl p-6 space-y-4 border border-slate-100">
                {division ? (
                  <>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-slate-500">مساحت سهم:</span>
                      <span className="font-bold text-slate-900">
                        {(() => {
                          const allPolygons = division.geometry.map(g => turf.polygon([[...g.map(c => [c[1], c[0]]), [g[0][1], g[0][0]]]]));
                          const area = turf.area(turf.featureCollection(allPolygons));
                          return Math.round(area).toLocaleString();
                        })()} متر مربع
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-slate-500">درصد از کل:</span>
                      <span className="font-bold text-indigo-600">{division.percentage}٪</span>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-slate-500">تعداد کل سهام:</span>
                      <span className="font-bold text-slate-900">{parcel.divisions.length} سهم</span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-slate-500">مجموع مساحت:</span>
                      <span className="font-bold text-emerald-600">
                        {Math.round(parcel.area).toLocaleString()} متر مربع
                      </span>
                    </div>
                  </>
                )}
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-500">تعداد رئوس جدید:</span>
                  <span className="font-bold text-slate-900">
                    {division 
                      ? division.geometry.reduce((sum, g) => sum + g.length - 1, 0)
                      : parcel.divisions.reduce((sum, d) => sum + d.geometry.reduce((s, g) => s + g.length - 1, 0), 0)
                    } نقطه
                  </span>
                </div>
              </div>

              <div className="flex items-start gap-3 p-4 bg-amber-50 rounded-2xl border border-amber-100">
                <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="text-xs text-amber-800 leading-relaxed">
                    با تایید این عملیات، {division ? "این سهم" : "تمام سهام این قطعه"} به صورت خودکار به قطعات مستقل با شناسنامه مجزا تبدیل خواهند شد.
                  </p>
                  {!isComplete && (
                    <p className="text-[10px] text-red-600 font-bold">
                      هشدار: مجموع سهام باید ۱۰۰٪ باشد. ابتدا تمام سهام را تعریف کنید.
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
                    در حال مادی‌سازی...
                  </>
                ) : (
                  <>
                    <Box className="w-5 h-5" />
                    {division ? "تایید و مادی‌سازی سهم" : "تایید و مادی‌سازی تمام سهام"}
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
