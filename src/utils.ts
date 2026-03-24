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

// Find all simple cycles in the graph of connections
export function findCycles(points: Point[], connections: Connection[]): Point[][] {
  const adj = new Map<string, string[]>();
  points.forEach(p => adj.set(p.id, []));
  connections.forEach(c => {
    adj.get(c.fromId)?.push(c.toId);
    adj.get(c.toId)?.push(c.fromId);
  });

  const cycles: string[][] = [];
  const pointIds = Array.from(adj.keys());

  const findFromNode = (startNode: string) => {
    // Using a stack for DFS to avoid recursion limits
    const stack: { u: string; p: string; path: string[] }[] = [{ u: startNode, p: '', path: [] }];
    
    while (stack.length > 0) {
      const { u, p, path } = stack.pop()!;
      
      const uIdx = path.indexOf(u);
      if (uIdx !== -1) {
        const cycle = path.slice(uIdx);
        if (cycle.length >= 3) {
          const sortedCycle = [...cycle].sort().join(',');
          if (!cycles.some(c => [...c].sort().join(',') === sortedCycle)) {
            cycles.push(cycle);
          }
        }
        continue;
      }

      if (path.length > 40) continue; // Increased limit for larger parcels

      const neighbors = adj.get(u) || [];
      for (const v of neighbors) {
        if (v === p) continue;
        stack.push({ u: v, p: u, path: [...path, u] });
      }
    }
  };

  pointIds.forEach(id => findFromNode(id));

  return cycles.map(cycleIds => 
    cycleIds.map(id => points.find(p => p.id === id)!).filter(Boolean)
  );
}

/**
 * Checks if a cycle is "minimal" (doesn't contain any other cycle)
 * This helps in identifying independent parcels and avoiding composite "ghost" parcels.
 */
export function isMinimalCycle(cycle: Point[], allCycles: Point[][]): boolean {
  if (allCycles.length <= 1) return true;
  
  const cycleIds = new Set(cycle.map(p => p.id));
  const cycleCoords = [...cycle.map(p => [p.lng, p.lat]), [cycle[0].lng, cycle[0].lat]];
  
  try {
    const cyclePoly = turf.polygon([cycleCoords as any]);
    const cycleArea = turf.area(cyclePoly);

    for (const other of allCycles) {
      if (other.length === cycle.length) {
        const otherIds = other.map(p => p.id).sort().join(',');
        if (otherIds === cycle.map(p => p.id).sort().join(',')) continue;
      }

      const otherCoords = [...other.map(p => [p.lng, p.lat]), [other[0].lng, other[0].lat]];
      const otherPoly = turf.polygon([otherCoords as any]);
      const otherArea = turf.area(otherPoly);

      if (otherArea < cycleArea * 0.99) {
        // Check if other is inside cycle
        const otherCentroid = turf.centroid(otherPoly);
        if (turf.booleanPointInPolygon(otherCentroid, cyclePoly)) {
          return false;
        }
      }
    }
  } catch (e) {
    // If geometry is invalid, assume not minimal to be safe
    return false;
  }
  
  return true;
}
