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

// Find all minimal cycles (internal faces) in the planar graph of connections
export function findCycles(points: Point[], connections: Connection[]): Point[][] {
  const adj = new Map<string, string[]>();
  connections.forEach(c => {
    if (!adj.has(c.fromId)) adj.set(c.fromId, []);
    if (!adj.has(c.toId)) adj.set(c.toId, []);
    adj.get(c.fromId)!.push(c.toId);
    adj.get(c.toId)!.push(c.fromId);
  });

  const pointMap = new Map(points.map(p => [p.id, p]));
  
  // Sort neighbors by angle for each node (Counter-Clockwise)
  const sortedAdj = new Map<string, string[]>();
  adj.forEach((neighbors, uId) => {
    const u = pointMap.get(uId)!;
    const sorted = [...neighbors].sort((aId, bId) => {
      const a = pointMap.get(aId)!;
      const b = pointMap.get(bId)!;
      // Math.atan2 returns angle in (-PI, PI]
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

      // Trace the face using the "left-hand rule" (always take the leftmost turn)
      while (curr !== uId && cycle.length < 100) {
        usedEdges.add(`${prev}->${curr}`);
        cycle.push(curr);
        
        const nextNeighbors = sortedAdj.get(curr)!;
        const prevIdx = nextNeighbors.indexOf(prev);
        // Leftmost turn in CCW sorted list is the previous element
        const nextIdx = (prevIdx - 1 + nextNeighbors.length) % nextNeighbors.length;
        const next = nextNeighbors[nextIdx];
        
        prev = curr;
        curr = next;
      }

      if (curr === uId && cycle.length >= 3) {
        usedEdges.add(`${prev}->${curr}`);
        
        const cyclePoints = cycle.map(id => pointMap.get(id)!);
        const coords = [...cyclePoints.map(p => [p.lng, p.lat]), [cyclePoints[0].lng, cyclePoints[0].lat]];
        
        try {
          const poly = turf.polygon([coords as any]);
          
          // In the left-hand rule with CCW sorted neighbors:
          // Internal faces are traced Counter-Clockwise (positive signed area)
          // The external face is traced Clockwise (negative signed area)
          // We use turf.booleanClockwise to filter out the external face.
          // booleanClockwise expects a LineString or Position[]
          if (!turf.booleanClockwise(coords as any)) {
            const sortedCycle = [...cycle].sort().join(',');
            if (!cycles.some(c => [...c].sort().join(',') === sortedCycle)) {
              cycles.push(cycle);
            }
          }
        } catch (e) {
          // Ignore invalid polygons
        }
      }
    });
  });

  return cycles.map(cycleIds => 
    cycleIds.map(id => pointMap.get(id)!).filter(Boolean)
  );
}
