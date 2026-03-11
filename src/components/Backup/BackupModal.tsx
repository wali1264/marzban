import React, { useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Download, Upload, X, Database, AlertCircle, CheckCircle2 } from 'lucide-react';
import { Point, Connection, Parcel } from '../../types';

interface BackupModalProps {
  isOpen: boolean;
  onClose: () => void;
  points: Point[];
  connections: Connection[];
  parcels: Parcel[];
  onRestore: (data: { points: Point[]; connections: Connection[]; parcels: Parcel[] }) => void;
}

export default function BackupModal({ isOpen, onClose, points, connections, parcels, onRestore }: BackupModalProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = React.useState<{ type: 'success' | 'error' | null; message: string }>({ type: null, message: '' });

  const handleCreateBackup = () => {
    const backupData = {
      version: '1.0',
      timestamp: new Date().toISOString(),
      data: {
        points,
        connections,
        parcels
      }
    };

    const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `marzban_backup_${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    
    setStatus({ type: 'success', message: 'نسخه پشتیبان با موفقیت ایجاد شد' });
    setTimeout(() => setStatus({ type: null, message: '' }), 3000);
  };

  const handleRestoreBackup = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const content = e.target?.result as string;
        const backup = JSON.parse(content);

        if (!backup.data || !backup.data.points || !backup.data.connections || !backup.data.parcels) {
          throw new Error('فرمت فایل پشتیبان نامعتبر است');
        }

        if (confirm('آیا از بازیابی اطلاعات اطمینان دارید؟ تمامی اطلاعات فعلی جایگزین خواهند شد.')) {
          onRestore(backup.data);
          setStatus({ type: 'success', message: 'اطلاعات با موفقیت بازیابی شد' });
          setTimeout(() => {
            setStatus({ type: null, message: '' });
            onClose();
          }, 2000);
        }
      } catch (err) {
        setStatus({ type: 'error', message: 'خطا در بازیابی فایل: ' + (err as Error).message });
        setTimeout(() => setStatus({ type: null, message: '' }), 5000);
      }
    };
    reader.readAsText(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
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
              
              <div className="w-20 h-20 bg-amber-100 rounded-3xl flex items-center justify-center mx-auto mb-6 shadow-inner">
                <Database className="w-10 h-10 text-amber-600" />
              </div>
              <h2 className="text-2xl font-black text-slate-900 mb-2">مدیریت نسخه پشتیبان</h2>
              <p className="text-slate-500 text-sm">پشتیبان‌گیری و بازیابی اطلاعات اراضی</p>
            </div>

            <div className="p-8 pt-0 space-y-4">
              {status.type && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={`p-4 rounded-2xl flex items-center gap-3 text-sm font-bold ${
                    status.type === 'success' ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'
                  }`}
                >
                  {status.type === 'success' ? <CheckCircle2 className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
                  {status.message}
                </motion.div>
              )}

              <button
                onClick={handleCreateBackup}
                className="w-full py-5 bg-indigo-600 text-white rounded-[24px] font-bold shadow-xl shadow-indigo-200 hover:bg-indigo-700 transition-all active:scale-95 flex items-center justify-center gap-3"
              >
                <Download className="w-5 h-5" />
                ایجاد نسخه پشتیبان (JSON)
              </button>

              <button
                onClick={() => fileInputRef.current?.click()}
                className="w-full py-5 bg-white border-2 border-slate-100 text-slate-700 rounded-[24px] font-bold hover:bg-slate-50 transition-all active:scale-95 flex items-center justify-center gap-3"
              >
                <Upload className="w-5 h-5 text-amber-600" />
                بازیابی از نسخه پشتیبان
              </button>

              <input
                type="file"
                ref={fileInputRef}
                onChange={handleRestoreBackup}
                accept=".json"
                className="hidden"
              />

              <div className="pt-4 text-center">
                <p className="text-[10px] text-slate-400 leading-relaxed">
                  نسخه پشتیبان شامل تمامی نقاط ثبت شده، اتصالات و اطلاعات مالکین می‌باشد.
                  <br />
                  این قابلیت به صورت کاملاً آفلاین عمل می‌کند.
                </p>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
