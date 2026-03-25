/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface Point {
  id: string;
  lat: number;
  lng: number;
  timestamp: number;
  accuracy: number; // in meters
  name?: string;
  description?: string;
  // GNSS Metadata for Audit
  satellites?: number;
  confidence?: number;
  stability?: number;
  isSettled?: boolean;
}

export interface Connection {
  id: string;
  fromId: string;
  toId: string;
}

export interface Partner {
  id: string;
  name: string;
  share: number; // percentage (0-100)
}

export interface Division {
  id: string;
  partnerId: string;
  percentage: number;
  geometry: [number, number][][]; // Coordinates of the sub-polygons (MultiPolygon support)
}

export interface Parcel {
  id: string;
  name: string;
  pointIds: string[]; // Ordered points forming the boundary
  divisions: Division[];
  area: number; // in square meters
  ownerName?: string;
  angle?: number; // Rotation angle for divisions in degrees
  isAngleSet?: boolean; // Whether the rotation angle has been confirmed
  generation?: number; // 1 for root, 2 for nested, etc.
  parentId?: string; // ID of the parent parcel if this is a division
  isConverted?: boolean; // Whether its divisions have been materialized as independent parcels
  createdAt: number;
}

export interface GNSSConfig {
  source: 'INTERNAL' | 'EXTERNAL';
  bluetoothDeviceName?: string;
  ntripHost?: string;
  ntripPort?: number;
  ntripMountpoint?: string;
  ntripUser?: string;
  ntripPass?: string;
  locationOffset?: { lat: number; lng: number };
}

export interface GNSSStatus {
  connected: boolean;
  fixType: 'NONE' | '2D' | '3D' | 'DGPS' | 'FLOAT' | 'FIXED';
  satellites: number;
  hdop: number;
  lat: number;
  lng: number;
  altitude: number;
  accuracy: number;
  timestamp: number;
}

export type AppMode = 'VIEW' | 'RECORD' | 'CONNECT' | 'EDIT' | 'DIVIDE' | 'MANAGE' | 'CONVERT' | 'ROTATE' | 'TRACKING' | 'GNSS_SETTINGS';
