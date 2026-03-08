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

export interface Parcel {
  id: string;
  name: string;
  pointIds: string[]; // Ordered points forming the boundary
  color: string;
  ownerName?: string;
  area?: number; // in square meters
}

export type AppMode = 'VIEW' | 'RECORD' | 'CONNECT' | 'EDIT';
