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
  connections.forEach(c => {
    if (!adj.has(c.fromId)) adj.set(c.fromId, []);
    if (!adj.has(c.toId)) adj.set(c.toId, []);
    adj.get(c.fromId)!.push(c.toId);
    adj.get(c.toId)!.push(c.fromId);
  });

  const cycles: string[][] = [];
  const pointIds = Array.from(adj.keys());

  const findFromNode = (startNode: string) => {
    const stack: { u: string; p: string; path: string[] }[] = [{ u: startNode, p: '', path: [] }];
    
    while (stack.length > 0) {
      const { u, p, path } = stack.pop()!;
      
      if (path.includes(u)) {
        const cycle = path.slice(path.indexOf(u));
        if (cycle.length >= 3) {
          const sortedCycle = [...cycle].sort().join(',');
          if (!cycles.some(c => [...c].sort().join(',') === sortedCycle)) {
            cycles.push(cycle);
          }
        }
        continue;
      }

      if (path.length > 200) continue; 

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
