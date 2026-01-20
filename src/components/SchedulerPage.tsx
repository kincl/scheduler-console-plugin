import React, { useMemo, Suspense } from 'react';
import {
  Title,
  Card,
  CardTitle,
  CardBody,
  Flex,
  FlexItem,
  Label,
  Progress,
  ProgressVariant,
  Spinner,
  Tooltip,
} from '@patternfly/react-core';
import { useK8sWatchResource } from '@openshift-console/dynamic-plugin-sdk';

interface NodeCondition {
  type: string;
  status: string;
  reason?: string;
  message?: string;
}

interface NodeType {
  metadata: {
    name: string;
    uid: string;
  };
  status: {
    allocatable: {
      cpu: string;
      memory: string;
    };
    capacity: {
      cpu: string;
      memory: string;
    };
    conditions?: NodeCondition[];
  };
}

interface PodType {
  metadata: {
    name: string;
    uid: string;
    namespace: string;
  };
  spec: {
    nodeName: string;
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
  };
}

const parseResourceQuantity = (quantity: string, resourceType: 'cpu' | 'memory' = 'memory'): number => {
  if (!quantity) return 0;

  // Normalize CPU to millicores
  if (resourceType === 'cpu') {
    const cpuMatch = quantity.match(/^(\d+)([m])?$/);
    if (cpuMatch) {
      const [, value, suffix] = cpuMatch;
      return suffix === 'm' ? parseFloat(value) : parseFloat(value) * 1000;
    }
    return parseFloat(quantity) * 1000;
  }

  // Normalize memory to bytes
  const units: {[key: string]: number} = {
    'Ki': 1024,
    'Mi': 1024 * 1024,
    'Gi': 1024 * 1024 * 1024,
    'Ti': 1024 * 1024 * 1024 * 1024,
    'Pi': 1024 * 1024 * 1024 * 1024 * 1024,
    'Ei': 1024 * 1024 * 1024 * 1024 * 1024 * 1024
  };

  const match = quantity.match(/^(\d+)([KMGTPE]i)?$/);
  if (match) {
    const [, value, unit] = match;
    return unit ? parseFloat(value) * units[unit] : parseFloat(value);
  }

  // If no unit, assume it's bytes
  return parseFloat(quantity);
};

const formatMemory = (bytes: number, totalQuantity?: string): { value: string, unit: string } => {
  const gib = bytes / (1024 * 1024 * 1024);

  // If total quantity is provided, try to match its unit
  if (totalQuantity) {
    const totalMatch = totalQuantity.match(/(\d+)([KMGTPE]i)?$/);
    if (totalMatch) {
      const [, , unit] = totalMatch;
      if (unit) {
        // If total is in Ki, convert to GiB
        if (unit === 'Ki') {
          const totalBytes = parseResourceQuantity(totalQuantity);
          return { value: ((totalBytes / (1024 * 1024 * 1024)) > 0 ? gib : 0).toFixed(2), unit: 'GiB' };
        }
      }
    }
  }

  return { value: gib.toFixed(2), unit: 'GiB' };
};

const ResourceProgress: React.FC<{
  total: string;
  used: number;
  label: string;
  resourceType: 'millicores' | 'bytes';
}> = ({ total, used, label, resourceType }) => {
  const totalValue = parseResourceQuantity(total, label.includes('CPU') ? 'cpu' : 'memory');
  const percentageUsed = totalValue > 0 ? Math.min((used / totalValue) * 100, 100) : 0;

  const getVariant = () => {
    if (percentageUsed < 70) return ProgressVariant.success;
    if (percentageUsed < 90) return ProgressVariant.warning;
    return ProgressVariant.danger;
  };

  // Format for display based on resourceType
  const formattedUsed = resourceType === 'millicores'
    ? `${(used / 1000).toFixed(2)} cores`
    : formatMemory(used, total);

  // Remove redundant 'Usage' from label
  const cleanLabel = label.replace(' Usage', '');

  // Ensure formattedUsed is an object for non-millicores case
  const displayUsed = typeof formattedUsed === 'string'
    ? formattedUsed
    : formattedUsed.value;
  const displayUnit = typeof formattedUsed === 'string'
    ? ''
    : formattedUsed.unit;

  const totalFormatted = formatMemory(parseResourceQuantity(total), total);

  return (
    <Flex direction={{ default: 'column' }}>
      <FlexItem>
        <Label color="blue">{cleanLabel}</Label>
      </FlexItem>
      <FlexItem>
        <Progress
          value={percentageUsed}
          title={`${cleanLabel} Utilization`}
          label={resourceType === 'millicores'
            ? `${formattedUsed} / ${total}`
            : `${displayUsed} ${displayUnit} / ${totalFormatted.value} ${totalFormatted.unit}`
          }
          variant={getVariant()}
        />
      </FlexItem>
    </Flex>
  );
};

const PodResourceBar: React.FC<{
  requests?: { cpu?: string, memory?: string },
  limits?: { cpu?: string, memory?: string },
  type: 'cpu' | 'memory'
}> = ({ requests, limits, type }) => {
  const parseQuantity = (quantity?: string) => {
    if (!quantity) return 0;
    if (type === 'cpu') {
      // Convert to millicores
      const match = quantity.match(/^(\d+)([m])?$/);
      if (match) {
        const [, value, suffix] = match;
        return suffix === 'm' ? parseFloat(value) : parseFloat(value) * 1000;
      }
      return parseFloat(quantity) * 1000;
    } else {
      // Convert to bytes
      const units: {[key: string]: number} = {
        'Ki': 1024,
        'Mi': 1024 * 1024,
        'Gi': 1024 * 1024 * 1024,
        'Ti': 1024 * 1024 * 1024 * 1024
      };
      const match = quantity.match(/^(\d+)([KMGT]i)?$/);
      if (match) {
        const [, value, unit] = match;
        return unit ? parseFloat(value) * units[unit] : parseFloat(value);
      }
      return parseFloat(quantity);
    }
  };

  const requestValue = parseQuantity(requests?.[type]);
  const limitValue = parseQuantity(limits?.[type]);

  // Ensure total width is 100px
  const totalWidth = 100;
  const requestWidth = limitValue > 0 ? (requestValue / limitValue) * 100 : 0;

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      width: `${totalWidth}px`,
      height: '10px',
      backgroundColor: '#f0f0f0',
      borderRadius: '5px',
      overflow: 'hidden',
      position: 'relative'
    }}>
      {limitValue > 0 && (
        <div
          title={`Limit: ${limits?.[type] || '0'}`}
          style={{
            width: '100%',
            height: '100%',
            backgroundColor: '#c6c6c6',
            position: 'absolute',
            top: 0,
            left: 0,
            zIndex: 1
          }}
        />
      )}
      {requestValue > 0 && (
        <div
          title={`Request: ${requests?.[type] || '0'}`}
          style={{
            width: `${requestWidth}%`,
            height: '100%',
            backgroundColor: type === 'cpu' ? '#3E8635' : '#2B9AF3',
            position: 'absolute',
            top: 0,
            left: 0,
            zIndex: 2
          }}
        />
      )}
    </div>
  );
};

const PodBox: React.FC<{ pod: PodType }> = ({ pod }) => {
  // Aggregate resources from all containers
  const aggregateRequests = pod.spec.containers.reduce((acc, container) => {
    const containerCpu = container.resources?.requests?.cpu || '0';
    const containerMemory = container.resources?.requests?.memory || '0';

    acc.cpu = (acc.cpu || 0) + parseResourceQuantity(containerCpu, 'cpu');
    acc.memory = (acc.memory || 0) + parseResourceQuantity(containerMemory, 'memory');

    return acc;
  }, { cpu: 0, memory: 0 });

  const aggregateLimits = pod.spec.containers.reduce((acc, container) => {
    const containerCpu = container.resources?.limits?.cpu || '0';
    const containerMemory = container.resources?.limits?.memory || '0';

    acc.cpu = (acc.cpu || 0) + parseResourceQuantity(containerCpu, 'cpu');
    acc.memory = (acc.memory || 0) + parseResourceQuantity(containerMemory, 'memory');

    return acc;
  }, { cpu: 0, memory: 0 });

  const podTooltipContent = (
    <div style={{ whiteSpace: 'pre-line' }}>
      <strong>Name:</strong> {pod.metadata.name}
      <br />
      <strong>Namespace:</strong> {pod.metadata.namespace}
      <br />
      <strong>Phase:</strong> {pod.status?.phase}
      <br />
      <strong>CPU Request:</strong> {(aggregateRequests.cpu / 1000).toFixed(2)} cores
      <br />
      <strong>CPU Limit:</strong> {(aggregateLimits.cpu / 1000).toFixed(2)} cores
      <br />
      <strong>Memory Request:</strong> {formatMemory(aggregateRequests.memory).value} {formatMemory(aggregateRequests.memory).unit}
      <br />
      <strong>Memory Limit:</strong> {formatMemory(aggregateLimits.memory).value} {formatMemory(aggregateLimits.memory).unit}
    </div>
  );

  return (
    <Tooltip content={podTooltipContent}>
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '2px',
          padding: '4px',
          border: '1px solid #ddd',
          borderRadius: '4px',
          cursor: 'help',
          width: '120px',
          margin: '2px'
        }}
      >
        <div style={{
          fontSize: '0.6rem',
          color: '#666',
          textAlign: 'center',
          width: '100%',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis'
        }}>
          {pod.metadata.name}
        </div>
        <PodResourceBar
          requests={{ cpu: `${aggregateRequests.cpu}m`, memory: `${aggregateRequests.memory}` }}
          limits={{ cpu: `${aggregateLimits.cpu}m`, memory: `${aggregateLimits.memory}` }}
          type="cpu"
        />
        <PodResourceBar
          requests={{ cpu: `${aggregateRequests.cpu}m`, memory: `${aggregateRequests.memory}` }}
          limits={{ cpu: `${aggregateLimits.cpu}m`, memory: `${aggregateLimits.memory}` }}
          type="memory"
        />
      </div>
    </Tooltip>
  );
};

const PodsResourceDisplay: React.FC<{ pods: PodType[] }> = ({ pods }) => {
  return (
    <div style={{
      display: 'flex',
      flexWrap: 'wrap',
      gap: '4px',
      width: '100%',
      padding: '4px',
    }}>
      {pods.map((pod) => (
        <PodBox key={pod.metadata.uid} pod={pod} />
      ))}
    </div>
  );
};

const NodeConditionsDisplay: React.FC<{ node: NodeType }> = ({ node }) => {
  // Define color mapping for condition statuses
  const statusColors = {
    'True': 'green',
    'False': 'red',
    'Unknown': 'orange'
  };

  // Key conditions to display
  const importantConditions = [
    'Ready',
    'MemoryPressure',
    'DiskPressure',
    'PIDPressure',
    'NetworkUnavailable'
  ];

  // Filter and sort conditions
  const displayConditions = (node.status?.conditions || [])
    .filter(condition => importantConditions.includes(condition.type))
    .sort((a, b) => {
      // Prioritize 'Ready' condition
      if (a.type === 'Ready') return -1;
      if (b.type === 'Ready') return 1;
      return a.type.localeCompare(b.type);
    });

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: '0.5rem',
      flexWrap: 'wrap'
    }}>
      {displayConditions.map(condition => (
        <div
          key={condition.type}
          title={condition.message || condition.reason}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.25rem'
          }}
        >
          <div
            style={{
              width: '10px',
              height: '10px',
              borderRadius: '50%',
              backgroundColor: statusColors[condition.status] || 'gray'
            }}
          />
          <span style={{
            fontSize: '0.7rem',
            color: statusColors[condition.status] || 'gray'
          }}>
            {condition.type}
          </span>
        </div>
      ))}
    </div>
  );
};

const NodeResourceDisplay: React.FC<{ node: NodeType }> = ({ node }) => {
  const [pods] = useK8sWatchResource<PodType[]>({
    kind: 'Pod',
    isList: true,
    namespaced: false,
  });

  const filteredPods = useMemo(() => {
    if (!pods || !Array.isArray(pods) || !node?.metadata?.name) return [];
    return (pods || []).filter((pod): pod is PodType =>
      isValidPod(pod) &&
      pod.spec?.nodeName === node.metadata.name &&
      pod.status?.phase !== 'Succeeded' &&
      pod.status?.phase !== 'Failed'
    );
  }, [pods, node?.metadata?.name]);

  // Removed unused podsByNamespace

  const podResources = useMemo(() => {
    return filteredPods.reduce((acc, pod) => {
      pod.spec.containers.forEach(container => {
        if (container.resources?.requests) {
          acc.cpuRequests += parseResourceQuantity(container.resources.requests.cpu || '0', 'cpu');
          acc.memoryRequests += parseResourceQuantity(container.resources.requests.memory || '0', 'memory');
        }
      });
      return acc;
    }, { cpuRequests: 0, memoryRequests: 0 });
  }, [filteredPods]);

  return (
    <Flex>
      <FlexItem style={{ width: '70%', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <ResourceProgress
          total={node.status?.capacity?.cpu || '0'}
          used={podResources.cpuRequests}
          label="CPU Usage"
          resourceType="millicores"
        />
        <ResourceProgress
          total={node.status?.capacity?.memory || '0'}
          used={podResources.memoryRequests}
          label="Memory Usage"
          resourceType="bytes"
        />
      </FlexItem>
      <FlexItem>
        <Flex direction={{ default: 'column' }}>
          <FlexItem>
            <Label color="blue">Pods: {filteredPods.length}</Label>
          </FlexItem>
          <FlexItem>
            <Label color="green">
              CPU Requests: {(podResources.cpuRequests / 1000).toFixed(2)} cores
            </Label>
          </FlexItem>
          <FlexItem>
            <Label color="orange">
              Memory Requests: {formatMemory(podResources.memoryRequests, node.status?.capacity?.memory).value} {formatMemory(podResources.memoryRequests, node.status?.capacity?.memory).unit}
            </Label>
          </FlexItem>
        </Flex>
      </FlexItem>
      <FlexItem>
        <PodsResourceDisplay pods={filteredPods} />
      </FlexItem>
    </Flex>
  );
};

const isValidPod = (pod: any): pod is PodType => {
  return (
    pod &&
    typeof pod === 'object' &&
    pod.spec &&
    pod.spec.containers && Array.isArray(pod.spec.containers) &&
    typeof pod.spec.nodeName === 'string' &&
    pod.metadata &&
    typeof pod.metadata.name === 'string' &&
    typeof pod.metadata.namespace === 'string' &&
    typeof pod.metadata.uid === 'string' &&
    pod.status &&
    typeof pod.status.phase === 'string' &&
    pod.spec.containers.length > 0 &&
    !['Succeeded', 'Failed'].includes(pod.status.phase)
  );
};

const NodeCard: React.FC<{ node: NodeType & { _key?: string } }> = ({ node }) => {
  return (
    <Card
      key={node._key || node.metadata.uid}
      style={{
        width: '100%',
        margin: '0 0 0.5rem 0',
        padding: 0,
        boxSizing: 'border-box'
      }}
    >
      <CardTitle
        style={{
          width: '100%',
          padding: '0.25rem 1rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}
      >
        <span style={{ fontWeight: 'bold' }}>{node.metadata.name}</span>
        <NodeConditionsDisplay node={node} />
      </CardTitle>
      <CardBody
        style={{
          width: '100%',
          padding: '0.5rem 1rem',
          boxSizing: 'border-box'
        }}
      >
        <NodeResourceDisplay node={node} />
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

const SchedulerPage: React.FC = () => {
  const [nodes, nodesLoaded, nodesError] = useK8sWatchResource<NodeType[]>({
    kind: 'Node',
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

  if (nodesError) {
    console.error('Error loading nodes', nodesError);
    return <div>Error loading nodes</div>;
  }

  return (
    <div style={{
      width: '100%',
      height: 'calc(100vh - 64px)', // More precise header subtraction
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
            validNodes.map((node) => (
              <NodeCard key={node._key} node={node} />
            ))
          )}
        </Suspense>
      </div>
    </div>
  );
};

export default SchedulerPage;