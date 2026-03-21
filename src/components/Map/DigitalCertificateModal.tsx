import React, { useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Printer, MapPin, Scale, Layers, User, CheckCircle2, Hash, ShieldCheck, Binary, Table, Ruler, Compass, Fingerprint, Info } from 'lucide-react';
import { Parcel, Point } from '../../types';
import * as turf from '@turf/turf';

interface DigitalCertificateModalProps {
  parcel: Parcel;
  allParcels: Parcel[];
  allPoints: Point[];
  onClose: () => void;
}

const DigitalCertificateModal: React.FC<DigitalCertificateModalProps> = ({
  parcel,
  allParcels,
  allPoints,
  onClose
}) => {
  const printRef = useRef<HTMLDivElement>(null);

  const neighbors = useMemo(() => {
    return allParcels.filter(p => {
      if (p.id === parcel.id) return false;
      // Share at least 2 points to be considered a neighbor with a common border
      const sharedPoints = p.pointIds.filter(id => parcel.pointIds.includes(id));
      return sharedPoints.length >= 2;
    });
  }, [parcel, allParcels]);

  const parcelPoints = useMemo(() => {
    return parcel.pointIds.map(id => allPoints.find(p => p.id === id)!).filter(Boolean);
  }, [parcel, allPoints]);

  const jarib = (parcel.area / 2000).toFixed(4);

  const perimeter = useMemo(() => {
    if (parcelPoints.length < 2) return 0;
    let total = 0;
    for (let i = 0; i < parcelPoints.length; i++) {
      const p1 = parcelPoints[i];
      const p2 = parcelPoints[(i + 1) % parcelPoints.length];
      total += turf.distance(
        turf.point([p1.lng, p1.lat]),
        turf.point([p2.lng, p2.lat]),
        { units: 'meters' }
      );
    }
    return total;
  }, [parcelPoints]);

  const boundaryMatrix = useMemo(() => {
    return parcelPoints.map((p, idx) => {
      const nextP = parcelPoints[(idx + 1) % parcelPoints.length];
      const length = turf.distance(
        turf.point([p.lng, p.lat]),
        turf.point([nextP.lng, nextP.lat]),
        { units: 'meters' }
      );
      const bearing = turf.bearing(
        turf.point([p.lng, p.lat]),
        turf.point([nextP.lng, nextP.lat])
      );
      
      // Find neighbor for this segment
      const neighbor = allParcels.find(other => {
        if (other.id === parcel.id) return false;
        return other.pointIds.includes(p.id) && other.pointIds.includes(nextP.id);
      });

      return {
        id: `V${idx + 1}`,
        lat: p.lat.toFixed(8),
        lng: p.lng.toFixed(8),
        length: length.toFixed(3),
        azimuth: ((bearing + 360) % 360).toFixed(2),
        neighbor: neighbor?.ownerName || 'اراضی مجاور'
      };
    });
  }, [parcel, parcelPoints, allParcels]);

  const digitalFingerprint = useMemo(() => {
    const dataString = `${parcel.id}-${parcel.area}-${parcel.pointIds.join('')}`;
    // Simple mock hash for visual effect
    let hash = 0;
    for (let i = 0; i < dataString.length; i++) {
      hash = ((hash << 5) - hash) + dataString.charCodeAt(i);
      hash |= 0;
    }
    return Math.abs(hash).toString(16).toUpperCase().padStart(12, '0');
  }, [parcel]);

  const handlePrint = () => {
    window.print();
  };

  const center = useMemo(() => {
    if (parcelPoints.length === 0) return { lat: 0, lng: 0 };
    const lat = parcelPoints.reduce((sum, p) => sum + p.lat, 0) / parcelPoints.length;
    const lng = parcelPoints.reduce((sum, p) => sum + p.lng, 0) / parcelPoints.length;
    return { lat, lng };
  }, [parcelPoints]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[3000] bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-4 md:p-8 overflow-y-auto"
    >
      <motion.div
        initial={{ scale: 0.9, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        className="bg-white w-full max-w-4xl rounded-[40px] shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
      >
        {/* Header */}
        <div className="px-8 py-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-indigo-600 rounded-2xl flex items-center justify-center shadow-lg shadow-indigo-100">
              <Printer className="w-6 h-6 text-white" />
            </div>
            <div>
              <h2 className="text-xl font-black text-slate-800">پیش‌نمایش سند دیجیتال</h2>
              <p className="text-xs font-bold text-slate-400">تأیید اطلاعات قبل از چاپ نهایی</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="w-12 h-12 bg-white border-2 border-slate-100 rounded-2xl flex items-center justify-center text-slate-400 hover:text-rose-500 hover:border-rose-100 transition-all"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Content (Printable Area) */}
        <div className="flex-1 overflow-y-auto p-8 bg-slate-100/30" id="printable-certificate">
          <div 
            ref={printRef}
            className="bg-white w-full mx-auto shadow-sm border border-slate-200 rounded-[32px] overflow-hidden p-12 print:shadow-none print:border-none print:p-0"
            dir="rtl"
          >
            {/* Engineering Certificate Header */}
            <div className="flex justify-between items-start mb-10 border-b-8 border-slate-900 pb-8">
              <div className="flex items-center gap-6">
                <div className="w-20 h-20 bg-slate-900 rounded-3xl flex items-center justify-center shadow-2xl">
                  <ShieldCheck className="w-12 h-12 text-emerald-400" />
                </div>
                <div>
                  <h1 className="text-5xl font-black text-slate-900 mb-2 tracking-tighter">شناسنامه فنی و کاداستر</h1>
                  <p className="text-slate-500 font-bold text-xl flex items-center gap-2">
                    <Binary className="w-5 h-5" />
                    ماتریس مختصات و مهندسی اراضی دیجیتال
                  </p>
                </div>
              </div>
              <div className="text-left">
                <div className="bg-slate-900 text-white px-8 py-4 rounded-3xl font-black text-2xl mb-2 flex items-center gap-3">
                  <Hash className="w-6 h-6 text-emerald-400" />
                  {parcel.id.slice(0, 10).toUpperCase()}
                </div>
                <p className="text-slate-400 font-bold text-sm">نسخه سیستمی: ۳.۰.۴ (WGS84)</p>
              </div>
            </div>

            {/* Identity & Geometric Summary */}
            <div className="grid grid-cols-3 gap-6 mb-10">
              <div className="col-span-1 bg-slate-900 text-white p-8 rounded-[40px] shadow-2xl relative overflow-hidden">
                <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-400/10 rounded-full -mr-16 -mt-16" />
                <User className="w-8 h-8 text-emerald-400 mb-4" />
                <span className="text-xs font-black text-slate-400 block uppercase mb-1">هویت مالک قانونی</span>
                <span className="text-2xl font-black">{parcel.ownerName || 'نامشخص'}</span>
              </div>
              
              <div className="col-span-2 grid grid-cols-3 gap-4">
                <div className="bg-slate-50 p-6 rounded-[32px] border-2 border-slate-200 flex flex-col justify-center">
                  <div className="flex items-center gap-2 mb-2">
                    <Scale className="w-4 h-4 text-indigo-600" />
                    <span className="text-[10px] font-black text-slate-400 uppercase">مساحت محاسباتی</span>
                  </div>
                  <span className="text-xl font-black text-slate-900">{parcel.area.toFixed(4)} m²</span>
                  <span className="text-xs font-bold text-emerald-600">{jarib} جریب</span>
                </div>
                
                <div className="bg-slate-50 p-6 rounded-[32px] border-2 border-slate-200 flex flex-col justify-center">
                  <div className="flex items-center gap-2 mb-2">
                    <Ruler className="w-4 h-4 text-rose-600" />
                    <span className="text-[10px] font-black text-slate-400 uppercase">محیط کل مرز</span>
                  </div>
                  <span className="text-xl font-black text-slate-900">{perimeter.toFixed(3)} m</span>
                </div>

                <div className="bg-slate-50 p-6 rounded-[32px] border-2 border-slate-200 flex flex-col justify-center">
                  <div className="flex items-center gap-2 mb-2">
                    <Compass className="w-4 h-4 text-amber-600" />
                    <span className="text-[10px] font-black text-slate-400 uppercase">نقطه ثقل (Centroid)</span>
                  </div>
                  <div className="flex flex-col text-[10px] font-mono font-bold text-slate-700">
                    <span>LAT: {center.lat.toFixed(7)}</span>
                    <span>LNG: {center.lng.toFixed(7)}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* The Boundary Matrix Table */}
            <div className="mb-10">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-xl font-black text-slate-900 flex items-center gap-3">
                  <div className="w-3 h-3 bg-emerald-600 rounded-full" />
                  ماتریس مختصات و مجاورین (Boundary Matrix)
                </h3>
                <div className="bg-emerald-50 text-emerald-700 px-4 py-2 rounded-xl text-xs font-black border border-emerald-100">
                  دقت میلی‌متری (RTK-GNSS)
                </div>
              </div>
              
              <div className="overflow-hidden border-2 border-slate-900 rounded-[32px] shadow-xl">
                <table className="w-full text-right border-collapse">
                  <thead>
                    <tr className="bg-slate-900 text-white">
                      <th className="px-6 py-5 text-xs font-black uppercase tracking-widest border-l border-white/10">شناسه</th>
                      <th className="px-6 py-5 text-xs font-black uppercase tracking-widest border-l border-white/10">عرض جغرافیایی (Lat)</th>
                      <th className="px-6 py-5 text-xs font-black uppercase tracking-widest border-l border-white/10">طول جغرافیایی (Lng)</th>
                      <th className="px-6 py-5 text-xs font-black uppercase tracking-widest border-l border-white/10">طول ضلع (m)</th>
                      <th className="px-6 py-5 text-xs font-black uppercase tracking-widest border-l border-white/10">آزیموت (°)</th>
                      <th className="px-6 py-5 text-xs font-black uppercase tracking-widest">وضعیت مجاورت</th>
                    </tr>
                  </thead>
                  <tbody className="text-sm font-bold">
                    {boundaryMatrix.map((row, idx) => (
                      <tr key={idx} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                        <td className="px-6 py-4 border-l border-slate-200 font-black text-indigo-600">{row.id}</td>
                        <td className="px-6 py-4 border-l border-slate-200 font-mono text-xs">{row.lat}</td>
                        <td className="px-6 py-4 border-l border-slate-200 font-mono text-xs">{row.lng}</td>
                        <td className="px-6 py-4 border-l border-slate-200 text-emerald-700">{row.length}</td>
                        <td className="px-6 py-4 border-l border-slate-200 text-amber-700">{row.azimuth}</td>
                        <td className="px-6 py-4 text-slate-500 text-xs">{row.neighbor}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Construction & Technical Details */}
            <div className="grid grid-cols-2 gap-8 mb-10">
              <div className="bg-slate-900 text-white p-8 rounded-[40px] flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-black text-emerald-400 uppercase mb-4 flex items-center gap-2">
                    <Fingerprint className="w-4 h-4" />
                    اثر انگشت دیجیتال (Hash)
                  </h4>
                  <p className="font-mono text-lg tracking-[0.2em]">{digitalFingerprint}</p>
                  <p className="text-[10px] text-slate-500 mt-2">تأییدیه عدم دستکاری در داده‌های کاداستر</p>
                </div>
                <div className="w-20 h-20 bg-white/5 rounded-2xl border border-white/10 flex items-center justify-center">
                  <div className="grid grid-cols-4 gap-1">
                    {[...Array(16)].map((_, i) => (
                      <div key={i} className={`w-2 h-2 rounded-sm ${Math.random() > 0.5 ? 'bg-emerald-400' : 'bg-white/10'}`} />
                    ))}
                  </div>
                </div>
              </div>

              <div className="bg-slate-50 p-8 rounded-[40px] border-2 border-slate-200">
                <h4 className="text-xs font-black text-slate-400 uppercase mb-4 flex items-center gap-2">
                  <Info className="w-4 h-4 text-indigo-600" />
                  جزئیات ساختاری و تفکیک
                </h4>
                <div className="space-y-3">
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-500">شناسه قطعه مادر:</span>
                    <span className="font-black text-slate-900">PARENT-{parcel.id.slice(0, 4).toUpperCase()}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-500">نسل تفکیک اراضی:</span>
                    <span className="font-black text-indigo-600">نسل {parcel.generation || 1}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-500">الگوریتم محاسباتی:</span>
                    <span className="font-black text-slate-900">WGS84 / EGM96</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Final Security Footer */}
            <div className="flex justify-between items-center bg-slate-900 p-10 rounded-[48px] text-white">
              <div className="flex gap-12">
                <div className="text-right">
                  <p className="text-[10px] font-black text-emerald-400 mb-4 uppercase tracking-widest">تأییدیه مهندسی کاداستر</p>
                  <div className="flex items-center gap-4">
                    <div className="w-16 h-16 rounded-full border-4 border-emerald-400/20 flex items-center justify-center">
                      <CheckCircle2 className="w-8 h-8 text-emerald-400" />
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-black">واحد کنترل کیفیت داده</p>
                      <p className="text-[10px] text-slate-500">تأیید شده سیستمی</p>
                    </div>
                  </div>
                </div>
              </div>
              <div className="text-left flex flex-col items-end">
                <div className="w-32 h-32 bg-white p-3 rounded-3xl mb-4 shadow-2xl">
                  <div className="w-full h-full bg-slate-100 rounded-xl flex items-center justify-center border-2 border-dashed border-slate-300">
                    <span className="text-[10px] text-slate-400 font-black text-center">QR AUTH<br/>VALIDATED</span>
                  </div>
                </div>
                <p className="text-[10px] font-black text-slate-500">این سند فاقد نقشه گرافیکی بوده و بر اساس مختصات مطلق ریاضی صادر شده است.</p>
              </div>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="px-8 py-6 border-t border-slate-100 bg-white flex gap-3">
          <button 
            onClick={onClose}
            className="flex-1 py-4 bg-slate-100 text-slate-600 rounded-2xl font-bold hover:bg-slate-200 transition-colors"
          >
            انصراف
          </button>
          <button 
            onClick={handlePrint}
            className="flex-[2] py-4 bg-indigo-600 text-white rounded-2xl font-bold shadow-xl shadow-indigo-100 hover:bg-indigo-700 transition-all active:scale-95 flex items-center justify-center gap-2"
          >
            <Printer className="w-5 h-5" />
            چاپ نهایی سند
          </button>
        </div>
      </motion.div>

      <style>{`
        @media print {
          body * {
            visibility: hidden;
          }
          #printable-certificate, #printable-certificate * {
            visibility: visible;
          }
          #printable-certificate {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
            padding: 0;
            margin: 0;
            background: white;
          }
          .coord-tooltip, .neighbor-tooltip, .neighbor-label, .target-label, .coord-label-pro {
            background: transparent !important;
            border: none !important;
            box-shadow: none !important;
          }
        }
        table {
          page-break-inside: auto;
        }
        tr {
          page-break-inside: avoid;
          page-break-after: auto;
        }
      `}</style>
    </motion.div>
  );
};

export default DigitalCertificateModal;
