import React from 'react';
import { Card } from '@patternfly/react-core';
import { NodeType, PodType } from './types';
import { parseCPUQuantity, parseMemoryQuantity, getNodeRoles, calculatePodEffectiveCPU, calculatePodEffectiveMemory } from './utils';
import { PodBox } from './PodComponents';

export const CompactNodeCard: React.FC<{
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
        textAlign: 'center',
        marginBottom: '0.5rem'
      }}>
        <div style={{ marginBottom: '0.25rem' }}>
          <strong>CPU:</strong> {cpuPercentage.toFixed(1)}%
        </div>
        <div style={{ marginBottom: '0.25rem' }}>
          <strong>Memory:</strong> {memoryPercentage.toFixed(1)}%
        </div>
          <strong>Memory:</strong> {memoryPercentage.toFixed(1)}%
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
