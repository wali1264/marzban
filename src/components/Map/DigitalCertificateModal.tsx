import React, { useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Printer, MapPin, Scale, Layers, User, CheckCircle2 } from 'lucide-react';
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
            {/* Certificate Header (20% of content) */}
            <div className="flex justify-between items-start mb-8 border-b-4 border-slate-900 pb-6">
              <div>
                <h1 className="text-5xl font-black text-slate-900 mb-2 tracking-tighter">سند مالکیت دیجیتال</h1>
                <p className="text-slate-500 font-bold text-lg">سیستم هوشمند مدیریت و کاداستر اراضی</p>
              </div>
              <div className="text-left">
                <div className="bg-slate-900 text-white px-6 py-3 rounded-2xl font-black text-xl mb-2">
                  کد سند: {parcel.id.slice(0, 8).toUpperCase()}
                </div>
                <p className="text-slate-400 font-bold text-sm">تاریخ صدور: {new Date().toLocaleDateString('fa-IR')}</p>
              </div>
            </div>

            {/* Owner Info Summary */}
            <div className="grid grid-cols-4 gap-4 mb-8">
              <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200">
                <span className="text-[10px] font-black text-slate-400 block uppercase mb-1">نام مالک</span>
                <span className="text-lg font-black text-slate-800">{parcel.ownerName || 'ناشناس'}</span>
              </div>
              <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200">
                <span className="text-[10px] font-black text-slate-400 block uppercase mb-1">مساحت (متر مربع)</span>
                <span className="text-lg font-black text-slate-800">{parcel.area.toFixed(1)}</span>
              </div>
              <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200">
                <span className="text-[10px] font-black text-slate-400 block uppercase mb-1">مساحت (جریب)</span>
                <span className="text-lg font-black text-emerald-700">{jarib}</span>
              </div>
              <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200">
                <span className="text-[10px] font-black text-slate-400 block uppercase mb-1">نسل تفکیک</span>
                <span className="text-lg font-black text-amber-600">{parcel.generation || 1}</span>
              </div>
            </div>

            {/* Map Section (80% of content) */}
            <div className="relative">
              <div className="absolute top-6 right-6 z-10 flex flex-col gap-2">
                <div className="bg-white/90 backdrop-blur-sm p-3 rounded-2xl border border-slate-200 shadow-xl flex items-center gap-3">
                  <div className="w-4 h-4 bg-emerald-600 rounded-md" />
                  <span className="text-xs font-black text-slate-700">محدوده ملک شما</span>
                </div>
                <div className="bg-white/90 backdrop-blur-sm p-3 rounded-2xl border border-slate-200 shadow-xl flex items-center gap-3">
                  <div className="w-4 h-4 bg-slate-400 rounded-md" />
                  <span className="text-xs font-black text-slate-700">املاک مجاور (همسایگان)</span>
                </div>
              </div>

              {/* North Arrow */}
              <div className="absolute top-6 left-6 z-10 bg-white/90 backdrop-blur-sm p-3 rounded-full border border-slate-200 shadow-xl">
                <div className="flex flex-col items-center">
                  <span className="text-[10px] font-black text-rose-600 mb-1">N</span>
                  <div className="w-0.5 h-8 bg-slate-900 relative">
                    <div className="absolute -top-1 -left-1 w-0 h-0 border-l-[4px] border-l-transparent border-r-[4px] border-r-transparent border-bottom-[8px] border-bottom-slate-900" />
                  </div>
                </div>
              </div>

              <div className="h-[700px] w-full rounded-[40px] overflow-hidden border-4 border-slate-900 relative z-0 shadow-2xl">
                <MapContainer
                  center={center}
                  zoom={19}
                  className="w-full h-full"
                  zoomControl={false}
                  dragging={false}
                  scrollWheelZoom={false}
                  doubleClickZoom={false}
                >
                  <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" opacity={0.4} />
                  
                  {/* Neighbors - More prominent for comparison */}
                  {neighbors.map(n => {
                    const nPoints = n.pointIds.map(id => allPoints.find(p => p.id === id)!).filter(Boolean);
                    const nCentroid = turf.centroid(turf.polygon([[...nPoints.map(p => [p.lng, p.lat]), [nPoints[0].lng, nPoints[0].lat]]]));
                    const [nLng, nLat] = nCentroid.geometry.coordinates;

                    return (
                      <React.Fragment key={n.id}>
                        <Polygon
                          positions={nPoints.map(p => [p.lat, p.lng])}
                          pathOptions={{ 
                            color: '#64748b', 
                            fillColor: '#94a3b8', 
                            fillOpacity: 0.6, 
                            weight: 2 
                          }}
                        />
                        <Marker position={[nLat, nLng]} icon={transparentIcon}>
                          <Tooltip permanent direction="center" className="neighbor-label">
                            <span className="text-xs font-black text-slate-700">{n.ownerName || 'ناشناس'}</span>
                          </Tooltip>
                        </Marker>
                      </React.Fragment>
                    );
                  })}

                  {/* Target Parcel - Highly Prominent */}
                  <Polygon
                    positions={parcelPoints.map(p => [p.lat, p.lng])}
                    pathOptions={{ 
                      color: '#065f46', 
                      fillColor: '#10b981', 
                      fillOpacity: 0.3, 
                      weight: 5,
                      lineCap: 'round',
                      lineJoin: 'round'
                    }}
                  />

                  {/* Owner Name in Center of Target */}
                  <Marker position={center} icon={transparentIcon}>
                    <Tooltip permanent direction="center" className="target-label">
                      <div className="flex flex-col items-center">
                        <span className="text-lg font-black text-emerald-900">{parcel.ownerName || 'ناشناس'}</span>
                        <span className="text-[10px] font-bold text-emerald-700">ملک موضوع سند</span>
                      </div>
                    </Tooltip>
                  </Marker>

                  {/* Points with Large Coordinate Labels */}
                  {parcelPoints.map((p, idx) => (
                    <Marker 
                      key={p.id} 
                      position={[p.lat, p.lng]} 
                      icon={L.divIcon({
                        className: 'bg-emerald-600 w-4 h-4 rounded-full border-2 border-white shadow-lg',
                        iconSize: [16, 16],
                        iconAnchor: [8, 8]
                      })}
                    >
                      <Tooltip permanent direction="top" offset={[0, -10]} className="coord-label-pro">
                        <div className="flex flex-col items-center bg-slate-900 text-white px-3 py-2 rounded-xl shadow-2xl border border-white/20">
                          <div className="flex items-center gap-2 border-b border-white/10 pb-1 mb-1 w-full justify-center">
                            <MapPin className="w-3 h-3 text-emerald-400" />
                            <span className="text-[10px] font-black">نقطه {idx + 1}</span>
                          </div>
                          <div className="grid grid-cols-2 gap-3 text-[9px] font-mono">
                            <div className="flex flex-col">
                              <span className="text-slate-400 text-[8px]">Lat:</span>
                              <span className="text-emerald-400">{p.lat.toFixed(7)}</span>
                            </div>
                            <div className="flex flex-col">
                              <span className="text-slate-400 text-[8px]">Lng:</span>
                              <span className="text-emerald-400">{p.lng.toFixed(7)}</span>
                            </div>
                          </div>
                        </div>
                      </Tooltip>
                    </Marker>
                  ))}
                </MapContainer>
              </div>
            </div>

            {/* Security Footer */}
            <div className="mt-12 flex justify-between items-center bg-slate-50 p-8 rounded-[32px] border-2 border-slate-200">
              <div className="flex gap-8">
                <div className="text-right">
                  <p className="text-[10px] font-black text-slate-400 mb-1 uppercase tracking-widest">مهر و امضای دیجیتال</p>
                  <div className="w-32 h-16 border-2 border-indigo-100 rounded-2xl bg-white flex items-center justify-center">
                    <div className="w-12 h-12 rounded-full border-4 border-indigo-600/20 flex items-center justify-center">
                      <div className="w-6 h-6 rounded-full bg-indigo-600/10" />
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-[10px] font-black text-slate-400 mb-1 uppercase tracking-widest">تأییدیه کاداستر</p>
                  <div className="w-32 h-16 border-2 border-emerald-100 rounded-2xl bg-white flex items-center justify-center">
                    <CheckCircle2 className="w-8 h-8 text-emerald-600/30" />
                  </div>
                </div>
              </div>
              <div className="text-left flex flex-col items-end">
                <div className="w-24 h-24 bg-white p-2 rounded-2xl border-2 border-slate-200 shadow-sm mb-2">
                  <div className="w-full h-full bg-slate-100 rounded-lg flex items-center justify-center">
                    <span className="text-[8px] text-slate-400 font-black text-center">QR CODE<br/>SECURITY</span>
                  </div>
                </div>
                <p className="text-[10px] font-black text-slate-400">اصالت این سند از طریق سامانه مرکزی قابل استعلام است</p>
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
        .neighbor-label, .target-label {
          background: transparent !important;
          border: none !important;
          box-shadow: none !important;
        }
        .neighbor-label span {
          background: white;
          padding: 2px 6px;
          border-radius: 4px;
          border: 1px solid #cbd5e1;
          white-space: nowrap;
        }
        .target-label div {
          background: #065f46;
          color: white;
          padding: 4px 12px;
          border-radius: 8px;
          border: 2px solid white;
          box-shadow: 0 4px 12px rgba(0,0,0,0.2);
          white-space: nowrap;
        }
        .coord-label-pro {
          background: transparent !important;
          border: none !important;
          box-shadow: none !important;
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
