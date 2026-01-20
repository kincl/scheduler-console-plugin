import React, { useMemo, Suspense } from 'react';
import {
  Title,
  Card,
  CardTitle,
  CardBody,
  Spinner,
  Label,
  Alert,
  Tooltip,
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
  };
  status: {
    capacity: {
      cpu: string;
      memory: string;
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
          cpu?: string;
          memory?: string;
        };
        limits?: {
          cpu?: string;
          memory?: string;
        };
      };
    }>;
  };
  status: {
    phase: string;
    conditions?: PodCondition[];
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

// Single CPU Bar Component
const SingleCPUBar: React.FC<{
  totalCPUs: number;
  usedCPUs: number;
  nodeName: string;
  label: string;
  barColor: string;
}> = ({ totalCPUs, usedCPUs, nodeName, label, barColor }) => {
  const percentageUsed = totalCPUs > 0 ? Math.min((usedCPUs / totalCPUs) * 100, 100) : 0;

  return (
    <div style={{ width: '100%' }}>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '0.25rem'
      }}>
        <span style={{ fontSize: '0.7rem', fontWeight: 500 }}>{label}</span>
        <span style={{ fontSize: '0.7rem', color: '#6A6E73' }}>
          {usedCPUs.toFixed(2)} / {totalCPUs.toFixed(2)} cores
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
            backgroundColor: barColor,
            transition: 'width 0.3s ease, background-color 0.3s ease'
          }}
          title={`${nodeName}: ${usedCPUs.toFixed(2)} of ${totalCPUs.toFixed(2)} CPUs ${label.toLowerCase()}`}
        />
      </div>
    </div>
  );
};

// Single Memory Bar Component
const SingleMemoryBar: React.FC<{
  totalMemory: number;
  usedMemory: number;
  nodeName: string;
  label: string;
  barColor: string;
}> = ({ totalMemory, usedMemory, nodeName, label, barColor }) => {
  const percentageUsed = totalMemory > 0 ? Math.min((usedMemory / totalMemory) * 100, 100) : 0;
  const usedFormatted = formatMemory(usedMemory);
  const totalFormatted = formatMemory(totalMemory);

  return (
    <div style={{ width: '100%' }}>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '0.25rem'
      }}>
        <span style={{ fontSize: '0.7rem', fontWeight: 500 }}>{label}</span>
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
            backgroundColor: barColor,
            transition: 'width 0.3s ease, background-color 0.3s ease'
          }}
          title={`${nodeName}: ${usedFormatted.value} ${usedFormatted.unit} of ${totalFormatted.value} ${totalFormatted.unit} ${label.toLowerCase()}`}
        />
      </div>
    </div>
  );
};

// Effective CPU Bar Component (max of requests and limits)
const EffectiveCPUBar: React.FC<{
  totalCPUs: number;
  requestedCPUs: number;
  limitedCPUs: number;
  nodeName: string;
}> = ({ totalCPUs, requestedCPUs, limitedCPUs, nodeName }) => {
  // Effective CPU is the maximum of requests and limits
  const effectiveCPUs = Math.max(requestedCPUs, limitedCPUs);
  const percentageUsed = totalCPUs > 0 ? Math.min((effectiveCPUs / totalCPUs) * 100, 100) : 0;

  // Color based on utilization
  const getBarColor = () => {
    if (percentageUsed < 70) return '#3E8635'; // green
    if (percentageUsed < 90) return '#F0AB00'; // orange/warning
    return '#C9190B'; // red/danger
  };

  return (
    <SingleCPUBar
      totalCPUs={totalCPUs}
      usedCPUs={effectiveCPUs}
      nodeName={nodeName}
      label="Effective CPU"
      barColor={getBarColor()}
    />
  );
};

// Effective Memory Bar Component (max of requests and limits)
const EffectiveMemoryBar: React.FC<{
  totalMemory: number;
  requestedMemory: number;
  limitedMemory: number;
  nodeName: string;
}> = ({ totalMemory, requestedMemory, limitedMemory, nodeName }) => {
  // Effective Memory is the maximum of requests and limits
  const effectiveMemory = Math.max(requestedMemory, limitedMemory);
  const percentageUsed = totalMemory > 0 ? Math.min((effectiveMemory / totalMemory) * 100, 100) : 0;

  // Color based on utilization
  const getBarColor = () => {
    if (percentageUsed < 70) return '#3E8635'; // green
    if (percentageUsed < 90) return '#F0AB00'; // orange/warning
    return '#C9190B'; // red/danger
  };

  return (
    <SingleMemoryBar
      totalMemory={totalMemory}
      usedMemory={effectiveMemory}
      nodeName={nodeName}
      label="Effective Memory"
      barColor={getBarColor()}
    />
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
const PodBox: React.FC<{ pod: PodType; width: number }> = ({ pod, width }) => {
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

  const podTooltip = (
    <div style={{ whiteSpace: 'pre-line', fontSize: '0.875rem' }}>
      <strong>Name:</strong> {pod.metadata.name}
      <br />
      <strong>Namespace:</strong> {pod.metadata.namespace}
      <br />
      <strong>Phase:</strong> {pod.status.phase}
      <br />
      <strong>Effective CPU:</strong> {effectiveCPU.toFixed(2)} cores
      <br />
      <strong>Effective Memory:</strong> {memoryFormatted.value} {memoryFormatted.unit}
    </div>
  );

  return (
    <Tooltip content={podTooltip}>
      <div
        style={{
          width: `${width}px`,
          minWidth: '24px',
          height: '24px',
          backgroundColor: getPhaseColor(pod.status.phase),
          borderRadius: '4px',
          border: '1px solid #D1D1D1',
          cursor: 'help',
          flexShrink: 0
        }}
        title={`${pod.metadata.namespace}/${pod.metadata.name}`}
      />
    </Tooltip>
  );
};

// Pods Display Component - shows all pods for a node
const PodsDisplay: React.FC<{ pods: PodType[] }> = ({ pods }) => {
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
  
  // Base width and max width for pod boxes
  const minWidth = 24;
  const maxWidth = 120;

  return (
    <div style={{
      marginTop: '0.75rem',
      paddingTop: '0.75rem',
      borderTop: '1px solid #D1D1D1'
    }}>
      <div style={{
        fontSize: '0.7rem',
        fontWeight: 500,
        marginBottom: '0.5rem',
        color: '#6A6E73'
      }}>
        Pods ({pods.length})
      </div>
      <div style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: '0.25rem'
      }}>
        {podsWithScore.map(({ pod, combinedScore }) => {
          // Calculate width proportionally based on combined score (min 24px, max 120px)
          const width = minWidth + combinedScore * (maxWidth - minWidth);

          return (
            <PodBox key={pod.metadata.uid} pod={pod} width={width} />
          );
        })}
      </div>
    </div>
  );
};

const NodeCard: React.FC<{ 
  node: NodeType & { _key?: string };
  requestedCPUs: number;
  limitedCPUs: number;
  requestedMemory: number;
  limitedMemory: number;
  pods: PodType[];
}> = ({ node, requestedCPUs, limitedCPUs, requestedMemory, limitedMemory, pods }) => {
  const totalCPUs = parseCPUQuantity(node.status?.capacity?.cpu || '0');
  const totalMemory = parseMemoryQuantity(node.status?.capacity?.memory || '0');

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
        <span style={{ fontWeight: 'bold', fontSize: '1rem' }}>
          {node.metadata.name}
        </span>
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
        <EffectiveCPUBar
          totalCPUs={totalCPUs}
          requestedCPUs={requestedCPUs}
          limitedCPUs={limitedCPUs}
          nodeName={node.metadata.name}
        />
        <EffectiveMemoryBar
          totalMemory={totalMemory}
          requestedMemory={requestedMemory}
          limitedMemory={limitedMemory}
          nodeName={node.metadata.name}
        />
        <PodsDisplay pods={pods} />
      </CardBody>
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
    typeof node.status.capacity.cpu === 'string' &&
    typeof node.status.capacity.memory === 'string'
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

// Scheduling Pressure Component
const SchedulingPressure: React.FC<{ pods: PodType[] }> = ({ pods }) => {
  const unscheduledPods = useMemo(() => {
    return pods.filter(pod => 
      isValidPod(pod) &&
      pod.status.phase === 'Pending' &&
      !pod.spec.nodeName
    );
  }, [pods]);

  const podsWithReasons = useMemo(() => {
    return unscheduledPods.map(pod => ({
      name: pod.metadata.name,
      namespace: pod.metadata.namespace,
      reason: getSchedulingFailureReason(pod) || 'No reason available'
    }));
  }, [unscheduledPods]);

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

  return (
    <Card style={{ marginBottom: '1rem' }}>
      <CardTitle style={{ padding: '1rem', borderBottom: '1px solid #D1D1D1' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Label color="red">Scheduling Pressure: {unscheduledPods.length} pod{unscheduledPods.length !== 1 ? 's' : ''} unscheduled</Label>
        </div>
      </CardTitle>
      <CardBody style={{ padding: '1rem' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {podsWithReasons.map((pod, index) => (
            <Alert
              key={`${pod.namespace}-${pod.name}-${index}`}
              variant="warning"
              title={`${pod.namespace}/${pod.name}`}
              style={{ marginBottom: 0 }}
            >
              <div style={{ fontSize: '0.875rem' }}>
                <strong>Reason:</strong> {pod.reason}
              </div>
            </Alert>
          ))}
        </div>
      </CardBody>
    </Card>
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

  const validNodes = useMemo(() => {
    if (!nodes || !Array.isArray(nodes)) return [];
    return nodes.filter(isValidNode).map((node, index) => ({
      ...node,
      _key: `node-${node.metadata.uid}-${index}`
    }));
  }, [nodes]);

  // Calculate CPU and Memory requests and limits per node
  const nodeResourceUsage = useMemo(() => {
    const cpuRequests: { [nodeName: string]: number } = {};
    const cpuLimits: { [nodeName: string]: number } = {};
    const memoryRequests: { [nodeName: string]: number } = {};
    const memoryLimits: { [nodeName: string]: number } = {};

    if (!pods || !Array.isArray(pods)) {
      return { cpuRequests, cpuLimits, memoryRequests, memoryLimits };
    }

    pods.filter(isValidPod).forEach(pod => {
      const nodeName = pod.spec.nodeName;
      if (!nodeName) return;

      // Sum CPU and Memory requests and limits from all containers in the pod
      const podCPURequest = pod.spec.containers.reduce((sum, container) => {
        const cpuRequest = container.resources?.requests?.cpu || '0';
        return sum + parseCPUQuantity(cpuRequest);
      }, 0);

      const podCPULimit = pod.spec.containers.reduce((sum, container) => {
        const cpuLimit = container.resources?.limits?.cpu || '0';
        return sum + parseCPUQuantity(cpuLimit);
      }, 0);

      const podMemoryRequest = pod.spec.containers.reduce((sum, container) => {
        const memoryRequest = container.resources?.requests?.memory || '0';
        return sum + parseMemoryQuantity(memoryRequest);
      }, 0);

      const podMemoryLimit = pod.spec.containers.reduce((sum, container) => {
        const memoryLimit = container.resources?.limits?.memory || '0';
        return sum + parseMemoryQuantity(memoryLimit);
      }, 0);

      cpuRequests[nodeName] = (cpuRequests[nodeName] || 0) + podCPURequest;
      cpuLimits[nodeName] = (cpuLimits[nodeName] || 0) + podCPULimit;
      memoryRequests[nodeName] = (memoryRequests[nodeName] || 0) + podMemoryRequest;
      memoryLimits[nodeName] = (memoryLimits[nodeName] || 0) + podMemoryLimit;
    });

    return { cpuRequests, cpuLimits, memoryRequests, memoryLimits };
  }, [pods]);

  // Group pods by node name
  const podsByNode = useMemo(() => {
    const grouped: { [nodeName: string]: PodType[] } = {};

    if (!pods || !Array.isArray(pods)) return grouped;

    pods.filter(isValidPod).forEach(pod => {
      const nodeName = pod.spec.nodeName;
      if (!nodeName) return;

      if (!grouped[nodeName]) {
        grouped[nodeName] = [];
      }
      grouped[nodeName].push(pod);
    });

    return grouped;
  }, [pods]);

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
        boxSizing: 'border-box'
      }}>
        <Title headingLevel="h1" style={{
          marginBottom: '1rem',
          width: '100%'
        }}>
          Cluster Scheduler Overview
        </Title>
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
              <SchedulingPressure pods={pods || []} />
              {validNodes.map((node) => (
                <NodeCard
                  key={node._key}
                  node={node}
                  requestedCPUs={nodeResourceUsage.cpuRequests[node.metadata.name] || 0}
                  limitedCPUs={nodeResourceUsage.cpuLimits[node.metadata.name] || 0}
                  requestedMemory={nodeResourceUsage.memoryRequests[node.metadata.name] || 0}
                  limitedMemory={nodeResourceUsage.memoryLimits[node.metadata.name] || 0}
                  pods={podsByNode[node.metadata.name] || []}
                />
              ))}
            </>
          )}
        </Suspense>
      </div>
    </div>
  );
};

export default SchedulerPage;