import React, { useState, useRef, useEffect } from 'react';
import { motion, useDragControls } from 'framer-motion';
import { X, GripHorizontal, RotateCcw, Info } from 'lucide-react';
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
  const [isDragging, setIsDragging] = useState(false);
  const dialRef = useRef<HTMLDivElement>(null);
  const dragControls = useDragControls();

  if (!isOpen) return null;

  const handleDialInteraction = (e: React.MouseEvent | React.TouchEvent | MouseEvent | TouchEvent) => {
    if (!dialRef.current) return;

    const rect = dialRef.current.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    let clientX, clientY;
    if ('touches' in e) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = (e as MouseEvent).clientX;
      clientY = (e as MouseEvent).clientY;
    }

    const dx = clientX - centerX;
    const dy = clientY - centerY;
    
    // Calculate angle in degrees
    let newAngle = Math.atan2(dy, dx) * (180 / Math.PI);
    
    // Normalize to 0-360
    newAngle = (newAngle + 360) % 360;
    
    // Round to nearest degree
    onAngleChange(Math.round(newAngle));
  };

  const onMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    handleDialInteraction(e);
  };

  const onTouchStart = (e: React.TouchEvent) => {
    setIsDragging(true);
    handleDialInteraction(e);
  };

  useEffect(() => {
    const handleMove = (e: MouseEvent | TouchEvent) => {
      if (isDragging) {
        handleDialInteraction(e);
      }
    };

    const handleUp = () => {
      setIsDragging(false);
    };

    if (isDragging) {
      window.addEventListener('mousemove', handleMove);
      window.addEventListener('mouseup', handleUp);
      window.addEventListener('touchmove', handleMove);
      window.addEventListener('touchend', handleUp);
    }

    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
      window.removeEventListener('touchmove', handleMove);
      window.removeEventListener('touchend', handleUp);
    };
  }, [isDragging]);

  return (
    <motion.div
      drag
      dragControls={dragControls}
      dragListener={false}
      dragMomentum={false}
      initial={{ opacity: 0, scale: 0.9, y: 20 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.9, y: 20 }}
      className="fixed bottom-24 left-4 z-[2000] w-64 bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden"
    >
      {/* Header / Drag Handle */}
      <div 
        onPointerDown={(e) => dragControls.start(e)}
        className="bg-slate-50 px-4 py-3 border-b border-slate-200 flex items-center justify-between cursor-grab active:cursor-grabbing"
      >
        <div className="flex items-center gap-2">
          <RotateCcw className="w-4 h-4 text-amber-600" />
          <span className="text-xs font-bold text-slate-700">تنظیم زاویه تقسیم</span>
        </div>
        <GripHorizontal className="w-4 h-4 text-slate-400" />
      </div>

      <div className="p-6 flex flex-col items-center gap-6">
        {parcelName ? (
          <div className="text-center">
            <p className="text-[10px] text-slate-400 uppercase tracking-wider mb-1">قطعه انتخاب شده</p>
            <p className="text-sm font-bold text-slate-800">{parcelName}</p>
          </div>
        ) : (
          <div className="flex items-center gap-2 px-3 py-2 bg-amber-50 rounded-xl text-amber-700">
            <Info className="w-4 h-4" />
            <p className="text-[10px] font-medium leading-tight">برای شروع، روی یک قطعه در نقشه کلیک کنید.</p>
          </div>
        )}

        {/* Dial Interface */}
        <div className="relative w-40 h-40 flex items-center justify-center">
          {/* Outer Ring */}
          <div className="absolute inset-0 rounded-full border-4 border-slate-100 shadow-inner" />
          
          {/* Degree Markers */}
          {[...Array(12)].map((_, i) => (
            <div 
              key={i}
              className="absolute w-1 h-3 bg-slate-200 rounded-full"
              style={{ 
                transform: `rotate(${i * 30}deg) translateY(-68px)` 
              }}
            />
          ))}

          {/* Interactive Dial Area */}
          <div 
            ref={dialRef}
            onMouseDown={onMouseDown}
            onTouchStart={onTouchStart}
            className="relative w-32 h-32 rounded-full bg-white shadow-lg border border-slate-100 flex items-center justify-center cursor-pointer group active:scale-95 transition-transform"
          >
            {/* Center Point */}
            <div className="w-2 h-2 bg-slate-300 rounded-full z-10" />
            
            {/* Needle */}
            <div 
              className="absolute top-1/2 left-1/2 w-1 h-16 bg-amber-500 origin-top rounded-full shadow-sm"
              style={{ 
                transform: `translate(-50%, -100%) rotate(${angle}deg)`,
                transition: isDragging ? 'none' : 'transform 0.2s ease-out'
              }}
            >
              <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 w-3 h-3 bg-amber-600 rounded-full border-2 border-white shadow-md" />
            </div>

            {/* Angle Display in Dial */}
            <div className="absolute bottom-4 text-center">
              <span className="text-2xl font-black text-slate-800 tabular-nums">{angle}°</span>
            </div>
          </div>
        </div>

        <div className="w-full grid grid-cols-4 gap-2">
          {[0, 45, 90, 180].map(val => (
            <button
              key={val}
              onClick={() => onAngleChange(val)}
              className={cn(
                "py-2 rounded-xl text-[10px] font-bold transition-all",
                angle === val ? "bg-amber-600 text-white shadow-md" : "bg-slate-50 text-slate-600 hover:bg-slate-100"
              )}
            >
              {val}°
            </button>
          ))}
        </div>

        <button
          onClick={onClose}
          className="w-full py-3 bg-slate-800 text-white rounded-2xl text-xs font-bold shadow-lg hover:bg-slate-900 transition-all active:scale-95"
        >
          بستن ابزار چرخش
        </button>
      </div>
    </motion.div>
  );
};
