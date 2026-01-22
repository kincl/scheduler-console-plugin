import React, { useState } from 'react';
import { Card, CardTitle, CardBody } from '@patternfly/react-core';
import { NodeType, PodType } from './types';
import { parseCPUQuantity, parseMemoryQuantity, parseGenericResource, formatGenericResource } from './utils';
import { EffectiveCPUBar, EffectiveMemoryBar, GenericResourceBar } from './ResourceBar';
import { NodeRoles, NodeConditions } from './NodeComponents';
import { PodsDisplay } from './PodComponents';

export const NodeCard: React.FC<{
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
  const [hoveredPodResources, setHoveredPodResources] = useState<{ [key: string]: number }>({});

  const totalCPUs = parseCPUQuantity(node.status?.capacity?.cpu || '0');
  const totalMemory = parseMemoryQuantity(node.status?.capacity?.memory || '0');

  const handlePodHover = (resources: { [key: string]: number }) => {
    setHoveredPodResources(resources);
  };

  const handlePodHoverEnd = () => {
    setHoveredPodResources({});
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
          <span>
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
            hoveredPodCPU={hoveredPodResources['cpu']}
          />
        )}
        {selectedResources.has('memory') && (
          <EffectiveMemoryBar
            totalMemory={totalMemory}
            requestedMemory={requestedMemory}
            limitedMemory={limitedMemory}
            nodeName={node.metadata.name}
            hoveredPodMemory={hoveredPodResources['memory']}
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
                label={`Effective ${resource}`}
                formatValue={(value) => formatGenericResource(value, resource)}
                hoveredValue={hoveredPodResources[resource]}
              />
            );
          })}
        <PodsDisplay 
          pods={regularPods} 
          showNames={showPodNames} 
          title="Pods"
          onPodHover={handlePodHover}
          onPodHoverEnd={handlePodHoverEnd}
          selectedResources={selectedResources}
        />
        <PodsDisplay 
          pods={systemPods} 
          showNames={showPodNames} 
          title="System Pods"
          onPodHover={handlePodHover}
          onPodHoverEnd={handlePodHoverEnd}
          selectedResources={selectedResources}
        />
      </CardBody>
    </Card>
  );
};
