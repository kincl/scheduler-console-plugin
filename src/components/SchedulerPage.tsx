import React, { useMemo, Suspense, useState, useRef, useEffect } from 'react';
import {
  Title,
  Card,
  CardTitle,
  CardBody,
  Spinner,
  Label,
  Popover,
  Checkbox,
  Button,
  SearchInput,
} from '@patternfly/react-core';
import { useK8sWatchResource } from '@openshift-console/dynamic-plugin-sdk';

interface NodeCondition {
  type: string;
  status: string;
  reason?: string;
  message?: string;
  lastTransitionTime?: string;
}

interface NodeType {
  metadata: {
    name: string;
    uid: string;
    labels?: {
      [key: string]: string;
    };
  };
  status: {
    capacity: {
      [key: string]: string;
    };
    conditions?: NodeCondition[];
  };
}

interface PodCondition {
  type: string;
  status: string;
  reason?: string;
  message?: string;
  lastTransitionTime?: string;
}

interface PodType {
  metadata: {
    name: string;
    uid: string;
    namespace: string;
  };
  spec: {
    nodeName?: string;
    containers: Array<{
      resources?: {
        requests?: {
          [key: string]: string;
        };
        limits?: {
          [key: string]: string;
        };
      };
    }>;
  };
  status: {
    phase: string;
    conditions?: PodCondition[];
  };
}

interface NamespaceType {
  metadata: {
    name: string;
    uid: string;
  };
}


// Parse CPU quantity to cores (as a number)
const parseCPUQuantity = (quantity: string): number => {
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
const parseMemoryQuantity = (quantity: string): number => {
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
const formatMemory = (bytes: number): { value: string, unit: string } => {
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

// Effective CPU Bar Component (max of requests and limits)
const EffectiveCPUBar: React.FC<{
  totalCPUs: number;
  requestedCPUs: number;
  limitedCPUs: number;
  nodeName: string;
  hoveredPodCPU?: number;
}> = ({ totalCPUs, requestedCPUs, limitedCPUs, nodeName, hoveredPodCPU }) => {
  // Effective CPU is the maximum of requests and limits
  const effectiveCPUs = Math.max(requestedCPUs, limitedCPUs);
  const percentageUsed = totalCPUs > 0 ? Math.min((effectiveCPUs / totalCPUs) * 100, 100) : 0;
  const hoveredPercentage = hoveredPodCPU && totalCPUs > 0 ? Math.min((hoveredPodCPU / totalCPUs) * 100, 100) : 0;

  // Color based on utilization
  const getBarColor = () => {
    if (percentageUsed < 70) return '#3E8635'; // green
    if (percentageUsed < 90) return '#F0AB00'; // orange/warning
    return '#C9190B'; // red/danger
  };

  return (
    <div style={{ width: '100%' }}>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '0.25rem'
      }}>
        <span style={{ fontSize: '0.7rem' }}>Effective CPU</span>
        <span style={{ fontSize: '0.7rem', color: '#6A6E73' }}>
          {effectiveCPUs.toFixed(2)} / {totalCPUs.toFixed(2)} cores
        </span>
      </div>
      <div style={{
        width: '100%',
        height: '12px',
        backgroundColor: '#F0F0F0',
        borderRadius: '2px',
        overflow: 'hidden',
        position: 'relative',
        border: '1px solid #D1D1D1'
      }}>
        <div
          style={{
            width: `${percentageUsed}%`,
            height: '100%',
            backgroundColor: getBarColor(),
            transition: 'width 0.3s ease, background-color 0.3s ease'
          }}
          title={`${nodeName}: ${effectiveCPUs.toFixed(2)} of ${totalCPUs.toFixed(2)} CPUs`}
        />
        {/* Overlay for hovered pod */}
        {hoveredPodCPU && hoveredPodCPU > 0 && (
          <div
            style={{
              position: 'absolute',
              left: 0,
              top: 0,
              width: `${hoveredPercentage}%`,
              height: '100%',
              backgroundColor: 'rgba(6, 0, 204, 0.5)',
              border: '2px solid #06C',
              boxSizing: 'border-box',
              pointerEvents: 'none',
              transition: 'width 0.2s ease'
            }}
            title={`Hovered pod: ${hoveredPodCPU.toFixed(2)} cores (${hoveredPercentage.toFixed(1)}%)`}
          />
        )}
      </div>
    </div>
  );
};

// Effective Memory Bar Component (max of requests and limits)
const EffectiveMemoryBar: React.FC<{
  totalMemory: number;
  requestedMemory: number;
  limitedMemory: number;
  nodeName: string;
  hoveredPodMemory?: number;
}> = ({ totalMemory, requestedMemory, limitedMemory, nodeName, hoveredPodMemory }) => {
  // Effective Memory is the maximum of requests and limits
  const effectiveMemory = Math.max(requestedMemory, limitedMemory);
  const percentageUsed = totalMemory > 0 ? Math.min((effectiveMemory / totalMemory) * 100, 100) : 0;
  const hoveredPercentage = hoveredPodMemory && totalMemory > 0 ? Math.min((hoveredPodMemory / totalMemory) * 100, 100) : 0;
  
  const usedFormatted = formatMemory(effectiveMemory);
  const totalFormatted = formatMemory(totalMemory);
  const hoveredFormatted = hoveredPodMemory ? formatMemory(hoveredPodMemory) : null;

  // Color based on utilization
  const getBarColor = () => {
    if (percentageUsed < 70) return '#3E8635'; // green
    if (percentageUsed < 90) return '#F0AB00'; // orange/warning
    return '#C9190B'; // red/danger
  };

  return (
    <div style={{ width: '100%' }}>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '0.25rem'
      }}>
        <span style={{ fontSize: '0.7rem' }}>Effective Memory</span>
        <span style={{ fontSize: '0.7rem', color: '#6A6E73' }}>
          {usedFormatted.value} {usedFormatted.unit} / {totalFormatted.value} {totalFormatted.unit}
        </span>
      </div>
      <div style={{
        width: '100%',
        height: '12px',
        backgroundColor: '#F0F0F0',
        borderRadius: '2px',
        overflow: 'hidden',
        position: 'relative',
        border: '1px solid #D1D1D1'
      }}>
        <div
          style={{
            width: `${percentageUsed}%`,
            height: '100%',
            backgroundColor: getBarColor(),
            transition: 'width 0.3s ease, background-color 0.3s ease'
          }}
          title={`${nodeName}: ${usedFormatted.value} ${usedFormatted.unit} of ${totalFormatted.value} ${totalFormatted.unit}`}
        />
        {/* Overlay for hovered pod */}
        {hoveredPodMemory && hoveredPodMemory > 0 && hoveredFormatted && (
          <div
            style={{
              position: 'absolute',
              left: 0,
              top: 0,
              width: `${hoveredPercentage}%`,
              height: '100%',
              backgroundColor: 'rgba(139, 92, 246, 0.5)',
              border: '2px solid #8B5CF6',
              boxSizing: 'border-box',
              pointerEvents: 'none',
              transition: 'width 0.2s ease'
            }}
            title={`Hovered pod: ${hoveredFormatted.value} ${hoveredFormatted.unit} (${hoveredPercentage.toFixed(1)}%)`}
          />
        )}
      </div>
    </div>
  );
};

// Generic Resource Bar Component for other capacity resources
const GenericResourceBar: React.FC<{
  total: number;
  used: number;
  nodeName: string;
  label: string;
  formatValue: (value: number) => string;
}> = ({ total, used, nodeName, label, formatValue }) => {
  const percentageUsed = total > 0 ? Math.min((used / total) * 100, 100) : 0;

  // Color based on utilization
  const getBarColor = () => {
    if (percentageUsed < 70) return '#3E8635'; // green
    if (percentageUsed < 90) return '#F0AB00'; // orange/warning
    return '#C9190B'; // red/danger
  };

  return (
    <div style={{ width: '100%' }}>
    <div style={{
      display: 'flex',
        justifyContent: 'space-between',
      alignItems: 'center',
        marginBottom: '0.25rem'
      }}>
        <span style={{ fontSize: '0.7rem' }}>{label}</span>
        <span style={{ fontSize: '0.7rem', color: '#6A6E73' }}>
          {formatValue(used)} / {formatValue(total)}
        </span>
      </div>
      <div style={{
      width: '100%',
        height: '12px',
        backgroundColor: '#F0F0F0',
        borderRadius: '2px',
      overflow: 'hidden',
        position: 'relative',
        border: '1px solid #D1D1D1'
    }}>
        <div
          style={{
            width: `${percentageUsed}%`,
            height: '100%',
            backgroundColor: getBarColor(),
            transition: 'width 0.3s ease, background-color 0.3s ease'
          }}
          title={`${nodeName}: ${formatValue(used)} of ${formatValue(total)} ${label.toLowerCase()}`}
        />
      </div>
    </div>
  );
};

// Extract node roles from labels
const getNodeRoles = (node: NodeType): string[] => {
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

// Node Roles Component
const NodeRoles: React.FC<{ node: NodeType }> = ({ node }) => {
  const roles = getNodeRoles(node);

  if (roles.length === 0) {
    return null;
  }

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: '0.5rem',
      marginLeft: '0.5rem'
    }}>
      {roles.map(role => (
        <Label
          key={role}
          color="blue"
          style={{ fontSize: '0.7rem' }}
        >
          {role}
        </Label>
      ))}
    </div>
  );
};

// Node Conditions Component
const NodeConditions: React.FC<{ node: NodeType }> = ({ node }) => {
  const conditions = node.status?.conditions || [];

  // Filter for conditions we want to display
  const displayConditions = conditions.filter(condition =>
    ['Ready', 'MemoryPressure', 'DiskPressure', 'PIDPressure'].includes(condition.type)
  );

  if (displayConditions.length === 0) {
    return null;
  }

  const getConditionColor = (type: string, status: string) => {
    // For Ready: True is good (green), False is bad (red)
    // For pressure conditions: True is bad (red), False is good (green)
    if (type === 'Ready') {
      return status === 'True' ? 'green' : 'red';
    }
    return status === 'True' ? 'red' : 'green';
  };

  const getConditionLabel = (type: string) => {
    const labels: { [key: string]: string } = {
      'Ready': 'Ready',
      'MemoryPressure': 'Mem',
      'DiskPressure': 'Disk',
      'PIDPressure': 'PID'
    };
    return labels[type] || type;
  };

  // Sort conditions: Ready first, then others
  const sortedConditions = [...displayConditions].sort((a, b) => {
      if (a.type === 'Ready') return -1;
      if (b.type === 'Ready') return 1;
      return a.type.localeCompare(b.type);
    });

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: '0.5rem',
      marginLeft: 'auto'
    }}>
      {sortedConditions.map(condition => (
        <Label
          key={condition.type}
          color={getConditionColor(condition.type, condition.status)}
          style={{ fontSize: '0.7rem' }}
          title={condition.message || condition.reason || `${condition.type}: ${condition.status}`}
        >
          {getConditionLabel(condition.type)}
        </Label>
      ))}
    </div>
  );
};

// Calculate effective CPU for a pod (max of requests and limits across all containers)
const calculatePodEffectiveCPU = (pod: PodType): number => {
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
const calculatePodEffectiveMemory = (pod: PodType): number => {
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

// Pod Box Component - small box representing a pod
const PodBox: React.FC<{ 
  pod: PodType; 
  width: number; 
  showName: boolean;
  onHover?: (cpu: number, memory: number) => void;
  onHoverEnd?: () => void;
}> = ({ pod, width, showName, onHover, onHoverEnd }) => {
  const [isTooltipVisible, setIsTooltipVisible] = useState(false);

  const getPhaseColor = (phase: string) => {
    switch (phase) {
      case 'Running':
        return '#3E8635'; // green
      case 'Pending':
        return '#F0AB00'; // orange
      case 'Succeeded':
        return '#06C'; // blue
      case 'Failed':
        return '#C9190B'; // red
      default:
        return '#6A6E73'; // gray
    }
  };

  const effectiveCPU = calculatePodEffectiveCPU(pod);
  const effectiveMemory = calculatePodEffectiveMemory(pod);
  const memoryFormatted = formatMemory(effectiveMemory);

  const handleMouseEnter = () => {
    if (onHover) {
      onHover(effectiveCPU, effectiveMemory);
    }
  };

  const handleMouseLeave = () => {
    if (onHoverEnd) {
      onHoverEnd();
    }
  };

  const handleClick = () => {
    setIsTooltipVisible(!isTooltipVisible);
  };

  const podContent = (
    <div style={{ fontSize: '0.8rem' }}>
      <div style={{ display: 'flex', marginBottom: '0.25rem' }}>
        <span style={{ fontWeight: 'bold', minWidth: '80px' }}>Name:</span>
        <span style={{ wordBreak: 'break-word' }}>{pod.metadata.name}</span>
      </div>
      <div style={{ display: 'flex', marginBottom: '0.25rem' }}>
        <span style={{ fontWeight: 'bold', minWidth: '80px' }}>Namespace:</span>
        <span>{pod.metadata.namespace}</span>
      </div>
      <div style={{ display: 'flex', marginBottom: '0.25rem' }}>
        <span style={{ fontWeight: 'bold', minWidth: '80px' }}>Phase:</span>
        <span>{pod.status.phase}</span>
      </div>
      <div style={{ display: 'flex', marginBottom: '0.25rem' }}>
        <span style={{ fontWeight: 'bold', minWidth: '80px' }}>CPU:</span>
        <span>{effectiveCPU.toFixed(2)} cores</span>
      </div>
      <div style={{ display: 'flex' }}>
        <span style={{ fontWeight: 'bold', minWidth: '80px' }}>Memory:</span>
        <span>{memoryFormatted.value} {memoryFormatted.unit}</span>
      </div>
    </div>
  );

  return (
    <Popover
      headerContent={<div>Pod Details</div>}
      bodyContent={podContent}
      isVisible={isTooltipVisible}
      shouldClose={() => setIsTooltipVisible(false)}
      position="bottom"
      enableFlip
    >
      <div
        onClick={handleClick}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        style={{
          width: `${width}px`,
          minWidth: showName ? '48px' : undefined,
          height: '24px',
          backgroundColor: getPhaseColor(pod.status.phase),
          borderRadius: '4px',
          border: '1px solid #D1D1D1',
          cursor: 'pointer',
          flexShrink: 0,
          display: showName ? 'flex' : 'block',
          alignItems: showName ? 'center' : undefined,
          justifyContent: showName ? 'center' : undefined,
          padding: showName ? '0.25rem' : undefined,
          boxSizing: 'border-box',
          overflow: 'hidden'
        }}
      >
        {showName && (
          <span style={{
            color: '#ffffff',
            fontSize: '0.65rem',
            textAlign: 'center',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            width: '100%',
            textShadow: '0 1px 2px rgba(0, 0, 0, 0.5)',
            pointerEvents: 'none'
          }}>
            {pod.metadata.name}
          </span>
        )}
      </div>
    </Popover>
  );
};

// Pods Display Component - shows all pods for a node
const PodsDisplay: React.FC<{ 
  pods: PodType[]; 
  showNames: boolean; 
  title: string;
  onPodHover?: (cpu: number, memory: number) => void;
  onPodHoverEnd?: () => void;
}> = ({ pods, showNames, title, onPodHover, onPodHoverEnd }) => {
  if (pods.length === 0) {
    return null;
  }

  // Calculate effective CPU and memory for each pod
  const podsWithResources = pods.map(pod => ({
    pod,
    effectiveCPU: calculatePodEffectiveCPU(pod),
    effectiveMemory: calculatePodEffectiveMemory(pod)
  }));

  // Find max values to normalize
  const maxEffectiveCPU = Math.max(...podsWithResources.map(p => p.effectiveCPU), 1);
  const maxEffectiveMemory = Math.max(...podsWithResources.map(p => p.effectiveMemory), 1);

  // Calculate combined resource score (normalized average of CPU and memory)
  const podsWithScore = podsWithResources.map(({ pod, effectiveCPU, effectiveMemory }) => {
    // Normalize both to 0-1 range
    const normalizedCPU = maxEffectiveCPU > 0 ? effectiveCPU / maxEffectiveCPU : 0;
    const normalizedMemory = maxEffectiveMemory > 0 ? effectiveMemory / maxEffectiveMemory : 0;

    // Combined score (average of normalized CPU and memory)
    const combinedScore = (normalizedCPU + normalizedMemory) / 2;

    return { pod, effectiveCPU, effectiveMemory, combinedScore };
  });

  // Sort by combined score (descending)
  podsWithScore.sort((a, b) => b.combinedScore - a.combinedScore);

  // Base width and max width for pod boxes - larger when showing names
  const minWidth = showNames ? 48 : 24;
  const maxWidth = showNames ? 240 : 120;

  return (
    <div style={{
      marginTop: '0.75rem',
      paddingTop: '0.75rem',
      borderTop: '1px solid #D1D1D1'
    }}>
      <div style={{
        fontSize: '0.7rem',
        marginBottom: '0.5rem',
        color: '#6A6E73'
      }}>
        {title} ({pods.length})
      </div>
      <div style={{
            display: 'flex',
        flexWrap: 'wrap',
            gap: '0.25rem'
      }}>
        {podsWithScore.map(({ pod, combinedScore, effectiveCPU, effectiveMemory }) => {
          // Pods with no resource allocation are half size
          if (effectiveCPU === 0 && effectiveMemory === 0) {
            return (
              <PodBox 
                key={pod.metadata.uid} 
                pod={pod} 
                width={minWidth / 2} 
                showName={showNames}
                onHover={onPodHover}
                onHoverEnd={onPodHoverEnd}
              />
            );
          }

          // Calculate width proportionally based on combined score
          const width = minWidth + combinedScore * (maxWidth - minWidth);

          return (
            <PodBox 
              key={pod.metadata.uid} 
              pod={pod} 
              width={width} 
              showName={showNames}
              onHover={onPodHover}
              onHoverEnd={onPodHoverEnd}
            />
          );
        })}
        </div>
    </div>
  );
};

// Parse a generic resource quantity (handles numbers, memory-like units, etc.)
const parseGenericResource = (quantity: string): number => {
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
const formatGenericResource = (value: number, resourceType: string): string => {
  // For numeric resources (like pods), just return the number
  if (resourceType === 'pods' || (!isNaN(value) && value === Math.floor(value))) {
    return value.toString();
  }

  // For memory-like resources, format as memory
  const formatted = formatMemory(value);
  return `${formatted.value} ${formatted.unit}`;
};

const NodeCard: React.FC<{
  node: NodeType & { _key?: string };
  requestedCPUs: number;
  limitedCPUs: number;
  requestedMemory: number;
  limitedMemory: number;
  pods: PodType[];
  selectedResources: Set<string>;
  resourceUsage: { [resourceName: string]: { requests: { [nodeName: string]: number }, limits: { [nodeName: string]: number } } };
  showPodNames: boolean;
}> = ({ node, requestedCPUs, limitedCPUs, requestedMemory, limitedMemory, pods, selectedResources, resourceUsage, showPodNames }) => {
  const [hoveredPodCPU, setHoveredPodCPU] = useState<number | undefined>(undefined);
  const [hoveredPodMemory, setHoveredPodMemory] = useState<number | undefined>(undefined);

  const totalCPUs = parseCPUQuantity(node.status?.capacity?.cpu || '0');
  const totalMemory = parseMemoryQuantity(node.status?.capacity?.memory || '0');

  const handlePodHover = (cpu: number, memory: number) => {
    setHoveredPodCPU(cpu);
    setHoveredPodMemory(memory);
  };

  const handlePodHoverEnd = () => {
    setHoveredPodCPU(undefined);
    setHoveredPodMemory(undefined);
  };

  // Separate pods into regular and system pods
  const regularPods = pods.filter(pod => {
    const namespace = pod.metadata.namespace;
    return !namespace.startsWith('kube-') && !namespace.startsWith('openshift-');
  });

  const systemPods = pods.filter(pod => {
    const namespace = pod.metadata.namespace;
    return namespace.startsWith('kube-') || namespace.startsWith('openshift-');
  });

  return (
    <Card
      key={node._key || node.metadata.uid}
      style={{
        width: '100%',
        margin: '0 0 1rem 0',
        padding: 0,
        boxSizing: 'border-box'
      }}
    >
      <CardTitle
        style={{
          width: '100%',
          padding: '1rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: '1px solid #D1D1D1'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span style={{ fontSize: '1rem' }}>
            {node.metadata.name}
          </span>
          <NodeRoles node={node} />
        </div>
        <NodeConditions node={node} />
      </CardTitle>
      <CardBody
        style={{
          width: '100%',
          padding: '1rem',
          boxSizing: 'border-box',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.5rem'
        }}
      >
        {selectedResources.has('cpu') && (
          <EffectiveCPUBar
            totalCPUs={totalCPUs}
            requestedCPUs={requestedCPUs}
            limitedCPUs={limitedCPUs}
            nodeName={node.metadata.name}
            hoveredPodCPU={hoveredPodCPU}
          />
        )}
        {selectedResources.has('memory') && (
          <EffectiveMemoryBar
            totalMemory={totalMemory}
            requestedMemory={requestedMemory}
            limitedMemory={limitedMemory}
            nodeName={node.metadata.name}
            hoveredPodMemory={hoveredPodMemory}
          />
        )}
        {Array.from(selectedResources)
          .filter(resource => resource !== 'cpu' && resource !== 'memory')
          .map(resource => {
            const capacity = node.status?.capacity?.[resource];
            if (!capacity) return null;

            const total = parseGenericResource(capacity);

            // Get usage from resourceUsage
            const resourceData = resourceUsage[resource];
            const requested = resourceData?.requests?.[node.metadata.name] || 0;
            const limited = resourceData?.limits?.[node.metadata.name] || 0;
            const used = Math.max(requested, limited);

            return (
              <GenericResourceBar
                key={resource}
                total={total}
                used={used}
                nodeName={node.metadata.name}
                label={`Effective ${resource.charAt(0).toUpperCase() + resource.slice(1)}`}
                formatValue={(value) => formatGenericResource(value, resource)}
              />
            );
          })}
        <PodsDisplay 
          pods={regularPods} 
          showNames={showPodNames} 
          title="Pods"
          onPodHover={handlePodHover}
          onPodHoverEnd={handlePodHoverEnd}
        />
        <PodsDisplay 
          pods={systemPods} 
          showNames={showPodNames} 
          title="System Pods"
          onPodHover={handlePodHover}
          onPodHoverEnd={handlePodHoverEnd}
        />
      </CardBody>
    </Card>
  );
};

// Compact Node Card Component - shows node as a large square
const CompactNodeCard: React.FC<{
  node: NodeType & { _key?: string };
  requestedCPUs: number;
  limitedCPUs: number;
  requestedMemory: number;
  limitedMemory: number;
  pods: PodType[];
  showPodNames: boolean;
}> = ({ node, requestedCPUs, limitedCPUs, requestedMemory, limitedMemory, pods, showPodNames }) => {
  const totalCPUs = parseCPUQuantity(node.status?.capacity?.cpu || '0');
  const totalMemory = parseMemoryQuantity(node.status?.capacity?.memory || '0');

  // Calculate effective CPU and memory usage
  const effectiveCPUs = Math.max(requestedCPUs, limitedCPUs);
  const effectiveMemory = Math.max(requestedMemory, limitedMemory);

  const cpuPercentage = totalCPUs > 0 ? Math.min((effectiveCPUs / totalCPUs) * 100, 100) : 0;
  const memoryPercentage = totalMemory > 0 ? Math.min((effectiveMemory / totalMemory) * 100, 100) : 0;

  const roles = getNodeRoles(node);

  // Calculate effective CPU and memory for each pod for sizing
  const podsWithResources = pods.map(pod => ({
    pod,
    effectiveCPU: calculatePodEffectiveCPU(pod),
    effectiveMemory: calculatePodEffectiveMemory(pod)
  }));

  const maxEffectiveCPU = Math.max(...podsWithResources.map(p => p.effectiveCPU), 1);
  const maxEffectiveMemory = Math.max(...podsWithResources.map(p => p.effectiveMemory), 1);

  const podsWithScore = podsWithResources.map(({ pod, effectiveCPU, effectiveMemory }) => {
    const normalizedCPU = maxEffectiveCPU > 0 ? effectiveCPU / maxEffectiveCPU : 0;
    const normalizedMemory = maxEffectiveMemory > 0 ? effectiveMemory / maxEffectiveMemory : 0;
    const combinedScore = (normalizedCPU + normalizedMemory) / 2;
    return { pod, effectiveCPU, effectiveMemory, combinedScore };
  });

  podsWithScore.sort((a, b) => b.combinedScore - a.combinedScore);

  const minWidth = showPodNames ? 48 : 12;
  const maxWidth = showPodNames ? 120 : 24;

  return (
    <Card
      style={{
        width: '220px',
        minHeight: '220px',
        cursor: 'default',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: '1rem',
        boxSizing: 'border-box',
        position: 'relative'
      }}
    >
        {/* Node name */}
        <div style={{
          color: 'var(--pf-global--Color--100)',
          fontSize: '0.9rem',
          textAlign: 'center',
          marginBottom: '0.5rem',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          width: '100%'
        }}>
          {node.metadata.name}
        </div>

        {/* Roles */}
        {roles.length > 0 && (
          <div style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: '0.25rem',
            justifyContent: 'center',
            marginBottom: '0.5rem'
          }}>
            {roles.map(role => (
              <span
                key={role}
                style={{
                  backgroundColor: 'var(--pf-global--BackgroundColor--200)',
                  color: 'var(--pf-global--Color--100)',
                  fontSize: '0.65rem',
                  padding: '0.125rem 0.25rem',
                  borderRadius: '3px',
                  border: '1px solid var(--pf-global--BorderColor--100)'
                }}
              >
                {role}
              </span>
            ))}
          </div>
        )}

        {/* Resource usage */}
        <div style={{
          color: 'var(--pf-global--Color--100)',
          fontSize: '0.75rem',
          textAlign: 'center',
          marginBottom: '0.5rem'
        }}>
          <div style={{ marginBottom: '0.25rem' }}>
            <strong>CPU:</strong> {cpuPercentage.toFixed(1)}%
          </div>
          <div style={{ marginBottom: '0.25rem' }}>
            <strong>Memory:</strong> {memoryPercentage.toFixed(1)}%
          </div>
          <div style={{ marginTop: '0.25rem', fontSize: '0.7rem' }}>
            Pods: {pods.length}
          </div>
        </div>

        {/* Pod blocks */}
        {pods.length > 0 && (
          <div style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: '0.15rem',
            justifyContent: 'center',
            alignItems: 'center',
            width: '100%',
            marginTop: '0.5rem'
          }}>
            {podsWithScore.map(({ pod, combinedScore, effectiveCPU, effectiveMemory }) => {
              // Pods with no resource allocation are half size
              if (effectiveCPU === 0 && effectiveMemory === 0) {
                return (
                  <PodBox 
                    key={pod.metadata.uid} 
                    pod={pod} 
                    width={minWidth / 2} 
                    showName={showPodNames}
                  />
                );
              }

              const width = minWidth + combinedScore * (maxWidth - minWidth);
              return (
                <PodBox 
                  key={pod.metadata.uid} 
                  pod={pod} 
                  width={width} 
                  showName={showPodNames}
                />
              );
            })}
          </div>
        )}
    </Card>
  );
};

const isValidNode = (node: any): node is NodeType => {
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

const isValidPod = (pod: any): pod is PodType => {
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

// Get scheduling failure reason from pod conditions
const getSchedulingFailureReason = (pod: PodType): string | null => {
  if (!pod.status?.conditions) return null;

  // Look for PodScheduled condition with status False
  const podScheduledCondition = pod.status.conditions.find(
    condition => condition.type === 'PodScheduled' && condition.status === 'False'
  );

  if (podScheduledCondition) {
    return podScheduledCondition.reason || podScheduledCondition.message || 'Unknown reason';
  }

  return null;
};

// Unschedulable Pod Box Component - small box representing an unschedulable pod
const UnschedulablePodBox: React.FC<{ pod: PodType; width: number; showName: boolean }> = ({ pod, width, showName }) => {
  const [isTooltipVisible, setIsTooltipVisible] = useState(false);

  const effectiveCPU = calculatePodEffectiveCPU(pod);
  const effectiveMemory = calculatePodEffectiveMemory(pod);
  const memoryFormatted = formatMemory(effectiveMemory);
  const reason = getSchedulingFailureReason(pod) || 'No reason available';

  const handleClick = () => {
    setIsTooltipVisible(!isTooltipVisible);
  };

  const podContent = (
    <div style={{ fontSize: '0.8rem' }}>
      <div style={{ display: 'flex', marginBottom: '0.25rem' }}>
        <span style={{ fontWeight: 'bold', minWidth: '80px' }}>Name:</span>
        <span style={{ wordBreak: 'break-word' }}>{pod.metadata.name}</span>
      </div>
      <div style={{ display: 'flex', marginBottom: '0.25rem' }}>
        <span style={{ fontWeight: 'bold', minWidth: '80px' }}>Namespace:</span>
        <span>{pod.metadata.namespace}</span>
      </div>
      <div style={{ display: 'flex', marginBottom: '0.25rem' }}>
        <span style={{ fontWeight: 'bold', minWidth: '80px' }}>Phase:</span>
        <span>{pod.status.phase}</span>
      </div>
      <div style={{ display: 'flex', marginBottom: '0.25rem' }}>
        <span style={{ fontWeight: 'bold', minWidth: '80px' }}>Reason:</span>
        <span style={{ wordBreak: 'break-word' }}>{reason}</span>
      </div>
      <div style={{ display: 'flex', marginBottom: '0.25rem' }}>
        <span style={{ fontWeight: 'bold', minWidth: '80px' }}>CPU:</span>
        <span>{effectiveCPU.toFixed(2)} cores</span>
      </div>
      <div style={{ display: 'flex' }}>
        <span style={{ fontWeight: 'bold', minWidth: '80px' }}>Memory:</span>
        <span>{memoryFormatted.value} {memoryFormatted.unit}</span>
      </div>
    </div>
  );

  return (
    <Popover
      headerContent={<div>Unscheduled Pod Details</div>}
      bodyContent={podContent}
      isVisible={isTooltipVisible}
      shouldClose={() => setIsTooltipVisible(false)}
      position="bottom"
      enableFlip
    >
      <div
        onClick={handleClick}
        style={{
          width: `${width}px`,
          minWidth: showName ? '48px' : undefined,
          height: '24px',
          backgroundColor: '#8A8D90',
          borderRadius: '4px',
          border: '2px dashed #6A6E73',
          cursor: 'pointer',
          flexShrink: 0,
          display: showName ? 'flex' : 'block',
          alignItems: showName ? 'center' : undefined,
          justifyContent: showName ? 'center' : undefined,
          padding: showName ? '0.25rem' : undefined,
          boxSizing: 'border-box',
          overflow: 'hidden'
        }}
      >
        {showName && (
          <span style={{
            color: '#ffffff',
            fontSize: '0.65rem',
            textAlign: 'center',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            width: '100%',
            textShadow: '0 1px 2px rgba(0, 0, 0, 0.5)',
            pointerEvents: 'none'
          }}>
            {pod.metadata.name}
          </span>
        )}
      </div>
    </Popover>
  );
};

// Scheduling Pressure Component
const SchedulingPressure: React.FC<{ pods: PodType[]; showNames: boolean }> = ({ pods, showNames }) => {
  const unscheduledPods = useMemo(() => {
    return pods.filter(pod =>
      isValidPod(pod) &&
      pod.status.phase === 'Pending' &&
      !pod.spec.nodeName
    );
  }, [pods]);

  if (unscheduledPods.length === 0) {
    return (
      <Card style={{ marginBottom: '1rem' }}>
        <CardBody>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Label color="green">Scheduling Pressure: None</Label>
            <span style={{ fontSize: '0.875rem', color: '#6A6E73' }}>
              All pods are scheduled
            </span>
          </div>
        </CardBody>
      </Card>
    );
  }

  // Calculate effective CPU and memory for each pod
  const podsWithResources = unscheduledPods.map(pod => ({
    pod,
    effectiveCPU: calculatePodEffectiveCPU(pod),
    effectiveMemory: calculatePodEffectiveMemory(pod)
  }));

  // Find max values to normalize
  const maxEffectiveCPU = Math.max(...podsWithResources.map(p => p.effectiveCPU), 1);
  const maxEffectiveMemory = Math.max(...podsWithResources.map(p => p.effectiveMemory), 1);

  // Calculate combined resource score (normalized average of CPU and memory)
  const podsWithScore = podsWithResources.map(({ pod, effectiveCPU, effectiveMemory }) => {
    // Normalize both to 0-1 range
    const normalizedCPU = maxEffectiveCPU > 0 ? effectiveCPU / maxEffectiveCPU : 0;
    const normalizedMemory = maxEffectiveMemory > 0 ? effectiveMemory / maxEffectiveMemory : 0;

    // Combined score (average of normalized CPU and memory)
    const combinedScore = (normalizedCPU + normalizedMemory) / 2;

    return { pod, effectiveCPU, effectiveMemory, combinedScore };
  });

  // Sort by combined score (descending)
  podsWithScore.sort((a, b) => b.combinedScore - a.combinedScore);

  // Base width and max width for pod boxes - larger when showing names
  const minWidth = showNames ? 48 : 24;
  const maxWidth = showNames ? 240 : 120;

  return (
    <Card style={{ marginBottom: '1rem' }}>
      <CardTitle style={{ padding: '1rem', borderBottom: '1px solid #D1D1D1' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Label color="red">Scheduling Pressure: {unscheduledPods.length} pod{unscheduledPods.length !== 1 ? 's' : ''} unscheduled</Label>
        </div>
      </CardTitle>
      <CardBody style={{ padding: '1rem' }}>
        <div style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '0.25rem'
        }}>
          {podsWithScore.map(({ pod, combinedScore, effectiveCPU, effectiveMemory }) => {
            // Pods with no resource allocation are half size
            if (effectiveCPU === 0 && effectiveMemory === 0) {
              return (
                <UnschedulablePodBox key={pod.metadata.uid} pod={pod} width={minWidth / 2} showName={showNames} />
              );
            }

            // Calculate width proportionally based on combined score
            const width = minWidth + combinedScore * (maxWidth - minWidth);

            return (
              <UnschedulablePodBox key={pod.metadata.uid} pod={pod} width={width} showName={showNames} />
            );
          })}
        </div>
      </CardBody>
    </Card>
  );
};

// Resource Selector Component - Dropdown Multiselect
const ResourceSelector: React.FC<{
  availableResources: string[];
  selectedResources: Set<string>;
  onResourceToggle: (resource: string) => void;
}> = ({ availableResources, selectedResources, onResourceToggle }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [dropdownPosition, setDropdownPosition] = useState({ top: 0, left: 0, width: 0 });
  const buttonRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Calculate dropdown position and width when opening
  useEffect(() => {
    if (isOpen && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();

      // Calculate width based on longest resource name
      // Create a temporary element to measure text width
      const tempElement = document.createElement('span');
      tempElement.style.visibility = 'hidden';
      tempElement.style.position = 'absolute';
      tempElement.style.fontSize = '0.875rem';
      tempElement.style.padding = '0 1rem';
      document.body.appendChild(tempElement);

      let maxWidth = 200; // minimum width
      availableResources.forEach(resource => {
        const resourceText = resource.charAt(0).toUpperCase() + resource.slice(1);
        tempElement.textContent = resourceText;
        const textWidth = tempElement.offsetWidth;
        // Add space for checkbox (24px) + margin (0.5rem) + padding (2rem total)
        const totalWidth = textWidth + 24 + 16 + 32;
        maxWidth = Math.max(maxWidth, totalWidth);
      });

      document.body.removeChild(tempElement);

      setDropdownPosition({
        top: rect.bottom + window.scrollY + 4,
        left: rect.left + window.scrollX,
        width: maxWidth
      });
    }
  }, [isOpen, availableResources]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        buttonRef.current &&
        buttonRef.current.contains(event.target as Node)
      ) {
        return;
      }
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const selectedCount = selectedResources.size;
  const buttonText = selectedCount === 0
    ? 'Select Resources'
    : `Resources (${selectedCount})`;

  return (
    <>
      <div style={{ display: 'inline-block' }}>
        <Button
          ref={buttonRef}
          variant="control"
          onClick={() => setIsOpen(!isOpen)}
          style={{
            minWidth: '200px',
            textAlign: 'left',
            justifyContent: 'space-between'
          }}
        >
          <span>{buttonText}</span>
          <span style={{ marginLeft: '0.5rem' }}>{isOpen ? '▲' : '▼'}</span>
        </Button>
      </div>
      {isOpen && (
        <div
          ref={dropdownRef}
          className="resource-dropdown"
          style={{
            position: 'fixed',
            top: `${dropdownPosition.top}px`,
            left: `${dropdownPosition.left}px`,
            width: `${dropdownPosition.width}px`,
            maxHeight: '300px',
            overflowY: 'auto',
            overflowX: 'hidden',
            boxShadow: '0 8px 16px rgba(0, 0, 0, 0.15), 0 2px 4px rgba(0, 0, 0, 0.1)',
            borderRadius: 'var(--pf-global--BorderRadius--sm)',
            zIndex: 9999,
            padding: 0,
            border: '1px solid var(--pf-global--BorderColor--100)',
            backgroundColor: '#ffffff'
          }}
        >
          <style>{`
            .pf-theme-dark .resource-dropdown {
              background-color: #1f1f1f !important;
            }
            .pf-theme-dark .resource-dropdown::-webkit-scrollbar-track {
              background: #1f1f1f;
            }
            .resource-dropdown::-webkit-scrollbar {
              width: 12px;
            }
            .resource-dropdown::-webkit-scrollbar-track {
              background: #ffffff;
            }
            .resource-dropdown::-webkit-scrollbar-thumb {
              background: var(--pf-global--BackgroundColor--300);
              border-radius: 6px;
            }
            .resource-dropdown::-webkit-scrollbar-thumb:hover {
              background: var(--pf-global--BackgroundColor--400);
            }
          `}</style>
          {availableResources.map(resource => {
            const isSelected = selectedResources.has(resource);
            return (
              <div
                key={resource}
                style={{
                  padding: '0.5rem 1rem',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  width: '100%',
                  boxSizing: 'border-box',
                  backgroundColor: isSelected ? 'var(--pf-global--active-color--100)' : 'transparent',
                  borderBottom: '1px solid var(--pf-global--BorderColor--100)',
                  color: 'var(--pf-global--Color--100)'
                }}
                onClick={(e) => {
                  // Toggle when clicking anywhere on the row (div, label, or checkbox)
                  const target = e.target as HTMLElement;
                  if (target.tagName !== 'INPUT') {
                    onResourceToggle(resource);
                  }
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = 'var(--pf-global--BackgroundColor--200)';
                }}
                onMouseLeave={(e) => {
                  if (!isSelected) {
                    e.currentTarget.style.backgroundColor = 'transparent';
                  } else {
                    e.currentTarget.style.backgroundColor = 'var(--pf-global--active-color--100)';
                  }
                }}
              >
                <Checkbox
                  id={`resource-${resource}`}
                  isChecked={isSelected}
                  onChange={(checked) => {
                    onResourceToggle(resource);
                  }}
                  style={{ marginRight: '0.5rem', flexShrink: 0 }}
                />
                <label
                  htmlFor={`resource-${resource}`}
                  style={{
                    cursor: 'pointer',
                    flex: 1,
                    fontSize: '0.875rem',
                    fontWeight: 'normal',
                    margin: 0,
                    width: '100%',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    color: 'var(--pf-global--Color--100)'
                  }}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onResourceToggle(resource);
                  }}
                >
                  {resource.charAt(0).toUpperCase() + resource.slice(1)}
                </label>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
};

// Project Selector Component - Dropdown Multiselect for namespaces
const ProjectSelector: React.FC<{
  availableNamespaces: string[];
  selectedNamespaces: Set<string>;
  onNamespaceToggle: (namespace: string) => void;
  onSelectAll: () => void;
  onClearAll: () => void;
}> = ({ availableNamespaces, selectedNamespaces, onNamespaceToggle, onSelectAll, onClearAll }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchValue, setSearchValue] = useState('');
  const [dropdownPosition, setDropdownPosition] = useState({ top: 0, left: 0, width: 0 });
  const buttonRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Filter namespaces based on search
  const filteredNamespaces = useMemo(() => {
    if (!searchValue) return availableNamespaces;
    const lowerSearch = searchValue.toLowerCase();
    return availableNamespaces.filter(ns => ns.toLowerCase().includes(lowerSearch));
  }, [availableNamespaces, searchValue]);

  // Calculate dropdown position and width when opening
  useEffect(() => {
    if (isOpen && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setDropdownPosition({
        top: rect.bottom + window.scrollY + 4,
        left: rect.left + window.scrollX,
        width: Math.max(rect.width, 300)
      });
    }
  }, [isOpen]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        buttonRef.current &&
        buttonRef.current.contains(event.target as Node)
      ) {
        return;
      }
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
        setSearchValue('');
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const selectedCount = selectedNamespaces.size;
  const allSelected = selectedCount === availableNamespaces.length && availableNamespaces.length > 0;
  const buttonText = selectedCount === 0
    ? 'All Projects'
    : allSelected
      ? 'All Projects'
      : `Projects (${selectedCount})`;

  return (
    <>
      <div style={{ display: 'inline-block' }}>
        <Button
          ref={buttonRef}
          variant="control"
          onClick={() => setIsOpen(!isOpen)}
          style={{
            minWidth: '200px',
            textAlign: 'left',
            justifyContent: 'space-between'
          }}
        >
          <span>{buttonText}</span>
          <span style={{ marginLeft: '0.5rem' }}>{isOpen ? '▲' : '▼'}</span>
        </Button>
      </div>
      {isOpen && (
        <div
          ref={dropdownRef}
          className="project-dropdown"
          style={{
            position: 'fixed',
            top: `${dropdownPosition.top}px`,
            left: `${dropdownPosition.left}px`,
            width: `${dropdownPosition.width}px`,
            maxHeight: '400px',
            display: 'flex',
            flexDirection: 'column',
            boxShadow: '0 8px 16px rgba(0, 0, 0, 0.15), 0 2px 4px rgba(0, 0, 0, 0.1)',
            borderRadius: 'var(--pf-global--BorderRadius--sm)',
            zIndex: 9999,
            padding: 0,
            border: '1px solid var(--pf-global--BorderColor--100)',
            backgroundColor: '#ffffff'
          }}
        >
          <style>
            {`
            .pf-theme-dark .project-dropdown {
              background-color: #1f1f1f !important;
            }
            .pf-theme-dark .project-dropdown::-webkit-scrollbar-track,
            .pf-theme-dark .project-dropdown-list::-webkit-scrollbar-track {
              background: #1f1f1f;
            }
            .project-dropdown::-webkit-scrollbar {
              width: 12px;
            }
            .project-dropdown::-webkit-scrollbar-track {
              background: #ffffff;
            }
            .project-dropdown::-webkit-scrollbar-thumb {
              background: var(--pf-global--BackgroundColor--300);
              border-radius: 6px;
            }
            .project-dropdown::-webkit-scrollbar-thumb:hover {
              background: var(--pf-global--BackgroundColor--400);
            }
            .project-dropdown-list::-webkit-scrollbar {
              width: 12px;
            }
            .project-dropdown-list::-webkit-scrollbar-track {
              background: #ffffff;
            }
            .project-dropdown-list::-webkit-scrollbar-thumb {
              background: var(--pf-global--BackgroundColor--300);
              border-radius: 6px;
            }
            .project-dropdown-list::-webkit-scrollbar-thumb:hover {
              background: var(--pf-global--BackgroundColor--400);
            }
          `}
          </style>
          {/* Search input */}
          <div style={{
            padding: '0.5rem',
            borderBottom: '1px solid var(--pf-global--BorderColor--100)',
            backgroundColor: 'transparent'
          }}>
            <SearchInput
              placeholder="Search projects..."
              value={searchValue}
              onChange={(_, value) => setSearchValue(value)}
              onClear={() => setSearchValue('')}
              style={{ width: '100%' }}
            />
          </div>
          {/* Select/Clear all buttons */}
          <div style={{
            display: 'flex',
            gap: '0.5rem',
            padding: '0.5rem',
            borderBottom: '1px solid var(--pf-global--BorderColor--100)',
            backgroundColor: 'transparent'
          }}>
            <Button
              variant="link"
              onClick={onSelectAll}
              style={{ padding: '0.25rem 0.5rem', fontSize: '0.875rem' }}
            >
              Select All
            </Button>
            <Button
              variant="link"
              onClick={onClearAll}
              style={{ padding: '0.25rem 0.5rem', fontSize: '0.875rem' }}
            >
              Clear All
            </Button>
          </div>
          {/* Namespace list */}
          <div
            className="project-dropdown-list"
            style={{
              overflowY: 'auto',
              overflowX: 'hidden',
              flex: 1
            }}
          >
            {filteredNamespaces.length === 0 ? (
              <div style={{
                padding: '1rem',
                textAlign: 'center',
                color: 'var(--pf-global--Color--100)',
                fontSize: '0.875rem'
              }}>
                No projects found
              </div>
            ) : (
              filteredNamespaces.map(namespace => {
                const isSelected = selectedNamespaces.has(namespace);
                return (
                  <div
                    key={namespace}
                    style={{
                      padding: '0.5rem 1rem',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      width: '100%',
                      boxSizing: 'border-box',
                      backgroundColor: isSelected ? 'var(--pf-global--active-color--100)' : 'transparent',
                      borderBottom: '1px solid var(--pf-global--BorderColor--100)',
                      color: 'var(--pf-global--Color--100)'
                    }}
                    onClick={(e) => {
                      const target = e.target as HTMLElement;
                      if (target.tagName !== 'INPUT') {
                        onNamespaceToggle(namespace);
                      }
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = 'var(--pf-global--BackgroundColor--200)';
                    }}
                    onMouseLeave={(e) => {
                      if (!isSelected) {
                        e.currentTarget.style.backgroundColor = 'transparent';
                      } else {
                        e.currentTarget.style.backgroundColor = 'var(--pf-global--active-color--100)';
                      }
                    }}
                  >
                    <Checkbox
                      id={`namespace-${namespace}`}
                      isChecked={isSelected}
                      onChange={() => {
                        onNamespaceToggle(namespace);
                      }}
                      style={{ marginRight: '0.5rem', flexShrink: 0 }}
                    />
                    <label
                      htmlFor={`namespace-${namespace}`}
                      style={{
                        cursor: 'pointer',
                        flex: 1,
                        fontSize: '0.875rem',
                        fontWeight: 'normal',
                        margin: 0,
                        width: '100%',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        color: 'var(--pf-global--Color--100)'
                      }}
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        onNamespaceToggle(namespace);
                      }}
                    >
                      {namespace}
                    </label>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </>
  );
};

const SchedulerPage: React.FC = () => {
  const [nodes, nodesLoaded, nodesError] = useK8sWatchResource<NodeType[]>({
    kind: 'Node',
    isList: true,
    namespaced: false,
  });

  const [pods] = useK8sWatchResource<PodType[]>({
    kind: 'Pod',
    isList: true,
    namespaced: false,
  });

  const [namespaces] = useK8sWatchResource<NamespaceType[]>({
    kind: 'Namespace',
    isList: true,
    namespaced: false,
  });

  // Default to showing CPU and Memory
  const [selectedResources, setSelectedResources] = useState<Set<string>>(
    new Set(['cpu', 'memory'])
  );

  // Default to showing all namespaces
  const [selectedNamespaces, setSelectedNamespaces] = useState<Set<string>>(new Set());

  // Option to hide nodes without workloads
  const [hideEmptyNodes, setHideEmptyNodes] = useState<boolean>(false);

  // Option to show pod names
  const [showPodNames, setShowPodNames] = useState<boolean>(false);

  // Option to show compact view
  const [compactView, setCompactView] = useState<boolean>(false);

  const validNodes = useMemo(() => {
    if (!nodes || !Array.isArray(nodes)) return [];
    return nodes.filter(isValidNode).map((node, index) => ({
      ...node,
      _key: `node-${node.metadata.uid}-${index}`
    }));
  }, [nodes]);

  // Discover available capacity resources from nodes
  const availableResources = useMemo(() => {
    const resources = new Set<string>();
    if (!nodes || !Array.isArray(nodes)) return Array.from(resources);

    nodes.forEach(node => {
      if (node.status?.capacity) {
        Object.keys(node.status.capacity).forEach(resource => {
          resources.add(resource);
        });
      }
    });

    // Sort resources: cpu and memory first, then others alphabetically
    const sorted = Array.from(resources).sort((a, b) => {
      if (a === 'cpu') return -1;
      if (b === 'cpu') return 1;
      if (a === 'memory') return -1;
      if (b === 'memory') return 1;
      return a.localeCompare(b);
    });

    return sorted;
  }, [nodes]);

  const handleResourceToggle = (resource: string) => {
    setSelectedResources(prev => {
      const newSet = new Set(prev);
      if (newSet.has(resource)) {
        newSet.delete(resource);
      } else {
        newSet.add(resource);
      }
      return newSet;
    });
  };

  // Get list of available namespaces
  const availableNamespaces = useMemo(() => {
    if (!namespaces || !Array.isArray(namespaces)) return [];
    return namespaces
      .map(ns => ns.metadata.name)
      .sort((a, b) => a.localeCompare(b));
  }, [namespaces]);

  const handleNamespaceToggle = (namespace: string) => {
    setSelectedNamespaces(prev => {
      const newSet = new Set(prev);
      if (newSet.has(namespace)) {
        newSet.delete(namespace);
      } else {
        newSet.add(namespace);
      }
      return newSet;
    });
  };

  const handleSelectAllNamespaces = () => {
    setSelectedNamespaces(new Set(availableNamespaces));
  };

  const handleClearAllNamespaces = () => {
    setSelectedNamespaces(new Set());
  };

  // Filter pods based on selected namespaces
  const filteredPods = useMemo(() => {
    if (!pods || !Array.isArray(pods)) return [];
    // If no namespaces selected, show all pods
    if (selectedNamespaces.size === 0) return pods;
    // Otherwise, filter by selected namespaces
    return pods.filter(pod => selectedNamespaces.has(pod.metadata.namespace));
  }, [pods, selectedNamespaces]);

  // Calculate resource requests and limits per node for all resources
  const nodeResourceUsage = useMemo(() => {
    // Structure: { resourceName: { requests: { nodeName: value }, limits: { nodeName: value } } }
    const resourceUsage: { [resourceName: string]: { requests: { [nodeName: string]: number }, limits: { [nodeName: string]: number } } } = {};

    if (!filteredPods || !Array.isArray(filteredPods)) {
      return resourceUsage;
    }

    filteredPods.filter(isValidPod).forEach(pod => {
      const nodeName = pod.spec.nodeName;
      if (!nodeName) return;

      // Process all resources from all containers in the pod
      pod.spec.containers.forEach(container => {
        // Process requests
        if (container.resources?.requests) {
          Object.keys(container.resources.requests).forEach(resourceName => {
            const resourceValue = container.resources.requests![resourceName];
            if (!resourceValue) return;

            if (!resourceUsage[resourceName]) {
              resourceUsage[resourceName] = { requests: {}, limits: {} };
            }
            if (!resourceUsage[resourceName].requests[nodeName]) {
              resourceUsage[resourceName].requests[nodeName] = 0;
            }

            // Parse based on resource type
            let parsedValue = 0;
            if (resourceName === 'cpu') {
              parsedValue = parseCPUQuantity(resourceValue);
            } else if (resourceName === 'memory') {
              parsedValue = parseMemoryQuantity(resourceValue);
            } else {
              parsedValue = parseGenericResource(resourceValue);
            }

            resourceUsage[resourceName].requests[nodeName] += parsedValue;
          });
        }

        // Process limits
        if (container.resources?.limits) {
          Object.keys(container.resources.limits).forEach(resourceName => {
            const resourceValue = container.resources.limits![resourceName];
            if (!resourceValue) return;

            if (!resourceUsage[resourceName]) {
              resourceUsage[resourceName] = { requests: {}, limits: {} };
            }
            if (!resourceUsage[resourceName].limits[nodeName]) {
              resourceUsage[resourceName].limits[nodeName] = 0;
            }

            // Parse based on resource type
            let parsedValue = 0;
            if (resourceName === 'cpu') {
              parsedValue = parseCPUQuantity(resourceValue);
            } else if (resourceName === 'memory') {
              parsedValue = parseMemoryQuantity(resourceValue);
            } else {
              parsedValue = parseGenericResource(resourceValue);
            }

            resourceUsage[resourceName].limits[nodeName] += parsedValue;
          });
        }
      });
    });

    return resourceUsage;
  }, [filteredPods]);

  // Group pods by node name
  const podsByNode = useMemo(() => {
    const grouped: { [nodeName: string]: PodType[] } = {};

    if (!filteredPods || !Array.isArray(filteredPods)) return grouped;

    filteredPods.filter(isValidPod).forEach(pod => {
      const nodeName = pod.spec.nodeName;
      if (!nodeName) return;

      if (!grouped[nodeName]) {
        grouped[nodeName] = [];
      }
      grouped[nodeName].push(pod);
    });

    return grouped;
  }, [filteredPods]);

  // Filter nodes to only show those with workloads if hideEmptyNodes is enabled
  const displayNodes = useMemo(() => {
    if (!hideEmptyNodes) return validNodes;
    return validNodes.filter(node => {
      const nodePods = podsByNode[node.metadata.name];
      return nodePods && nodePods.length > 0;
    });
  }, [validNodes, hideEmptyNodes, podsByNode]);

  // Group nodes by their roles for compact view
  const nodesByRole = useMemo(() => {
    const groups: { [roleKey: string]: { roles: string[], nodes: (NodeType & { _key?: string })[] } } = {};

    displayNodes.forEach(node => {
      const roles = getNodeRoles(node);
      const roleKey = roles.length > 0 ? roles.sort().join(',') : 'no-role';

      if (!groups[roleKey]) {
        groups[roleKey] = {
          roles: roles.length > 0 ? roles : [],
          nodes: []
        };
      }
      groups[roleKey].nodes.push(node);
    });

    // Sort groups: master first, then workers, then others alphabetically
    const sortedGroups = Object.entries(groups).sort(([keyA, groupA], [keyB, groupB]) => {
      const rolesA = groupA.roles;
      const rolesB = groupB.roles;

      // Check if either group contains 'master' or 'control-plane'
      const aIsMaster = rolesA.some(r => r === 'master' || r === 'control-plane');
      const bIsMaster = rolesB.some(r => r === 'master' || r === 'control-plane');

      if (aIsMaster && !bIsMaster) return -1;
      if (!aIsMaster && bIsMaster) return 1;

      // Check if either group is 'worker'
      const aIsWorker = rolesA.length === 1 && rolesA[0] === 'worker';
      const bIsWorker = rolesB.length === 1 && rolesB[0] === 'worker';

      if (aIsWorker && !bIsWorker) return -1;
      if (!aIsWorker && bIsWorker) return 1;

      // Otherwise sort alphabetically
      return keyA.localeCompare(keyB);
    });

    return sortedGroups;
  }, [displayNodes]);

  if (nodesError) {
    console.error('Error loading nodes', nodesError);
    return <div>Error loading nodes</div>;
  }

  return (
    <div style={{
      width: '100%',
      height: 'calc(100vh - 64px)',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden'
    }}>
      <div style={{
        width: '100%',
        padding: '1rem',
        boxSizing: 'border-box',
        position: 'sticky',
        top: 0,
        zIndex: 100,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '1rem',
        flexWrap: 'wrap'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Title headingLevel="h1" style={{
            margin: 0,
            flex: '0 0 auto'
          }}>
            Cluster Scheduler Overview
          </Title>
          <Label color="orange" style={{ color: 'white' }}>
            Experimental
          </Label>
        </div>
        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
          {nodesLoaded && availableNamespaces.length > 0 && (
            <ProjectSelector
              availableNamespaces={availableNamespaces}
              selectedNamespaces={selectedNamespaces}
              onNamespaceToggle={handleNamespaceToggle}
              onSelectAll={handleSelectAllNamespaces}
              onClearAll={handleClearAllNamespaces}
            />
          )}
          {nodesLoaded && availableResources.length > 0 && (
            <ResourceSelector
              availableResources={availableResources}
              selectedResources={selectedResources}
              onResourceToggle={handleResourceToggle}
            />
          )}
          {nodesLoaded && (
            <>
              <Checkbox
                id="hide-empty-nodes"
                label="Only show nodes with workloads"
                isChecked={hideEmptyNodes}
                onChange={(_, checked) => setHideEmptyNodes(checked)}
              />
              <Checkbox
                id="show-pod-names"
                label="Show pod names"
                isChecked={showPodNames}
                onChange={(_, checked) => setShowPodNames(checked)}
              />
              <Checkbox
                id="compact-view"
                label="Compact view"
                isChecked={compactView}
                onChange={(_, checked) => setCompactView(checked)}
              />
            </>
          )}
        </div>
      </div>
      <div style={{
        flexGrow: 1,
        width: '100%',
        overflowY: 'auto',
        overflowX: 'hidden',
        paddingRight: '1rem',
        paddingLeft: '1rem',
        paddingBottom: '1rem',
        boxSizing: 'border-box'
      }}>
        <Suspense fallback={<Spinner />}>
          {!nodesLoaded ? (
            <Spinner />
          ) : (
            <>
              <SchedulingPressure pods={filteredPods || []} showNames={showPodNames} />
              {compactView ? (
                <>
                  {nodesByRole.map(([roleKey, group]) => (
                    <div key={roleKey} style={{ marginBottom: '2rem', width: '100%' }}>
                      {/* Role header */}
                      <div style={{
                        fontSize: '1.2rem',
                        marginBottom: '1rem',
                        paddingBottom: '0.5rem',
                        borderBottom: '2px solid #D1D1D1',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem'
                      }}>
                        {group.roles.length > 0 ? (
                          <>
                            <span>
                              {group.roles.map(role => role.charAt(0).toUpperCase() + role.slice(1)).join(', ')}
                            </span>
                            <span style={{ fontSize: '0.9rem', color: '#6A6E73', fontWeight: 'normal' }}>
                              ({group.nodes.length} node{group.nodes.length !== 1 ? 's' : ''})
                            </span>
                          </>
                        ) : (
                          <>
                            <span>No Role</span>
                            <span style={{ fontSize: '0.9rem', color: '#6A6E73', fontWeight: 'normal' }}>
                              ({group.nodes.length} node{group.nodes.length !== 1 ? 's' : ''})
                            </span>
                          </>
                        )}
                      </div>
                      {/* Nodes grid */}
                      <div style={{
                        display: 'flex',
                        flexWrap: 'wrap',
                        gap: '1rem',
                        justifyContent: 'flex-start',
                        alignItems: 'flex-start'
                      }}>
                        {group.nodes.map((node) => {
                          const cpuData = nodeResourceUsage['cpu'];
                          const memoryData = nodeResourceUsage['memory'];

                          return (
                            <CompactNodeCard
                              key={node._key}
                              node={node}
                              requestedCPUs={cpuData?.requests?.[node.metadata.name] || 0}
                              limitedCPUs={cpuData?.limits?.[node.metadata.name] || 0}
                              requestedMemory={memoryData?.requests?.[node.metadata.name] || 0}
                              limitedMemory={memoryData?.limits?.[node.metadata.name] || 0}
                              pods={podsByNode[node.metadata.name] || []}
                              showPodNames={showPodNames}
                            />
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </>
              ) : (
                <>
                  {displayNodes.map((node) => {
                    // Get CPU and Memory usage (for backward compatibility)
                    const cpuData = nodeResourceUsage['cpu'];
                    const memoryData = nodeResourceUsage['memory'];

                    return (
                      <NodeCard
                        key={node._key}
                        node={node}
                        requestedCPUs={cpuData?.requests?.[node.metadata.name] || 0}
                        limitedCPUs={cpuData?.limits?.[node.metadata.name] || 0}
                        requestedMemory={memoryData?.requests?.[node.metadata.name] || 0}
                        limitedMemory={memoryData?.limits?.[node.metadata.name] || 0}
                        pods={podsByNode[node.metadata.name] || []}
                        selectedResources={selectedResources}
                        resourceUsage={nodeResourceUsage}
                        showPodNames={showPodNames}
                      />
                    );
                  })}
                </>
              )}
            </>
          )}
        </Suspense>
      </div>
    </div>
  );
};

export default SchedulerPage;