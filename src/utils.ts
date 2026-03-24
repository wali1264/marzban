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

// Find all simple cycles in the graph of connections using Planar Graph Face Traversal
export function findCycles(points: Point[], connections: Connection[]): Point[][] {
  if (points.length < 3 || connections.length < 3) return [];

  const pointMap = new Map(points.map(p => [p.id, p]));
  const adj = new Map<string, string[]>();
  
  connections.forEach(c => {
    if (!adj.has(c.fromId)) adj.set(c.fromId, []);
    if (!adj.has(c.toId)) adj.set(c.toId, []);
    adj.get(c.fromId)!.push(c.toId);
    adj.get(c.toId)!.push(c.fromId);
  });

  // Pre-sort neighbors by angle CCW to enable O(1) traversal decision at each junction
  const sortedAdj = new Map<string, string[]>();
  for (const [uId, neighbors] of adj.entries()) {
    const u = pointMap.get(uId);
    if (!u) continue;
    
    const sorted = [...neighbors].sort((aId, bId) => {
      const a = pointMap.get(aId)!;
      const b = pointMap.get(bId)!;
      // Use atan2 for CCW sorting of neighbors relative to the current node
      return Math.atan2(a.lat - u.lat, a.lng - u.lng) - Math.atan2(b.lat - u.lat, b.lng - u.lng);
    });
    sortedAdj.set(uId, sorted);
  }

  const visitedEdges = new Set<string>();
  const faces: string[][] = [];

  // Planar Graph Face Traversal Algorithm (Linear Time Complexity O(E))
  // This algorithm identifies all "faces" of the planar graph.
  for (const [uId, neighbors] of sortedAdj.entries()) {
    for (const vId of neighbors) {
      const edgeKey = `${uId}->${vId}`;
      if (visitedEdges.has(edgeKey)) continue;

      const face: string[] = [];
      let curr = uId;
      let next = vId;

      // Follow the "rightmost" edge at each junction to trace a face boundary
      while (!visitedEdges.has(`${curr}->${next}`)) {
        visitedEdges.add(`${curr}->${next}`);
        face.push(curr);
        
        const prev = curr;
        curr = next;
        
        const currNeighbors = sortedAdj.get(curr);
        if (!currNeighbors) break;

        const prevIndex = currNeighbors.indexOf(prev);
        if (prevIndex === -1) break;

        // The "rightmost" neighbor is the one immediately before the incoming edge in CCW list
        const nextIndex = (prevIndex - 1 + currNeighbors.length) % currNeighbors.length;
        next = currNeighbors[nextIndex];

        // Safety break for non-planar or degenerate cases (though land parcels should be planar)
        if (face.length > points.length + 2) break; 
      }

      // Only keep valid cycles that returned to start and have at least 3 points
      if (face.length >= 3 && curr === uId) {
        faces.push(face);
      }
    }
  }

  // Filter for CCW cycles (inner faces). 
  // In a planar traversal using the "rightmost" rule, inner faces are CCW (positive area),
  // while the "outer face" (the infinite region) is CW (negative area).
  const validCycles = faces.filter(faceIds => {
    const facePoints = faceIds.map(id => pointMap.get(id)!);
    let signedArea = 0;
    for (let i = 0; i < facePoints.length; i++) {
      const j = (i + 1) % facePoints.length;
      signedArea += facePoints[i].lng * facePoints[j].lat;
      signedArea -= facePoints[j].lng * facePoints[i].lat;
    }
    return signedArea > 0; 
  });

  return validCycles.map(faceIds => faceIds.map(id => pointMap.get(id)!));
}
