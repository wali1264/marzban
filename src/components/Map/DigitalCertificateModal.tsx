import React, { useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Printer, MapPin, Scale, Layers, User } from 'lucide-react';
import { Parcel, Point } from '../../types';
import { MapContainer, TileLayer, Polygon, Marker, Tooltip } from 'react-leaflet';
import L from 'leaflet';
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

  const jarib = (parcel.area / 2000).toFixed(3);

  const handlePrint = () => {
    window.print();
  };

  const center = useMemo(() => {
    if (parcelPoints.length === 0) return [0, 0] as [number, number];
    const lat = parcelPoints.reduce((sum, p) => sum + p.lat, 0) / parcelPoints.length;
    const lng = parcelPoints.reduce((sum, p) => sum + p.lng, 0) / parcelPoints.length;
    return [lat, lng] as [number, number];
  }, [parcelPoints]);

  const transparentIcon = L.divIcon({
    className: 'bg-transparent',
    html: '',
    iconSize: [0, 0],
    iconAnchor: [0, 0]
  });

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
            {/* Certificate Header */}
            <div className="text-center mb-12">
              <h1 className="text-4xl font-black text-slate-900 mb-2">سند دیجیتال ملک</h1>
              <div className="w-24 h-1.5 bg-indigo-600 mx-auto rounded-full" />
              <p className="mt-4 text-slate-500 font-bold">سیستم هوشمند مدیریت و تقسیم اراضی</p>
            </div>

            {/* Owner Info Grid */}
            <div className="grid grid-cols-2 gap-6 mb-12">
              <div className="bg-slate-50 p-6 rounded-3xl border border-slate-100 flex items-center gap-4">
                <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center shadow-sm">
                  <User className="w-6 h-6 text-indigo-600" />
                </div>
                <div>
                  <span className="text-[10px] font-bold text-slate-400 block uppercase tracking-wider">نام مالک</span>
                  <span className="text-lg font-black text-slate-800">{parcel.ownerName || 'نامشخص'}</span>
                </div>
              </div>
              <div className="bg-slate-50 p-6 rounded-3xl border border-slate-100 flex items-center gap-4">
                <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center shadow-sm">
                  <Scale className="w-6 h-6 text-emerald-600" />
                </div>
                <div>
                  <span className="text-[10px] font-bold text-slate-400 block uppercase tracking-wider">مساحت کل</span>
                  <div className="flex items-baseline gap-2">
                    <span className="text-lg font-black text-slate-800">{parcel.area.toFixed(1)} متر مربع</span>
                    <span className="text-xs font-bold text-emerald-600">({jarib} جریب)</span>
                  </div>
                </div>
              </div>
              <div className="bg-slate-50 p-6 rounded-3xl border border-slate-100 flex items-center gap-4">
                <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center shadow-sm">
                  <Layers className="w-6 h-6 text-amber-600" />
                </div>
                <div>
                  <span className="text-[10px] font-bold text-slate-400 block uppercase tracking-wider">نسل قطعه</span>
                  <span className="text-lg font-black text-slate-800">نسل {parcel.generation || 1}</span>
                </div>
              </div>
              <div className="bg-slate-50 p-6 rounded-3xl border border-slate-100 flex items-center gap-4">
                <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center shadow-sm">
                  <MapPin className="w-6 h-6 text-rose-600" />
                </div>
                <div>
                  <span className="text-[10px] font-bold text-slate-400 block uppercase tracking-wider">تعداد نقاط مرزی</span>
                  <span className="text-lg font-black text-slate-800">{parcel.pointIds.length} نقطه مختصاتی</span>
                </div>
              </div>
            </div>

            {/* Map Section */}
            <div className="mb-12">
              <h3 className="text-sm font-black text-slate-800 mb-4 flex items-center gap-2">
                <div className="w-2 h-2 bg-indigo-600 rounded-full" />
                نقشه هندسی و همسایگان
              </h3>
              <div className="h-[400px] w-full rounded-[32px] overflow-hidden border-2 border-slate-100 relative z-0">
                <MapContainer
                  center={center}
                  zoom={18}
                  className="w-full h-full"
                  zoomControl={false}
                  dragging={false}
                  scrollWheelZoom={false}
                  doubleClickZoom={false}
                >
                  <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                  
                  {/* Neighbors */}
                  {neighbors.map(n => {
                    const nPoints = n.pointIds.map(id => allPoints.find(p => p.id === id)!).filter(Boolean);
                    return (
                      <Polygon
                        key={n.id}
                        positions={nPoints.map(p => [p.lat, p.lng])}
                        pathOptions={{ color: '#94a3b8', fillColor: '#f1f5f9', fillOpacity: 0.5, weight: 1 }}
                      >
                        <Tooltip permanent direction="center" className="neighbor-tooltip">
                          <span className="text-[8px] font-bold text-slate-400">{n.ownerName || 'ناشناس'}</span>
                        </Tooltip>
                      </Polygon>
                    );
                  })}

                  {/* Target Parcel */}
                  <Polygon
                    positions={parcelPoints.map(p => [p.lat, p.lng])}
                    pathOptions={{ color: '#4f46e5', fillColor: '#4f46e5', fillOpacity: 0.2, weight: 3 }}
                  />

                  {/* Points with Coordinates */}
                  {parcelPoints.map((p, idx) => (
                    <Marker 
                      key={p.id} 
                      position={[p.lat, p.lng]} 
                      icon={L.divIcon({
                        className: 'bg-indigo-600 w-2 h-2 rounded-full border border-white shadow-sm',
                        iconSize: [8, 8],
                        iconAnchor: [4, 4]
                      })}
                    >
                      <Tooltip permanent direction="top" offset={[0, -5]} className="coord-tooltip">
                        <div className="flex flex-col items-center text-[7px] font-mono leading-tight">
                          <span>{p.lat.toFixed(6)}</span>
                          <span>{p.lng.toFixed(6)}</span>
                        </div>
                      </Tooltip>
                    </Marker>
                  ))}
                </MapContainer>
              </div>
            </div>

            {/* Footer Info */}
            <div className="border-t-2 border-dashed border-slate-100 pt-8 flex justify-between items-end">
              <div className="text-right">
                <p className="text-[10px] font-bold text-slate-400 mb-1 uppercase tracking-widest">تاریخ صدور</p>
                <p className="text-sm font-black text-slate-800">{new Date().toLocaleDateString('fa-IR')}</p>
              </div>
              <div className="text-left">
                <div className="w-20 h-20 bg-slate-50 rounded-2xl border border-slate-100 flex items-center justify-center">
                  <span className="text-[8px] text-slate-300 font-bold text-center px-2">کد امنیتی دیجیتال</span>
                </div>
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
          .coord-tooltip, .neighbor-tooltip {
            background: transparent !important;
            border: none !important;
            box-shadow: none !important;
          }
        }
        .neighbor-tooltip, .coord-tooltip {
          background: white;
          border: 1px solid #e2e8f0;
          padding: 2px 4px;
          border-radius: 4px;
          box-shadow: 0 1px 2px rgba(0,0,0,0.05);
        }
      `}</style>
    </motion.div>
  );
};

export default DigitalCertificateModal;
