import { NodeType, PodType } from './types';

// Parse CPU quantity to cores (as a number)
export const parseCPUQuantity = (quantity: string): number => {
  if (!quantity) return 0;

  // Handle formats like "2", "2000m", "2.5", etc.
  const cpuMatch = quantity.match(/^(\d+(?:\.\d+)?)([m])?$/);
  if (cpuMatch) {
    const [, value, suffix] = cpuMatch;
    // If it has 'm' suffix, it's millicores, convert to cores
    return suffix === 'm' ? parseFloat(value) / 1000 : parseFloat(value);
  }

  // If no match, try to parse as float
  return parseFloat(quantity) || 0;
};

// Parse memory quantity to bytes (as a number)
export const parseMemoryQuantity = (quantity: string): number => {
  if (!quantity) return 0;

  // Binary (Ki, Mi, Gi…) and decimal (K, M, G…) multipliers
  const binaryUnits: Record<string, number> = {
    Ki: 1024,
    Mi: 1024 * 1024,
    Gi: 1024 * 1024 * 1024,
    Ti: 1024 * 1024 * 1024 * 1024,
    Pi: 1024 * 1024 * 1024 * 1024 * 1024,
    Ei: 1024 * 1024 * 1024 * 1024 * 1024 * 1024,
  };
  const decimalUnits: Record<string, number> = {
    K: 1000,
    M: 1000 * 1000,
    G: 1000 * 1000 * 1000,
    T: 1000 * 1000 * 1000 * 1000,
    P: 1000 * 1000 * 1000 * 1000 * 1000,
    E: 1000 * 1000 * 1000 * 1000 * 1000 * 1000,
  };

  // Match number + optional unit (binary with 'i' or plain decimal)
  const match = quantity.match(/^(\d+(?:\.\d+)?)([KMGTPE]i?)?$/);
  if (match) {
    const [, value, unit = ''] = match;
    if (unit) {
      // Binary units (Gi, Mi, …)
      if (binaryUnits[unit]) {
        return parseFloat(value) * binaryUnits[unit];
      }
      // Decimal units (G, M, …)
      const plain = unit.replace(/i$/, '');
      if (decimalUnits[plain]) {
        return parseFloat(value) * decimalUnits[plain];
      }
    }
    return parseFloat(value);
  }

  // Fallback – treat as raw bytes
  return parseFloat(quantity) || 0;
};

// Format memory bytes to a human‑readable string
export const formatMemory = (bytes: number): { value: string; unit: string } => {
  if (bytes === 0) return { value: '0', unit: 'B' };

  const units = ['B', 'KiB', 'MiB', 'GiB', 'TiB'];
  let size = bytes;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }

  return { value: size.toFixed(2), unit: units[unitIndex] };
};

// Parse a generic resource quantity (numbers, memory‑like units, …)
export const parseGenericResource = (quantity: string): number => {
  if (!quantity) return 0;

  const numericValue = parseFloat(quantity);
  if (!isNaN(numericValue) && !quantity.match(/[KMGTPE]i?$/)) {
    return numericValue;
  }

  return parseMemoryQuantity(quantity);
};

// Format a generic resource value
export const formatGenericResource = (value: number, resourceType: string): string => {
  if (resourceType === 'pods' || (!isNaN(value) && value === Math.floor(value))) {
    return value.toString();
  }
  const formatted = formatMemory(value);
  return `${formatted.value} ${formatted.unit}`;
};

// Extract node roles from labels
export const getNodeRoles = (node: NodeType): string[] => {
  const roles: string[] = [];
  const labels = node.metadata?.labels || {};

  Object.keys(labels).forEach((key) => {
    if (key.startsWith('node-role.kubernetes.io/')) {
      const role = key.replace('node-role.kubernetes.io/', '');
      if (role && (labels[key] === '' || labels[key] === 'true')) {
        roles.push(role);
      }
    }
  });

  return roles.sort();
};

// Calculate effective CPU for a pod (max of requests and limits across all containers)
export const calculatePodEffectiveCPU = (pod: PodType): number => {
  let totalRequests = 0;
  let totalLimits = 0;

  pod.spec.containers.forEach((c) => {
    totalRequests += parseCPUQuantity(c.resources?.requests?.cpu ?? '0');
    totalLimits += parseCPUQuantity(c.resources?.limits?.cpu ?? '0');
  });

  return Math.max(totalRequests, totalLimits);
};

// Calculate effective memory for a pod (max of requests and limits across all containers)
export const calculatePodEffectiveMemory = (pod: PodType): number => {
  let totalRequests = 0;
  let totalLimits = 0;

  pod.spec.containers.forEach((c) => {
    totalRequests += parseMemoryQuantity(c.resources?.requests?.memory ?? '0');
    totalLimits += parseMemoryQuantity(c.resources?.limits?.memory ?? '0');
  });

  return Math.max(totalRequests, totalLimits);
};

// Calculate effective resource value for a pod (max of requests and limits across all containers)
export const calculatePodEffectiveResource = (pod: PodType, resourceName: string): number => {
  let totalRequests = 0;
  let totalLimits = 0;

  pod.spec.containers.forEach((c) => {
    const request = c.resources?.requests?.[resourceName] ?? '0';
    const limit = c.resources?.limits?.[resourceName] ?? '0';

    let parsedRequest = 0;
    let parsedLimit = 0;

    if (resourceName === 'cpu') {
      parsedRequest = parseCPUQuantity(request);
      parsedLimit = parseCPUQuantity(limit);
    } else if (resourceName === 'memory') {
      parsedRequest = parseMemoryQuantity(request);
      parsedLimit = parseMemoryQuantity(limit);
    } else {
      parsedRequest = parseGenericResource(request);
      parsedLimit = parseGenericResource(limit);
    }

    totalRequests += parsedRequest;
    totalLimits += parsedLimit;
  });

  return Math.max(totalRequests, totalLimits);
};

// Refactored type guard for Node – uses explicit shape assertions, no `any`
export const isValidNode = (node: unknown): node is NodeType => {
  if (typeof node === 'object' && node !== null && 'metadata' in node && 'status' in node) {
    const n = node as {
      metadata: { uid: string; name: string };
      status: { capacity: Record<string, unknown> };
    };
    return (
      typeof n.metadata.uid === 'string' &&
      typeof n.metadata.name === 'string' &&
      typeof n.status.capacity === 'object' &&
      n.status.capacity !== null
    );
  }
  return false;
};

// Refactored type guard for Pod – explicit shape, no `any`
export const isValidPod = (pod: unknown): pod is PodType => {
  if (
    typeof pod === 'object' &&
    pod !== null &&
    'spec' in pod &&
    'metadata' in pod &&
    'status' in pod
  ) {
    const p = pod as {
      spec: { containers: unknown[] };
      metadata: { name: string; uid: string; namespace: string };
      status: { phase: string };
    };
    return (
      Array.isArray(p.spec.containers) &&
      p.spec.containers.length > 0 &&
      typeof p.metadata.name === 'string' &&
      typeof p.metadata.uid === 'string' &&
      typeof p.metadata.namespace === 'string' &&
      typeof p.status.phase === 'string' &&
      !['Succeeded', 'Failed'].includes(p.status.phase)
    );
  }
  return false;
};

// Parse scheduling failure message to extract a concise reason
export const parseSchedulingFailureMessage = (message: string): string => {
  if (!message) return 'Unknown reason';

  let cleaned = message.replace(/^\d+\/\d+\s+nodes\s+are\s+available:\s*/i, '');
  const parts = cleaned.split(/preemption:/i);
  cleaned = parts[0].trim();
  cleaned = cleaned.replace(/\.+$/, '').trim();

  const pvcMatch = cleaned.match(/persistentvolumeclaim\s+"([^"]+)"\s+(.+?)(?:\.|$)/i);
  if (pvcMatch) return `PVC "${pvcMatch[1]}" ${pvcMatch[2]}`;

  const taintMatch = cleaned.match(/node\(s\)\s+had\s+taint\s+{([^}]+)}/i);
  if (taintMatch) return `Taint: ${taintMatch[1]}`;

  const resourceMatch = cleaned.match(/(\d+)\s+(Insufficient\s+\w+)/i);
  if (resourceMatch) return `${resourceMatch[1]} ${resourceMatch[2]}`;

  const affinityMatch = cleaned.match(/(node\(s\)\s+didn't\s+match\s+[^.]+)/i);
  if (affinityMatch) return affinityMatch[1];

  const lastColon = cleaned.lastIndexOf(':');
  if (lastColon > 0 && lastColon < cleaned.length - 1) {
    const after = cleaned.substring(lastColon + 1).trim();
    if (after) cleaned = after;
  }

  if (cleaned.length > 100) cleaned = cleaned.substring(0, 97) + '...';
  return cleaned || 'Unknown reason';
};

// Get scheduling failure reason from pod conditions
export const getSchedulingFailureReason = (pod: PodType): string | null => {
  if (!pod.status?.conditions) return null;

  const cond = pod.status.conditions.find((c) => c.type === 'PodScheduled' && c.status === 'False');

  if (!cond) return null;
  return cond.message
    ? parseSchedulingFailureMessage(cond.message)
    : cond.reason || 'Unknown reason';
};
