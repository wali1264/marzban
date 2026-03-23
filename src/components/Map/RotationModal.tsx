import React, { useState, useRef, useEffect } from 'react';
import { motion, useDragControls } from 'framer-motion';
import { 
  X, 
  GripHorizontal, 
  RotateCcw, 
  Info, 
  ChevronLeft, 
  ChevronRight, 
  ChevronsLeft, 
  ChevronsRight, 
  Plus, 
  Minus 
} from 'lucide-react';
import { cn } from '../../utils';

interface RotationModalProps {
  isOpen: boolean;
  onClose: () => void;
  angle: number;
  onAngleChange: (angle: number) => void;
  parcelName?: string;
}

export const RotationModal: React.FC<RotationModalProps> = ({
  isOpen,
  onClose,
  angle,
  onAngleChange,
  parcelName
}) => {
  const dragControls = useDragControls();

  const updateAngle = (delta: number) => {
    let newAngle = (angle + delta) % 360;
    if (newAngle < 0) newAngle += 360;
    // Round to 1 decimal place to avoid float precision issues
    onAngleChange(Math.round(newAngle * 10) / 10);
  };

  if (!isOpen) return null;

  return (
    <motion.div
      drag
      dragControls={dragControls}
      dragListener={false}
      dragMomentum={false}
      initial={{ opacity: 0, scale: 0.9, y: 20 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.9, y: 20 }}
      className="fixed bottom-24 left-4 z-[2000] w-64 bg-white rounded-[32px] shadow-2xl border border-slate-200 overflow-hidden"
    >
      {/* Header / Drag Handle */}
      <div 
        onPointerDown={(e) => dragControls.start(e)}
        className="bg-slate-50 px-4 py-3 border-b border-slate-200 flex items-center justify-between cursor-grab active:cursor-grabbing"
      >
        <div className="flex items-center gap-2">
          <div className="bg-amber-100 p-1.5 rounded-xl">
            <RotateCcw className="w-4 h-4 text-amber-600" />
          </div>
          <span className="text-xs font-black text-slate-800">تنظیم دقیق زاویه</span>
        </div>
        <GripHorizontal className="w-4 h-4 text-slate-400" />
      </div>

      <div className="p-5 flex flex-col gap-5">
        {parcelName ? (
          <div className="bg-slate-50 p-3 rounded-2xl border border-slate-100">
            <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wider mb-1">قطعه در حال ویرایش</p>
            <p className="text-xs font-black text-slate-900 truncate">{parcelName}</p>
          </div>
        ) : (
          <div className="flex items-center gap-2 p-3 bg-amber-50 rounded-2xl text-amber-700 border border-amber-100">
            <Info className="w-4 h-4 shrink-0" />
            <p className="text-[10px] font-bold leading-tight">لطفاً برای تنظیم زاویه، روی یک قطعه در نقشه کلیک کنید.</p>
          </div>
        )}

        {/* Precise Controls */}
        <div className="flex flex-col gap-4">
          {/* Numeric Display */}
          <div className="flex items-center justify-center gap-3">
            <div className="relative group">
              <input 
                type="number"
                step="0.1"
                value={angle}
                onChange={(e) => {
                  let val = parseFloat(e.target.value);
                  if (isNaN(val)) return;
                  
                  // Normalize to 0-360 range
                  let normalized = val % 360;
                  if (normalized < 0) normalized += 360;
                  
                  onAngleChange(Math.round(normalized * 10) / 10);
                }}
                className="w-24 text-center text-2xl font-black bg-slate-50 border-2 border-slate-100 rounded-2xl py-2 focus:border-amber-500 focus:outline-none transition-all tabular-nums"
              />
              <span className="absolute -right-6 top-1/2 -translate-y-1/2 text-xl font-black text-slate-300">°</span>
            </div>
          </div>

          {/* Adjustment Buttons Grid */}
          <div className="grid grid-cols-2 gap-3">
            {/* Decrease Column */}
            <div className="flex flex-col gap-2">
              <button 
                onClick={() => updateAngle(-10)}
                className="flex items-center justify-between px-3 py-2 bg-rose-50 text-rose-600 rounded-xl hover:bg-rose-100 transition-colors group"
              >
                <ChevronsLeft className="w-4 h-4 group-active:-translate-x-1 transition-transform" />
                <span className="text-[10px] font-black">۱۰-</span>
              </button>
              <button 
                onClick={() => updateAngle(-1)}
                className="flex items-center justify-between px-3 py-2 bg-rose-50 text-rose-600 rounded-xl hover:bg-rose-100 transition-colors group"
              >
                <ChevronLeft className="w-4 h-4 group-active:-translate-x-1 transition-transform" />
                <span className="text-[10px] font-black">۱-</span>
              </button>
              <button 
                onClick={() => updateAngle(-0.1)}
                className="flex items-center justify-between px-3 py-2 bg-rose-50 text-rose-600 rounded-xl hover:bg-rose-100 transition-colors group"
              >
                <Minus className="w-4 h-4 group-active:scale-90 transition-transform" />
                <span className="text-[10px] font-black">۰.۱-</span>
              </button>
            </div>

            {/* Increase Column */}
            <div className="flex flex-col gap-2">
              <button 
                onClick={() => updateAngle(10)}
                className="flex items-center justify-between px-3 py-2 bg-emerald-50 text-emerald-600 rounded-xl hover:bg-emerald-100 transition-colors group"
              >
                <span className="text-[10px] font-black">۱۰+</span>
                <ChevronsRight className="w-4 h-4 group-active:translate-x-1 transition-transform" />
              </button>
              <button 
                onClick={() => updateAngle(1)}
                className="flex items-center justify-between px-3 py-2 bg-emerald-50 text-emerald-600 rounded-xl hover:bg-emerald-100 transition-colors group"
              >
                <span className="text-[10px] font-black">۱+</span>
                <ChevronRight className="w-4 h-4 group-active:translate-x-1 transition-transform" />
              </button>
              <button 
                onClick={() => updateAngle(0.1)}
                className="flex items-center justify-between px-3 py-2 bg-emerald-50 text-emerald-600 rounded-xl hover:bg-emerald-100 transition-colors group"
              >
                <span className="text-[10px] font-black">۰.۱+</span>
                <Plus className="w-4 h-4 group-active:scale-110 transition-transform" />
              </button>
            </div>
          </div>
        </div>

        {/* Presets & Close */}
        <div className="flex flex-col gap-2 pt-2 border-t border-slate-100">
          <div className="grid grid-cols-2 gap-2">
            {[0, 90].map(val => (
              <button
                key={val}
                onClick={() => onAngleChange(val)}
                className={cn(
                  "py-2 rounded-xl text-[10px] font-black transition-all",
                  angle === val ? "bg-amber-600 text-white shadow-lg shadow-amber-100" : "bg-slate-50 text-slate-600 hover:bg-slate-100"
                )}
              >
                {val === 0 ? 'افقی (۰°)' : 'عمودی (۹۰°)'}
              </button>
            ))}
          </div>
          <button
            onClick={onClose}
            className="w-full py-3 bg-slate-900 text-white rounded-2xl text-xs font-black shadow-xl hover:bg-black transition-all active:scale-95 mt-1"
          >
            تایید و بستن
          </button>
        </div>
      </div>
    </motion.div>
  );
};
