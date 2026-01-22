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

  // Handle formats like "1Gi", "512Mi", "2Ki", etc.
  const units: {[key: string]: number} = {
    'Ki': 1024,
    'Mi': 1024 * 1024,
    'Gi': 1024 * 1024 * 1024,
    'Ti': 1024 * 1024 * 1024 * 1024,
    'Pi': 1024 * 1024 * 1024 * 1024 * 1024,
    'Ei': 1024 * 1024 * 1024 * 1024 * 1024 * 1024
  };

  const match = quantity.match(/^(\d+(?:\.\d+)?)([KMGTPE]i)?$/);
  if (match) {
    const [, value, unit] = match;
    return unit ? parseFloat(value) * units[unit] : parseFloat(value);
  }

  // If no match, try to parse as bytes
  return parseFloat(quantity) || 0;
};

// Format memory bytes to human-readable string
export const formatMemory = (bytes: number): { value: string, unit: string } => {
  if (bytes === 0) return { value: '0', unit: 'B' };

  const units = ['B', 'KiB', 'MiB', 'GiB', 'TiB'];
  let size = bytes;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }

  return {
    value: size.toFixed(2),
    unit: units[unitIndex]
  };
};

// Parse a generic resource quantity (handles numbers, memory-like units, etc.)
export const parseGenericResource = (quantity: string): number => {
  if (!quantity) return 0;

  // Try parsing as a number first (for things like pods count)
  const numericValue = parseFloat(quantity);
  if (!isNaN(numericValue) && !quantity.match(/[KMGTPE]i?$/)) {
    return numericValue;
  }

  // Try parsing as memory (for storage-like resources)
  return parseMemoryQuantity(quantity);
};

// Format a generic resource value
export const formatGenericResource = (value: number, resourceType: string): string => {
  // For numeric resources (like pods), just return the number
  if (resourceType === 'pods' || (!isNaN(value) && value === Math.floor(value))) {
    return value.toString();
  }

  // For memory-like resources, format as memory
  const formatted = formatMemory(value);
  return `${formatted.value} ${formatted.unit}`;
};

// Extract node roles from labels
export const getNodeRoles = (node: NodeType): string[] => {
  const roles: string[] = [];
  const labels = node.metadata?.labels || {};

  Object.keys(labels).forEach(key => {
    if (key.startsWith('node-role.kubernetes.io/')) {
      const role = key.replace('node-role.kubernetes.io/', '');
      // Skip empty roles or if the value is not "true" or empty
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

  pod.spec.containers.forEach(container => {
    const cpuRequest = container.resources?.requests?.cpu || '0';
    const cpuLimit = container.resources?.limits?.cpu || '0';
    totalRequests += parseCPUQuantity(cpuRequest);
    totalLimits += parseCPUQuantity(cpuLimit);
  });

  return Math.max(totalRequests, totalLimits);
};

// Calculate effective memory for a pod (max of requests and limits across all containers)
export const calculatePodEffectiveMemory = (pod: PodType): number => {
  let totalRequests = 0;
  let totalLimits = 0;

  pod.spec.containers.forEach(container => {
    const memoryRequest = container.resources?.requests?.memory || '0';
    const memoryLimit = container.resources?.limits?.memory || '0';
    totalRequests += parseMemoryQuantity(memoryRequest);
    totalLimits += parseMemoryQuantity(memoryLimit);
  });

  return Math.max(totalRequests, totalLimits);
};

// Calculate effective resource value for a pod (max of requests and limits across all containers)
export const calculatePodEffectiveResource = (pod: PodType, resourceName: string): number => {
  let totalRequests = 0;
  let totalLimits = 0;

  pod.spec.containers.forEach(container => {
    const request = container.resources?.requests?.[resourceName] || '0';
    const limit = container.resources?.limits?.[resourceName] || '0';
    
    // Parse based on resource type
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

export const isValidNode = (node: any): node is NodeType => {
  return (
    node &&
    typeof node === 'object' &&
    node.metadata &&
    typeof node.metadata.uid === 'string' &&
    typeof node.metadata.name === 'string' &&
    node.status &&
    typeof node.status === 'object' &&
    node.status.capacity &&
    typeof node.status.capacity === 'object'
  );
};

export const isValidPod = (pod: any): pod is PodType => {
  return (
    pod &&
    typeof pod === 'object' &&
    pod.spec &&
    pod.spec.containers && Array.isArray(pod.spec.containers) &&
    pod.metadata &&
    typeof pod.metadata.name === 'string' &&
    typeof pod.metadata.uid === 'string' &&
    typeof pod.metadata.namespace === 'string' &&
    pod.status &&
    typeof pod.status.phase === 'string' &&
    pod.spec.containers.length > 0 &&
    !['Succeeded', 'Failed'].includes(pod.status.phase)
  );
};

// Parse scheduling failure message to extract useful information
export const parseSchedulingFailureMessage = (message: string): string => {
  if (!message) return 'Unknown reason';

  // Remove the "X/Y nodes are available:" prefix if present
  let cleaned = message.replace(/^\d+\/\d+\s+nodes\s+are\s+available:\s*/i, '');

  // Split by "preemption:" to get the main reason (preemption info is usually less useful)
  const parts = cleaned.split(/preemption:/i);
  cleaned = parts[0].trim();

  // Remove trailing periods and whitespace
  cleaned = cleaned.replace(/\.+$/, '').trim();

  // If the message contains common patterns, extract the key part
  // Examples:
  // - "persistentvolumeclaim "data" not found"
  // - "1 Insufficient memory"
  // - "node(s) had taint {key: value}, that the pod didn't tolerate"

  // Extract resource-related errors (PVC, storage, etc.)
  const pvcMatch = cleaned.match(/persistentvolumeclaim\s+"([^"]+)"\s+(.+?)(?:\.|$)/i);
  if (pvcMatch) {
    return `PVC "${pvcMatch[1]}" ${pvcMatch[2]}`;
  }

  // Extract taint/toleration errors
  const taintMatch = cleaned.match(/node\(s\)\s+had\s+taint\s+{([^}]+)}/i);
  if (taintMatch) {
    return `Taint: ${taintMatch[1]}`;
  }

  // Extract insufficient resource errors
  const resourceMatch = cleaned.match(/(\d+)\s+(Insufficient\s+\w+)/i);
  if (resourceMatch) {
    return `${resourceMatch[1]} ${resourceMatch[2]}`;
  }

  // Extract affinity/selector errors
  const affinityMatch = cleaned.match(/(node\(s\)\s+didn't\s+match\s+[^.]+)/i);
  if (affinityMatch) {
    return affinityMatch[1];
  }

  // If we have a colon, take the part after the last colon (usually the actual reason)
  const lastColonIndex = cleaned.lastIndexOf(':');
  if (lastColonIndex > 0 && lastColonIndex < cleaned.length - 1) {
    const afterColon = cleaned.substring(lastColonIndex + 1).trim();
    if (afterColon.length > 0 && afterColon.length < cleaned.length) {
      cleaned = afterColon;
    }
  }

  // Limit length to avoid overly long messages
  if (cleaned.length > 100) {
    cleaned = cleaned.substring(0, 97) + '...';
  }

  return cleaned || 'Unknown reason';
};

// Get scheduling failure reason from pod conditions
export const getSchedulingFailureReason = (pod: PodType): string | null => {
  if (!pod.status?.conditions) return null;

  // Look for PodScheduled condition with status False
  const podScheduledCondition = pod.status.conditions.find(
    condition => condition.type === 'PodScheduled' && condition.status === 'False'
  );

  if (podScheduledCondition) {
    // Use message if available, fallback to reason
    if (podScheduledCondition.message) {
      return parseSchedulingFailureMessage(podScheduledCondition.message);
    }
    return podScheduledCondition.reason || 'Unknown reason';
  }

  return null;
};
