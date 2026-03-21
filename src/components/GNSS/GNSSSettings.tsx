import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { 
  Bluetooth, 
  Settings, 
  Wifi, 
  Satellite, 
  Check, 
  X, 
  Save, 
  RefreshCw, 
  Info,
  Smartphone,
  Cpu,
  Target
} from 'lucide-react';
import { GNSSConfig, GNSSStatus } from '../../types';
import { cn } from '../../utils';

interface GNSSSettingsProps {
  config: GNSSConfig;
  status: GNSSStatus;
  onSave: (config: GNSSConfig) => void;
  onConnect: () => Promise<void>;
  onResetCalibration: () => void;
  onClose: () => void;
}

export default function GNSSSettings({ config, status, onSave, onConnect, onResetCalibration, onClose }: GNSSSettingsProps) {
  const [localConfig, setLocalConfig] = useState<GNSSConfig>(config);
  const [isConnecting, setIsConnecting] = useState(false);

  const handleSave = () => {
    onSave(localConfig);
    onClose();
  };

  const handleConnect = async () => {
    setIsConnecting(true);
    try {
      await onConnect();
    } catch (error) {
      console.error(error);
    } finally {
      setIsConnecting(false);
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 20 }}
      className="fixed inset-0 z-[3000] bg-slate-950/95 backdrop-blur-xl flex items-center justify-center p-4"
      dir="rtl"
    >
      <div className="w-full max-w-lg bg-slate-900 border border-white/10 rounded-[40px] shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-8 border-b border-white/5 flex justify-between items-center bg-slate-800/30">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-indigo-500/20 rounded-2xl flex items-center justify-center">
              <Cpu className="w-6 h-6 text-indigo-400" />
            </div>
            <div>
              <h2 className="text-2xl font-black text-white">تنظیمات GNSS حرفه‌ای</h2>
              <p className="text-slate-500 text-xs font-bold">مدیریت گیرنده‌های خارجی و تصحیحات RTK</p>
            </div>
          </div>
          <button onClick={onClose} className="p-3 hover:bg-white/5 rounded-2xl transition-colors">
            <X className="w-6 h-6 text-slate-400" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-8 space-y-8 custom-scrollbar">
          {/* Source Selection */}
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
                <Satellite className="w-4 h-4" />
                منبع دریافت موقعیت
              </h3>
              {config.locationOffset && (config.locationOffset.lat !== 0 || config.locationOffset.lng !== 0) && (
                <button 
                  onClick={onResetCalibration}
                  className="text-[10px] font-black text-rose-400 hover:text-rose-300 flex items-center gap-1 bg-rose-500/10 px-2 py-1 rounded-lg transition-colors"
                >
                  <RefreshCw className="w-3 h-3" />
                  حذف کالیبراسیون
                </button>
              )}
            </div>
            <div className="grid grid-cols-2 gap-4">
              <button 
                onClick={() => setLocalConfig({ ...localConfig, source: 'INTERNAL' })}
                className={cn(
                  "p-6 rounded-3xl border-2 transition-all flex flex-col items-center gap-3",
                  localConfig.source === 'INTERNAL' 
                    ? "bg-indigo-500/10 border-indigo-500 shadow-lg shadow-indigo-500/10" 
                    : "bg-slate-800/50 border-transparent hover:border-white/10"
                )}
              >
                <Smartphone className={cn("w-8 h-8", localConfig.source === 'INTERNAL' ? "text-indigo-400" : "text-slate-500")} />
                <span className={cn("font-bold text-sm", localConfig.source === 'INTERNAL' ? "text-white" : "text-slate-400")}>GPS داخلی گوشی</span>
              </button>
              <button 
                onClick={() => setLocalConfig({ ...localConfig, source: 'EXTERNAL' })}
                className={cn(
                  "p-6 rounded-3xl border-2 transition-all flex flex-col items-center gap-3",
                  localConfig.source === 'EXTERNAL' 
                    ? "bg-emerald-500/10 border-emerald-500 shadow-lg shadow-emerald-500/10" 
                    : "bg-slate-800/50 border-transparent hover:border-white/10"
                )}
              >
                <Bluetooth className={cn("w-8 h-8", localConfig.source === 'EXTERNAL' ? "text-emerald-400" : "text-slate-500")} />
                <span className={cn("font-bold text-sm", localConfig.source === 'EXTERNAL' ? "text-white" : "text-slate-400")}>گیرنده GNSS خارجی</span>
              </button>
            </div>
          </section>

          {/* Systematic Bias Correction */}
          <section className="space-y-4">
            <h3 className="text-xs font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
              <Target className="w-4 h-4" />
              تصحیح خطای سیستماتیک (Bias Correction)
            </h3>
            <div className="bg-slate-800/50 p-6 rounded-3xl border border-white/5 space-y-4">
              <p className="text-[10px] text-slate-400 leading-relaxed font-bold">
                اگر دستگاه شما به طور مداوم مختصات را با یک جابجایی ثابت (مثلاً ۱۰ متر به شرق) نشان می‌دهد، از این بخش برای کالیبره کردن استفاده کنید.
              </p>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-[9px] text-slate-500 font-black px-1">آفست عرض جغرافیایی (Lat Offset)</label>
                  <input 
                    type="number" 
                    step="0.000001"
                    value={localConfig.locationOffset?.lat || 0}
                    onChange={(e) => setLocalConfig({ 
                      ...localConfig, 
                      locationOffset: { 
                        lat: parseFloat(e.target.value), 
                        lng: localConfig.locationOffset?.lng || 0 
                      } 
                    })}
                    className="w-full bg-slate-900 border border-white/10 rounded-2xl px-4 py-3 text-sm font-mono focus:border-indigo-500 outline-none transition-all"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[9px] text-slate-500 font-black px-1">آفست طول جغرافیایی (Lng Offset)</label>
                  <input 
                    type="number" 
                    step="0.000001"
                    value={localConfig.locationOffset?.lng || 0}
                    onChange={(e) => setLocalConfig({ 
                      ...localConfig, 
                      locationOffset: { 
                        lat: localConfig.locationOffset?.lat || 0, 
                        lng: parseFloat(e.target.value) 
                      } 
                    })}
                    className="w-full bg-slate-900 border border-white/10 rounded-2xl px-4 py-3 text-sm font-mono focus:border-indigo-500 outline-none transition-all"
                  />
                </div>
              </div>
              <div className="flex gap-2">
                <button 
                  onClick={() => {
                    // Quick 10m North/East correction helper
                    const lat10m = 0.00009; // Approx 10m in Lat
                    const lng10m = 0.00011; // Approx 10m in Lng
                    setLocalConfig({
                      ...localConfig,
                      locationOffset: { lat: -lat10m, lng: -lng10m }
                    });
                  }}
                  className="flex-1 py-2 bg-white/5 hover:bg-white/10 rounded-xl text-[10px] font-black transition-all"
                >
                  تصحیح خودکار ۱۰ متر (شمال‌شرق)
                </button>
                <button 
                  onClick={() => setLocalConfig({ ...localConfig, locationOffset: { lat: 0, lng: 0 } })}
                  className="px-4 py-2 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 rounded-xl text-[10px] font-black transition-all"
                >
                  ریست
                </button>
              </div>
            </div>
          </section>

          {localConfig.source === 'EXTERNAL' && (
            <>
              {/* Bluetooth Connection */}
              <section className="space-y-4">
                <h3 className="text-xs font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
                  <Bluetooth className="w-4 h-4" />
                  اتصال بلوتوث (NMEA over BT)
                </h3>
                <div className="bg-slate-800/50 p-6 rounded-3xl border border-white/5 flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className={cn("w-3 h-3 rounded-full", status.connected ? "bg-emerald-500 animate-pulse" : "bg-slate-700")} />
                    <div>
                      <span className="text-sm font-bold block text-white">
                        {status.connected ? config.bluetoothDeviceName : "دستگاهی متصل نیست"}
                      </span>
                      <span className="text-[10px] text-slate-500 font-bold">
                        {status.connected ? "در حال دریافت داده‌های NMEA..." : "آماده برای جفت‌سازی"}
                      </span>
                    </div>
                  </div>
                  <button 
                    onClick={handleConnect}
                    disabled={isConnecting}
                    className="px-6 py-3 bg-white/10 hover:bg-white/20 rounded-2xl text-xs font-black transition-all flex items-center gap-2"
                  >
                    {isConnecting ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Bluetooth className="w-4 h-4" />}
                    {status.connected ? "تغییر دستگاه" : "جستجو و اتصال"}
                  </button>
                </div>
              </section>

              {/* NTRIP Settings */}
              <section className="space-y-4">
                <h3 className="text-xs font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
                  <Wifi className="w-4 h-4" />
                  تنظیمات تصحیحات RTK (NTRIP)
                </h3>
                <div className="bg-slate-800/50 p-8 rounded-3xl border border-white/5 space-y-6">
                  <div className="grid grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <label className="text-[10px] text-slate-500 font-black px-1">آدرس سرور (Host)</label>
                      <input 
                        type="text" 
                        value={localConfig.ntripHost || ''}
                        onChange={(e) => setLocalConfig({ ...localConfig, ntripHost: e.target.value })}
                        placeholder="مثال: shamim.ssaa.ir"
                        className="w-full bg-slate-900 border border-white/10 rounded-2xl px-4 py-3 text-sm font-mono focus:border-indigo-500 outline-none transition-all"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] text-slate-500 font-black px-1">پورت (Port)</label>
                      <input 
                        type="number" 
                        value={localConfig.ntripPort || ''}
                        onChange={(e) => setLocalConfig({ ...localConfig, ntripPort: parseInt(e.target.value) })}
                        placeholder="2101"
                        className="w-full bg-slate-900 border border-white/10 rounded-2xl px-4 py-3 text-sm font-mono focus:border-indigo-500 outline-none transition-all"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] text-slate-500 font-black px-1">نقطه اتصال (Mountpoint)</label>
                    <input 
                      type="text" 
                      value={localConfig.ntripMountpoint || ''}
                      onChange={(e) => setLocalConfig({ ...localConfig, ntripMountpoint: e.target.value })}
                      placeholder="مثال: VR_RTCM32"
                      className="w-full bg-slate-900 border border-white/10 rounded-2xl px-4 py-3 text-sm font-mono focus:border-indigo-500 outline-none transition-all"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <label className="text-[10px] text-slate-500 font-black px-1">نام کاربری</label>
                      <input 
                        type="text" 
                        value={localConfig.ntripUser || ''}
                        onChange={(e) => setLocalConfig({ ...localConfig, ntripUser: e.target.value })}
                        className="w-full bg-slate-900 border border-white/10 rounded-2xl px-4 py-3 text-sm font-mono focus:border-indigo-500 outline-none transition-all"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] text-slate-500 font-black px-1">رمز عبور</label>
                      <input 
                        type="password" 
                        value={localConfig.ntripPass || ''}
                        onChange={(e) => setLocalConfig({ ...localConfig, ntripPass: e.target.value })}
                        className="w-full bg-slate-900 border border-white/10 rounded-2xl px-4 py-3 text-sm font-mono focus:border-indigo-500 outline-none transition-all"
                      />
                    </div>
                  </div>
                </div>
                <div className="flex items-start gap-3 p-4 bg-amber-500/10 rounded-2xl border border-amber-500/20">
                  <Info className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                  <p className="text-[10px] text-amber-200/70 leading-relaxed font-bold">
                    نکته: برای دریافت تصحیحات RTK در ایران، از اطلاعات سامانه شمیم استفاده کنید. این اطلاعات باعث می‌شود دقت دستگاه از چند متر به چند سانتی‌متر برسد.
                  </p>
                </div>
              </section>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="p-8 bg-slate-800/50 border-t border-white/5 flex gap-4">
          <button 
            onClick={onClose}
            className="flex-1 py-4 bg-slate-800 hover:bg-slate-700 rounded-2xl font-black text-sm transition-all"
          >
            انصراف
          </button>
          <button 
            onClick={handleSave}
            className="flex-1 py-4 bg-indigo-600 hover:bg-indigo-500 text-white rounded-2xl font-black text-sm shadow-xl shadow-indigo-900/20 transition-all flex items-center justify-center gap-2"
          >
            <Save className="w-5 h-5" />
            ذخیره تنظیمات
          </button>
        </div>
      </div>
    </motion.div>
  );
}
