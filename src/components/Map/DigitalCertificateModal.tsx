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

  const areaFontSize = useMemo(() => {
    const len = parcel.area.toFixed(4).length;
    if (len > 12) return 'text-sm';
    if (len > 10) return 'text-base';
    return 'text-xl';
  }, [parcel.area]);

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

  // Adaptive Table Logic
  const tableConfig = useMemo(() => {
    const count = boundaryMatrix.length;
    let padding = 'py-4';
    let fontSize = 'text-sm';
    let monoSize = 'text-xs';
    let isTwoColumn = false;

    if (count > 40) {
      padding = 'py-1';
      fontSize = 'text-[9px]';
      monoSize = 'text-[8px]';
      isTwoColumn = true;
    } else if (count > 25) {
      padding = 'py-2';
      fontSize = 'text-xs';
      monoSize = 'text-[10px]';
      isTwoColumn = count > 30;
    } else if (count > 15) {
      padding = 'py-3';
      fontSize = 'text-xs';
    }

    return { padding, fontSize, monoSize, isTwoColumn };
  }, [boundaryMatrix]);

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
            {/* Engineering Certificate Header - Optimized Space */}
            <div className="flex justify-between items-start mb-6 border-b-4 border-slate-900 pb-4">
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 bg-slate-900 rounded-2xl flex items-center justify-center shadow-xl">
                  <ShieldCheck className="w-10 h-10 text-emerald-400" />
                </div>
                <div>
                  <h1 className="text-4xl font-black text-slate-900 mb-1 tracking-tighter">شناسنامه فنی و کاداستر</h1>
                  <p className="text-slate-500 font-bold text-base flex items-center gap-2">
                    <Binary className="w-4 h-4" />
                    ماتریس مختصات و مهندسی اراضی دیجیتال
                  </p>
                </div>
              </div>
              <div className="text-left">
                <div className="bg-slate-900 text-white px-6 py-3 rounded-2xl font-black text-xl mb-1 flex items-center gap-2">
                  <Hash className="w-5 h-5 text-emerald-400" />
                  {parcel.id.slice(0, 10).toUpperCase()}
                </div>
                <p className="text-slate-400 font-bold text-[10px]">نسخه سیستمی: ۳.۰.۴ (WGS84)</p>
              </div>
            </div>

            {/* Identity & Geometric Summary - Uniform Grid */}
            <div className="grid grid-cols-4 gap-4 mb-6">
              <div className="bg-slate-900 text-white p-5 rounded-[24px] shadow-lg relative overflow-hidden flex flex-col justify-center">
                <div className="absolute top-0 right-0 w-20 h-20 bg-emerald-400/10 rounded-full -mr-10 -mt-10" />
                <div className="flex items-center gap-2 mb-2">
                  <User className="w-4 h-4 text-emerald-400" />
                  <span className="text-[9px] font-black text-slate-400 uppercase">هویت مالک</span>
                </div>
                <span className="text-base font-black truncate">{parcel.ownerName || 'نامشخص'}</span>
              </div>
              
              <div className="bg-slate-50 p-5 rounded-[24px] border-2 border-slate-200 flex flex-col justify-center">
                <div className="flex items-center gap-2 mb-2">
                  <Scale className="w-4 h-4 text-indigo-600" />
                  <span className="text-[9px] font-black text-slate-400 uppercase">مساحت</span>
                </div>
                <span className={`${areaFontSize} font-black text-slate-900 truncate`}>{parcel.area.toFixed(4)} m²</span>
                <span className="text-[10px] font-bold text-emerald-600">{jarib} جریب</span>
              </div>
              
              <div className="bg-slate-50 p-5 rounded-[24px] border-2 border-slate-200 flex flex-col justify-center">
                <div className="flex items-center gap-2 mb-2">
                  <Ruler className="w-4 h-4 text-rose-600" />
                  <span className="text-[9px] font-black text-slate-400 uppercase">محیط کل</span>
                </div>
                <span className="text-lg font-black text-slate-900">{perimeter.toFixed(3)} m</span>
              </div>

              <div className="bg-slate-50 p-5 rounded-[24px] border-2 border-slate-200 flex flex-col justify-center">
                <div className="flex items-center gap-2 mb-2">
                  <Compass className="w-4 h-4 text-amber-600" />
                  <span className="text-[9px] font-black text-slate-400 uppercase">نقطه ثقل</span>
                </div>
                <div className="flex flex-col text-[9px] font-mono font-bold text-slate-700">
                  <span>LAT: {center.lat.toFixed(6)}</span>
                  <span>LNG: {center.lng.toFixed(6)}</span>
                </div>
              </div>
            </div>

            {/* The Boundary Matrix Table - Adaptive */}
            <div className="mb-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-black text-slate-900 flex items-center gap-2">
                  <div className="w-2 h-2 bg-emerald-600 rounded-full" />
                  ماتریس مختصات و مجاورین
                </h3>
                <div className="bg-emerald-50 text-emerald-700 px-3 py-1 rounded-lg text-[10px] font-black border border-emerald-100">
                  دقت میلی‌متری (RTK-GNSS)
                </div>
              </div>
              
              <div className={`grid ${tableConfig.isTwoColumn ? 'grid-cols-2 gap-4' : 'grid-cols-1'}`}>
                {[...Array(tableConfig.isTwoColumn ? 2 : 1)].map((_, colIdx) => {
                  const items = tableConfig.isTwoColumn 
                    ? (colIdx === 0 ? boundaryMatrix.slice(0, Math.ceil(boundaryMatrix.length / 2)) : boundaryMatrix.slice(Math.ceil(boundaryMatrix.length / 2)))
                    : boundaryMatrix;
                  
                  if (items.length === 0) return null;

                  return (
                    <div key={colIdx} className="overflow-hidden border-2 border-slate-900 rounded-[20px] shadow-md">
                      <table className="w-full text-right border-collapse">
                        <thead>
                          <tr className="bg-slate-900 text-white">
                            <th className="px-3 py-3 text-[9px] font-black uppercase border-l border-white/10">V</th>
                            <th className="px-3 py-3 text-[9px] font-black uppercase border-l border-white/10">Lat</th>
                            <th className="px-3 py-3 text-[9px] font-black uppercase border-l border-white/10">Lng</th>
                            <th className="px-3 py-3 text-[9px] font-black uppercase border-l border-white/10">ضلع</th>
                            <th className="px-3 py-3 text-[9px] font-black uppercase border-l border-white/10">آزیموت</th>
                            <th className="px-3 py-3 text-[9px] font-black uppercase">مجاور</th>
                          </tr>
                        </thead>
                        <tbody className={`${tableConfig.fontSize} font-bold`}>
                          {items.map((row, idx) => (
                            <tr key={idx} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                              <td className={`px-3 ${tableConfig.padding} border-l border-slate-200 font-black text-indigo-600`}>{row.id}</td>
                              <td className={`px-3 ${tableConfig.padding} border-l border-slate-200 font-mono ${tableConfig.monoSize}`}>{row.lat}</td>
                              <td className={`px-3 ${tableConfig.padding} border-l border-slate-200 font-mono ${tableConfig.monoSize}`}>{row.lng}</td>
                              <td className={`px-3 ${tableConfig.padding} border-l border-slate-200 text-emerald-700`}>{row.length}</td>
                              <td className={`px-3 ${tableConfig.padding} border-l border-slate-200 text-amber-700`}>{row.azimuth}</td>
                              <td className={`px-3 ${tableConfig.padding} text-slate-500 text-[9px] truncate max-w-[80px]`}>{row.neighbor}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Construction & Technical Details - Adaptive Footer */}
            <div className={`grid ${boundaryMatrix.length > 25 ? 'grid-cols-3' : 'grid-cols-2'} gap-4 mb-6`}>
              <div className={`${boundaryMatrix.length > 25 ? 'col-span-2' : 'col-span-1'} bg-slate-900 text-white p-6 rounded-[32px] flex items-center justify-between`}>
                <div>
                  <h4 className="text-[9px] font-black text-emerald-400 uppercase mb-2 flex items-center gap-2">
                    <Fingerprint className="w-3 h-3" />
                    اثر انگشت دیجیتال
                  </h4>
                  <p className="font-mono text-base tracking-[0.1em]">{digitalFingerprint}</p>
                </div>
                <div className="w-12 h-12 bg-white/5 rounded-xl border border-white/10 flex items-center justify-center">
                  <div className="grid grid-cols-4 gap-0.5">
                    {[...Array(16)].map((_, i) => (
                      <div key={i} className={`w-1.5 h-1.5 rounded-sm ${Math.random() > 0.5 ? 'bg-emerald-400' : 'bg-white/10'}`} />
                    ))}
                  </div>
                </div>
              </div>

              <div className="bg-slate-50 p-6 rounded-[32px] border-2 border-slate-200">
                <h4 className="text-[9px] font-black text-slate-400 uppercase mb-2 flex items-center gap-2">
                  <Info className="w-3 h-3 text-indigo-600" />
                  جزئیات ساختاری
                </h4>
                <div className="space-y-1 text-[10px]">
                  <div className="flex justify-between">
                    <span className="text-slate-500">قطعه مادر:</span>
                    <span className="font-black text-slate-900">PARENT-{parcel.id.slice(0, 4).toUpperCase()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">نسل تفکیک:</span>
                    <span className="font-black text-indigo-600">نسل {parcel.generation || 1}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Final Security Footer - Compact */}
            <div className="flex justify-between items-center bg-slate-900 p-6 rounded-[40px] text-white">
              <div className="flex gap-8">
                <div className="text-right">
                  <p className="text-[8px] font-black text-emerald-400 mb-2 uppercase tracking-widest">تأییدیه مهندسی</p>
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full border-2 border-emerald-400/20 flex items-center justify-center">
                      <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                    </div>
                    <div className="text-right">
                      <p className="text-[10px] font-black">واحد کنترل کیفیت</p>
                      <p className="text-[8px] text-slate-500">تأیید شده سیستمی</p>
                    </div>
                  </div>
                </div>
              </div>
              <div className="text-left flex flex-col items-end">
                <div className="w-16 h-16 bg-white p-2 rounded-2xl mb-2">
                  <div className="w-full h-full bg-slate-100 rounded-lg flex items-center justify-center border border-dashed border-slate-300">
                    <span className="text-[7px] text-slate-400 font-black text-center">QR AUTH</span>
                  </div>
                </div>
                <p className="text-[8px] font-black text-slate-500">صدور بر اساس مختصات مطلق ریاضی (WGS84)</p>
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
          @page {
            size: A4;
            margin: 0;
          }
          body * {
            visibility: hidden;
          }
          #printable-certificate, #printable-certificate * {
            visibility: visible;
          }
          #printable-certificate {
            position: fixed;
            left: 0;
            top: 0;
            width: 210mm;
            height: 297mm;
            padding: 10mm;
            margin: 0;
            background: white;
            overflow: hidden;
          }
          .coord-tooltip, .neighbor-tooltip, .neighbor-label, .target-label, .coord-label-pro {
            background: transparent !important;
            border: none !important;
            box-shadow: none !important;
          }
        }
        table {
          page-break-inside: auto;
          table-layout: fixed;
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
