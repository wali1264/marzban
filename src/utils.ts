import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import * as turf from '@turf/turf';
import { Point, Connection } from './types';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Precise area calculation in square meters using Turf
export function calculatePolygonArea(nodes: Point[]): number {
  if (nodes.length < 3) return 0;
  const coords = [...nodes.map(p => [p.lng, p.lat]), [nodes[0].lng, nodes[0].lat]];
  try {
    const poly = turf.polygon([coords as any]);
    return turf.area(poly);
  } catch (e) {
    return 0;
  }
}

// Find all minimal cycles (faces) in the planar graph of connections
export function findCycles(points: Point[], connections: Connection[]): Point[][] {
  const adj = new Map<string, string[]>();
  connections.forEach(c => {
    if (!adj.has(c.fromId)) adj.set(c.fromId, []);
    if (!adj.has(c.toId)) adj.set(c.toId, []);
    adj.get(c.fromId)!.push(c.toId);
    adj.get(c.toId)!.push(c.fromId);
  });

  const pointMap = new Map(points.map(p => [p.id, p]));
  
  // Sort neighbors by angle for each node
  const sortedAdj = new Map<string, string[]>();
  adj.forEach((neighbors, uId) => {
    const u = pointMap.get(uId)!;
    const sorted = [...neighbors].sort((aId, bId) => {
      const a = pointMap.get(aId)!;
      const b = pointMap.get(bId)!;
      return Math.atan2(a.lat - u.lat, a.lng - u.lng) - Math.atan2(b.lat - u.lat, b.lng - u.lng);
    });
    sortedAdj.set(uId, sorted);
  });

  const usedEdges = new Set<string>();
  const cycles: string[][] = [];

  adj.forEach((neighbors, uId) => {
    neighbors.forEach(vId => {
      const edgeKey = `${uId}->${vId}`;
      if (usedEdges.has(edgeKey)) return;

      const cycle: string[] = [uId];
      let curr = vId;
      let prev = uId;

      while (curr !== uId && cycle.length < 100) {
        usedEdges.add(`${prev}->${curr}`);
        cycle.push(curr);
        
        const nextNeighbors = sortedAdj.get(curr)!;
        const prevIdx = nextNeighbors.indexOf(prev);
        // The "next" edge is the one immediately counter-clockwise to (curr, prev)
        const nextIdx = (prevIdx - 1 + nextNeighbors.length) % nextNeighbors.length;
        const next = nextNeighbors[nextIdx];
        
        prev = curr;
        curr = next;
      }

      if (curr === uId && cycle.length >= 3) {
        usedEdges.add(`${prev}->${curr}`);
        // Calculate signed area to ensure it's a counter-clockwise cycle (internal face)
        // In Leaflet/Turf, CCW is usually positive area for the outer ring
        const cyclePoints = cycle.map(id => pointMap.get(id)!);
        const coords = [...cyclePoints.map(p => [p.lng, p.lat]), [cyclePoints[0].lng, cyclePoints[0].lat]];
        const poly = turf.polygon([coords as any]);
        const area = turf.area(poly);
        
        // We only want "internal" faces. A simple heuristic is to check if the area is positive
        // and if it's not the "infinite" outer face. 
        // For our purposes, we'll just keep all cycles and filter by area later if needed.
        // But the "left-hand rule" usually gives internal faces if we pick the next edge CCW.
        
        // Check if this cycle is already found (in any rotation)
        const sortedCycle = [...cycle].sort().join(',');
        if (!cycles.some(c => [...c].sort().join(',') === sortedCycle)) {
          cycles.push(cycle);
        }
      }
    });
  });

  return cycles.map(cycleIds => 
    cycleIds.map(id => points.find(p => p.id === id)!).filter(Boolean)
  );
}
