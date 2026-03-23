import React from 'react';
import { motion, useDragControls } from 'framer-motion';
import { 
  X, 
  GripHorizontal, 
  RotateCcw, 
  Check,
  Edit2,
  Trash2,
  AlertCircle
} from 'lucide-react';
import { cn } from '../../utils';

interface RotationModalProps {
  isOpen: boolean;
  onClose: () => void;
  angle: number;
  isAngleSet?: boolean;
  hasDivisions?: boolean;
  onConfirm: () => void;
  onEdit: () => void;
  onDelete: () => void;
  parcelName?: string;
}

export const RotationModal: React.FC<RotationModalProps> = ({
  isOpen,
  onClose,
  angle,
  isAngleSet = false,
  hasDivisions = false,
  onConfirm,
  onEdit,
  onDelete,
  parcelName
}) => {
  const dragControls = useDragControls();

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
      className="fixed bottom-24 left-4 z-[2000] w-72 bg-white rounded-[32px] shadow-2xl border border-slate-200 overflow-hidden"
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
          <span className="text-xs font-black text-slate-800">تنظیم زاویه قطعه</span>
        </div>
        <GripHorizontal className="w-4 h-4 text-slate-400" />
      </div>

      <div className="p-5 flex flex-col gap-4">
        {parcelName && (
          <div className="bg-slate-50 p-3 rounded-2xl border border-slate-100">
            <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wider mb-1">قطعه انتخاب شده</p>
            <p className="text-xs font-black text-slate-900 truncate">{parcelName}</p>
          </div>
        )}

        {/* Angle Display */}
        <div className="flex items-center justify-center py-4 bg-slate-50 rounded-3xl border-2 border-dashed border-slate-200">
          <div className="text-center">
            <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">زاویه فعلی</p>
            <div className="flex items-baseline gap-1">
              <span className="text-4xl font-black text-slate-900 tabular-nums">{angle.toFixed(1)}</span>
              <span className="text-xl font-bold text-slate-400">°</span>
            </div>
          </div>
        </div>

        {/* Status Message */}
        {!isAngleSet ? (
          <div className="bg-blue-50 p-3 rounded-2xl border border-blue-100 flex items-start gap-2">
            <RotateCcw className="w-4 h-4 text-blue-600 mt-0.5 shrink-0" />
            <p className="text-[10px] font-bold text-blue-700 leading-tight">
              با کشیدن دستگیره‌های روی نقشه، زاویه را تنظیم کنید و سپس تایید کنید.
            </p>
          </div>
        ) : hasDivisions ? (
          <div className="bg-amber-50 p-3 rounded-2xl border border-amber-100 flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
            <p className="text-[10px] font-bold text-amber-700 leading-tight">
              این قطعه دارای تقسیم‌بندی است. برای تغییر زاویه، ابتدا باید سهام را حذف کنید.
            </p>
          </div>
        ) : null}

        {/* Action Buttons */}
        <div className="flex flex-col gap-2 pt-2">
          {!isAngleSet ? (
            <button
              onClick={onConfirm}
              className="w-full py-4 bg-emerald-600 text-white rounded-2xl font-black shadow-lg shadow-emerald-100 hover:bg-emerald-700 transition-all active:scale-95 flex items-center justify-center gap-2"
            >
              <Check className="w-5 h-5" />
              تایید و قفل زاویه
            </button>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={onEdit}
                disabled={hasDivisions}
                className={cn(
                  "py-4 rounded-2xl font-black transition-all flex items-center justify-center gap-2",
                  hasDivisions 
                    ? "bg-slate-100 text-slate-400 cursor-not-allowed" 
                    : "bg-blue-600 text-white shadow-lg shadow-blue-100 hover:bg-blue-700 active:scale-95"
                )}
              >
                <Edit2 className="w-4 h-4" />
                ویرایش
              </button>
              <button
                onClick={onDelete}
                disabled={hasDivisions}
                className={cn(
                  "py-4 rounded-2xl font-black transition-all flex items-center justify-center gap-2",
                  hasDivisions 
                    ? "bg-slate-100 text-slate-400 cursor-not-allowed" 
                    : "bg-rose-600 text-white shadow-lg shadow-rose-100 hover:bg-rose-700 active:scale-95"
                )}
              >
                <Trash2 className="w-4 h-4" />
                حذف
              </button>
            </div>
          )}
          
          <button
            onClick={onClose}
            className="w-full py-3 text-slate-400 font-bold hover:text-slate-600 transition-colors text-xs"
          >
            بستن پنجره
          </button>
        </div>
      </div>
    </motion.div>
  );
};
