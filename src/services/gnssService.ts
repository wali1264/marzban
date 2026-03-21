import { GNSSStatus } from '../types';

/**
 * NMEA Parser for $GPGGA sentences
 * Example: $GPGGA,123519,4807.038,N,01131.000,E,1,08,0.9,545.4,M,46.9,M,,*47
 */
export function parseGPGGA(sentence: string): Partial<GNSSStatus> | null {
  if (!sentence.startsWith('$GPGGA')) return null;

  const parts = sentence.split(',');
  if (parts.length < 10) return null;

  // Latitude: DDMM.MMMM
  const rawLat = parts[2];
  const latDir = parts[3];
  let lat = 0;
  if (rawLat) {
    const degrees = parseInt(rawLat.substring(0, 2));
    const minutes = parseFloat(rawLat.substring(2));
    lat = degrees + minutes / 60;
    if (latDir === 'S') lat = -lat;
  }

  // Longitude: DDDMM.MMMM
  const rawLng = parts[4];
  const lngDir = parts[5];
  let lng = 0;
  if (rawLng) {
    const degrees = parseInt(rawLng.substring(0, 3));
    const minutes = parseFloat(rawLng.substring(3));
    lng = degrees + minutes / 60;
    if (lngDir === 'W') lng = -lng;
  }

  // Fix Quality
  const fixQuality = parseInt(parts[6]);
  let fixType: GNSSStatus['fixType'] = 'NONE';
  switch (fixQuality) {
    case 1: fixType = '3D'; break;
    case 2: fixType = 'DGPS'; break;
    case 4: fixType = 'FIXED'; break; // RTK Fixed
    case 5: fixType = 'FLOAT'; break; // RTK Float
    default: fixType = 'NONE';
  }

  // Satellites
  const satellites = parseInt(parts[7]) || 0;

  // HDOP
  const hdop = parseFloat(parts[8]) || 0;

  // Altitude
  const altitude = parseFloat(parts[9]) || 0;

  // Accuracy estimation based on Fix Quality and HDOP
  let accuracy = hdop * 2.5; // Default rough estimation
  if (fixType === 'FIXED') {
    accuracy = 0.02; // RTK Fixed is typically 1-2cm
  } else if (fixType === 'FLOAT') {
    accuracy = 0.5; // RTK Float is typically sub-meter
  } else if (fixType === 'DGPS') {
    accuracy = Math.max(0.8, hdop * 1.2);
  }

  return {
    lat,
    lng,
    fixType,
    satellites,
    hdop,
    altitude,
    accuracy,
    timestamp: Date.now()
  };
}

/**
 * GNSS Bluetooth Manager
 * Handles connection to external GNSS devices via Web Bluetooth
 */
export class GNSSBluetoothManager {
  private device: BluetoothDevice | null = null;
  private characteristic: BluetoothRemoteGATTCharacteristic | null = null;
  private onDataCallback: (data: string) => void = () => {};

  async connect(): Promise<string> {
    try {
      // Standard Serial Port Profile (SPP) UUID or common GNSS UUIDs
      this.device = await navigator.bluetooth.requestDevice({
        filters: [
          { services: ['00001101-0000-1000-8000-00805f9b34fb'] }, // SPP
          { namePrefix: 'GNSS' },
          { namePrefix: 'RTK' },
          { namePrefix: 'SOUTH' },
          { namePrefix: 'EMLID' }
        ],
        optionalServices: ['00001101-0000-1000-8000-00805f9b34fb']
      });

      const server = await this.device.gatt?.connect();
      const service = await server?.getPrimaryService('00001101-0000-1000-8000-00805f9b34fb');
      this.characteristic = await service?.getCharacteristic('00001101-0000-1000-8000-00805f9b34fb');

      await this.characteristic?.startNotifications();
      this.characteristic?.addEventListener('characteristicvaluechanged', (event: any) => {
        const value = event.target.value;
        const decoder = new TextDecoder();
        const sentence = decoder.decode(value);
        this.onDataCallback(sentence);
      });

      return this.device.name || 'Unknown Device';
    } catch (error) {
      console.error('Bluetooth connection failed:', error);
      throw error;
    }
  }

  onData(callback: (data: string) => void) {
    this.onDataCallback = callback;
  }

  disconnect() {
    if (this.device?.gatt?.connected) {
      this.device.gatt.disconnect();
    }
  }
}
