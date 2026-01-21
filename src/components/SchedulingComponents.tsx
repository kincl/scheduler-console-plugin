import React, { useMemo } from 'react';
import { useK8sWatchResource } from '@openshift-console/dynamic-plugin-sdk';
import { Card, CardTitle, CardBody, Label, Spinner } from '@patternfly/react-core';
import { PodType, EventType } from './types';
import { isValidPod } from './utils';

// Scheduling Events Component
export const SchedulingEvents: React.FC<{ fullWidth?: boolean }> = ({ fullWidth = false }) => {
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

  const cardStyle: React.CSSProperties = fullWidth 
    ? { marginBottom: '1rem', width: '100%' }
    : { marginBottom: '1rem', width: '50%', flex: '0 0 50%' };

  if (!loaded) {
    return (
      <Card style={cardStyle}>
        <CardBody style={fullWidth ? { flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' } : {}}>
          <Spinner size="sm" />
        </CardBody>
      </Card>
    );
  }

  if (error) {
    return (
      <Card style={cardStyle}>
        <CardBody style={fullWidth ? { flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' } : {}}>
          <div style={{ color: 'var(--pf-global--danger-color--100)', fontSize: '0.875rem' }}>
            Error loading events: {error.message}
          </div>
        </CardBody>
      </Card>
    );
  }

  return (
    <Card style={cardStyle}>
      <CardTitle style={{ padding: '1rem', borderBottom: '1px solid var(--pf-global--BorderColor--100)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Label color="blue">Scheduling Events ({schedulingEvents.length})</Label>
        </div>
      </CardTitle>
      <CardBody style={{ padding: '1rem' }}>
        <div style={{ maxHeight: fullWidth ? 'none' : '400px', overflowY: fullWidth ? 'visible' : 'auto' }}>
          {schedulingEvents.length === 0 ? (
            <div style={{ 
              padding: '1rem', 
              textAlign: 'center', 
              color: 'var(--pf-global--Color--200)',
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
                    borderBottom: idx < schedulingEvents.length - 1 ? '1px solid var(--pf-global--BorderColor--100)' : 'none',
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
                      color: 'var(--pf-global--Color--200)',
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
                      color: 'var(--pf-global--Color--200)', 
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
      <div style={{ 
        padding: '0.75rem',
        backgroundColor: 'var(--pf-global--BackgroundColor--100)',
        borderRadius: '4px',
        fontSize: '0.875rem',
        color: 'var(--pf-global--Color--200)'
      }}>
        <Label color="green">Scheduling Pressure: None</Label>
        <span style={{ marginLeft: '0.5rem' }}>
          All pods are scheduled
        </span>
      </div>
    );
  }

  // Helper function to format time since creation
  const getTimeSinceCreated = (pod: PodType): string => {
    const creationTimestamp = (pod.metadata as any).creationTimestamp;
    if (!creationTimestamp) return 'Unknown';
    
    const created = new Date(creationTimestamp);
    const now = new Date();
    const diffMs = now.getTime() - created.getTime();
    const diffSeconds = Math.floor(diffMs / 1000);
    const diffMinutes = Math.floor(diffSeconds / 60);
    const diffHours = Math.floor(diffMinutes / 60);
    const diffDays = Math.floor(diffHours / 24);
    
    if (diffDays > 0) return `${diffDays}d ${diffHours % 24}h`;
    if (diffHours > 0) return `${diffHours}h ${diffMinutes % 60}m`;
    if (diffMinutes > 0) return `${diffMinutes}m ${diffSeconds % 60}s`;
    return `${diffSeconds}s`;
  };

  return (
    <div style={{ marginTop: '0.5rem' }}>
      <table style={{ 
        width: '100%', 
        borderCollapse: 'collapse',
        fontSize: '0.875rem'
      }}>
        <thead>
          <tr style={{ 
            borderBottom: '2px solid var(--pf-global--BorderColor--100)',
            textAlign: 'left'
          }}>
            <th style={{ padding: '0.5rem', fontWeight: 'bold' }}>Name</th>
            <th style={{ padding: '0.5rem', fontWeight: 'bold' }}>Namespace</th>
            <th style={{ padding: '0.5rem', fontWeight: 'bold' }}>Age</th>
          </tr>
        </thead>
        <tbody>
          {unscheduledPods.map((pod) => (
            <tr 
              key={pod.metadata.uid}
              style={{ 
                borderBottom: '1px solid #D1D1D1'
              }}
            >
              <td style={{ padding: '0.5rem' }}>{pod.metadata.name}</td>
              <td style={{ padding: '0.5rem' }}>{pod.metadata.namespace}</td>
              <td style={{ padding: '0.5rem' }}>{getTimeSinceCreated(pod)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};
