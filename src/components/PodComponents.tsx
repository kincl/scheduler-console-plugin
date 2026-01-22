import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Popover } from '@patternfly/react-core';
import { PodType } from './types';
import { calculatePodEffectiveCPU, calculatePodEffectiveMemory, calculatePodEffectiveResource, formatMemory, getSchedulingFailureReason } from './utils';

// Pod Box Component - small box representing a pod
export const PodBox: React.FC<{
  pod: PodType;
  width: number;
  showName: boolean;
  onHover?: (resources: { [key: string]: number }) => void;
  onHoverEnd?: () => void;
  selectedResources?: Set<string>;
}> = ({ pod, width, showName, onHover, onHoverEnd, selectedResources }) => {
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
    if (onHover && selectedResources) {
      // Calculate all resources that are currently selected
      const resources: { [key: string]: number } = {};
      selectedResources.forEach(resourceName => {
        if (resourceName === 'cpu') {
          resources[resourceName] = effectiveCPU;
        } else if (resourceName === 'memory') {
          resources[resourceName] = effectiveMemory;
        } else {
          resources[resourceName] = calculatePodEffectiveResource(pod, resourceName);
        }
      });
      onHover(resources);
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

  // Helper function to get pod detail page URL
  const getPodDetailUrl = (pod: PodType): string => {
    return `/k8s/ns/${pod.metadata.namespace}/pods/${pod.metadata.name}`;
  };

  const podContent = (
    <div>
      <div style={{ display: 'flex', marginBottom: '0.25rem', alignItems: 'flex-start' }}>
        <span style={{ fontWeight: 'bold', minWidth: '80px' }}>Name:</span>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem' }}>
          <div
            style={{
              borderRadius: '50%',
              width: '18px',
              height: '18px',
              backgroundColor: '#009596',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '0.75rem',
              fontWeight: 'bold',
              color: '#ffffff',
              flexShrink: 0,
              marginTop: '2px'
            }}
          >
            P
          </div>
          <Link
            to={getPodDetailUrl(pod)}
            style={{
              color: '#0066cc',
              textDecoration: 'underline',
              wordBreak: 'break-word'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {pod.metadata.name}
          </Link>
        </div>
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
export const PodsDisplay: React.FC<{
  pods: PodType[];
  showNames: boolean;
  title: string;
  onPodHover?: (resources: { [key: string]: number }) => void;
  onPodHoverEnd?: () => void;
  selectedResources?: Set<string>;
}> = ({ pods, showNames, title, onPodHover, onPodHoverEnd, selectedResources }) => {
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
                selectedResources={selectedResources}
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
              selectedResources={selectedResources}
            />
          );
        })}
      </div>
    </div>
  );
};

// Unschedulable Pod Box Component - small box representing an unschedulable pod
export const UnschedulablePodBox: React.FC<{ pod: PodType; width: number; showName: boolean }> = ({ pod, width, showName }) => {
  const [isTooltipVisible, setIsTooltipVisible] = useState(false);

  const effectiveCPU = calculatePodEffectiveCPU(pod);
  const effectiveMemory = calculatePodEffectiveMemory(pod);
  const memoryFormatted = formatMemory(effectiveMemory);
  const reason = getSchedulingFailureReason(pod) || 'No reason available';

  const handleClick = () => {
    setIsTooltipVisible(!isTooltipVisible);
  };

  // Helper function to get pod detail page URL
  const getPodDetailUrl = (pod: PodType): string => {
    return `/k8s/ns/${pod.metadata.namespace}/pods/${pod.metadata.name}`;
  };

  const podContent = (
    <div>
      <div style={{ display: 'flex', marginBottom: '0.25rem', alignItems: 'flex-start' }}>
        <span style={{ fontWeight: 'bold', minWidth: '80px' }}>Name:</span>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem' }}>
          <div
            style={{
              borderRadius: '50%',
              width: '18px',
              height: '18px',
              backgroundColor: '#009596',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '0.75rem',
              fontWeight: 'bold',
              color: '#ffffff',
              flexShrink: 0,
              marginTop: '2px'
            }}
          >
            P
          </div>
          <Link
            to={getPodDetailUrl(pod)}
            style={{
              color: '#0066cc',
              textDecoration: 'underline',
              wordBreak: 'break-word'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {pod.metadata.name}
          </Link>
        </div>
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
