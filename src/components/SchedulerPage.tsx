import React, { useMemo, Suspense, useState } from 'react';
import {
  Title,
  Spinner,
  Label,
  Checkbox,
} from '@patternfly/react-core';
import { useK8sWatchResource } from '@openshift-console/dynamic-plugin-sdk';
import { NodeType, PodType, NamespaceType } from './types';
import { isValidNode, isValidPod, getNodeRoles, parseCPUQuantity, parseMemoryQuantity, parseGenericResource } from './utils';
import { SchedulingEvents, SchedulingPressure } from './SchedulingComponents';
import { ResourceSelector, ProjectSelector } from './SelectorComponents';
import { NodeCard } from './NodeCard';
import { CompactNodeCard } from './CompactNodeCard';

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
              <div style={{ 
                display: 'flex', 
                gap: '1rem', 
                width: '100%',
                alignItems: 'flex-start'
              }}>
                <SchedulingPressure pods={filteredPods || []} showNames={showPodNames} />
                <SchedulingEvents />
              </div>
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
