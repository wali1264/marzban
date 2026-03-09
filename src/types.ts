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
  geometry: [number, number][]; // Coordinates of the sub-polygon
  orientation: 'HORIZONTAL' | 'VERTICAL';
}

export interface Parcel {
  id: string;
  name: string;
  pointIds: string[]; // Ordered points forming the boundary
  divisions: Division[];
  area: number; // in square meters
}

export type AppMode = 'VIEW' | 'RECORD' | 'CONNECT' | 'EDIT' | 'DIVIDE';
