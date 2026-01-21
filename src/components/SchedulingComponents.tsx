import React, { useMemo } from 'react';
import { useK8sWatchResource } from '@openshift-console/dynamic-plugin-sdk';
import { Card, CardTitle, CardBody, Label, Spinner } from '@patternfly/react-core';
import { PodType, EventType } from './types';
import { isValidPod, calculatePodEffectiveCPU, calculatePodEffectiveMemory } from './utils';
import { UnschedulablePodBox } from './PodComponents';

// Scheduling Events Component
export const SchedulingEvents: React.FC = () => {
  const [events, loaded, error] = useK8sWatchResource<EventType[]>({
    kind: 'Event',
    isList: true,
    namespaced: false,
  });

  // Filter for scheduling-related events only
  const schedulingEvents = useMemo(() => {
    if (!events || !Array.isArray(events)) return [];
    
    const schedulingReasons = [
      'FailedScheduling',
      'Scheduled',
      'FailedCreate',
      'SuccessfulCreate',
      'FailedMount',
      'SuccessfulMount',
    ];

    return events
      .filter(event => 
        event.reason && schedulingReasons.some(reason => 
          event.reason === reason || event.reason.includes(reason)
        )
      )
      .sort((a, b) => {
        const timeA = new Date(
          a.lastTimestamp || a.firstTimestamp || a.metadata.creationTimestamp
        ).getTime();
        const timeB = new Date(
          b.lastTimestamp || b.firstTimestamp || b.metadata.creationTimestamp
        ).getTime();
        return timeB - timeA; // Newest first
      })
      .slice(0, 50); // Limit to most recent 50 events
  }, [events]);

  if (!loaded) {
    return (
      <Card style={{ marginBottom: '1rem', width: '50%', flex: '0 0 50%' }}>
        <CardBody>
          <Spinner size="sm" />
        </CardBody>
      </Card>
    );
  }

  if (error) {
    return (
      <Card style={{ marginBottom: '1rem', width: '50%', flex: '0 0 50%' }}>
        <CardBody>
          <div style={{ color: '#C9190B', fontSize: '0.875rem' }}>
            Error loading events: {error.message}
          </div>
        </CardBody>
      </Card>
    );
  }

  return (
    <Card style={{ marginBottom: '1rem', width: '50%', flex: '0 0 50%' }}>
      <CardTitle style={{ padding: '1rem', borderBottom: '1px solid #D1D1D1' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Label color="blue">Scheduling Events ({schedulingEvents.length})</Label>
        </div>
      </CardTitle>
      <CardBody style={{ padding: '1rem' }}>
        <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
          {schedulingEvents.length === 0 ? (
            <div style={{ 
              padding: '1rem', 
              textAlign: 'center', 
              color: '#6A6E73',
              fontSize: '0.875rem'
            }}>
              No scheduling events found
            </div>
          ) : (
            schedulingEvents.map((event, idx) => {
              const eventTime = new Date(
                event.lastTimestamp || 
                event.firstTimestamp || 
                event.metadata.creationTimestamp
              );
              const isWarning = event.type === 'Warning' || 
                (event.reason && event.reason.includes('Failed'));

              return (
                <div
                  key={`${event.metadata.name}-${idx}`}
                  style={{
                    padding: '0.75rem',
                    borderBottom: idx < schedulingEvents.length - 1 ? '1px solid #D1D1D1' : 'none',
                  }}
                >
                  <div style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    gap: '0.5rem', 
                    marginBottom: '0.25rem',
                    flexWrap: 'wrap'
                  }}>
                    <Label
                      color={isWarning ? 'orange' : 'green'}
                      variant="outline"
                      style={{ fontSize: '0.75rem' }}
                    >
                      {event.reason || 'Unknown'}
                    </Label>
                    <span style={{ 
                      fontSize: '0.75rem', 
                      color: '#6A6E73',
                      whiteSpace: 'nowrap'
                    }}>
                      {eventTime.toLocaleTimeString()}
                    </span>
                    {event.count && event.count > 1 && (
                      <span style={{ 
                        fontSize: '0.75rem', 
                        color: '#6A6E73' 
                      }}>
                        ({event.count} times)
                      </span>
                    )}
                  </div>
                  {event.message && (
                    <div style={{ 
                      fontSize: '0.875rem', 
                      marginTop: '0.25rem',
                      wordBreak: 'break-word'
                    }}>
                      {event.message}
                    </div>
                  )}
                  {event.involvedObject && (
                    <div style={{ 
                      fontSize: '0.75rem', 
                      color: '#6A6E73', 
                      marginTop: '0.25rem' 
                    }}>
                      {event.involvedObject.kind}/{event.involvedObject.name}
                      {event.involvedObject.namespace && 
                        ` in ${event.involvedObject.namespace}`
                      }
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </CardBody>
    </Card>
  );
};

// Scheduling Pressure Component
export const SchedulingPressure: React.FC<{ pods: PodType[]; showNames: boolean }> = ({ pods, showNames }) => {
  const unscheduledPods = useMemo(() => {
    return pods.filter(pod =>
      isValidPod(pod) &&
      pod.status.phase === 'Pending' &&
      !pod.spec.nodeName
    );
  }, [pods]);

  if (unscheduledPods.length === 0) {
    return (
      <Card style={{ marginBottom: '1rem', width: '50%', flex: '0 0 50%' }}>
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
    <Card style={{ marginBottom: '1rem', width: '50%', flex: '0 0 50%' }}>
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
