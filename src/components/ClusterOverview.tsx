import React, { useMemo } from 'react';
import { Card, CardTitle, CardBody } from '@patternfly/react-core';
import { Chart, ChartAxis, ChartBar, ChartThemeColor } from '@patternfly/react-charts';
import { NodeType, PodType } from './types';
import { isValidNode, isValidPod, parseCPUQuantity, parseMemoryQuantity, parseGenericResource, formatMemory, getSchedulingFailureReason } from './utils';
import { SchedulingPressure } from './SchedulingComponents';

interface ClusterOverviewProps {
  nodes: NodeType[];
  pods: PodType[];
  nodeResourceUsage: { [resourceName: string]: { requests: { [nodeName: string]: number }, limits: { [nodeName: string]: number } } };
  showPodNames: boolean;
  selectedResources: Set<string>;
}

const ProgressBar: React.FC<{ percentage: number; label: string }> = ({ percentage, label }) => {

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.5rem' }}>
      <span style={{ minWidth: '70px' }}>{label}:</span>
      <div style={{
        display: 'flex',
        gap: '2px',
        flex: 1,
        alignItems: 'center'
      }}>
        <div style={{
          display: 'flex',
          gap: '2px',
          flex: 1,
          height: '16px',
          backgroundColor: 'var(--pf-v5-global--palette--black-400, var(--pf-global--palette--black-400, #d2d2d2))',
          border: '1px solid var(--pf-global--BorderColor--100)',
          borderRadius: '2px',
          overflow: 'hidden',
          position: 'relative'
        }}>
          <div style={{
            width: `${percentage}%`,
            backgroundColor: percentage > 80 ? 'var(--pf-v5-global--danger-color--100, #c9190b)' : percentage > 60 ? 'var(--pf-v5-global--warning-color--100, #f0ab00)' : 'var(--pf-v5-global--success-color--100, #3e8635)',
            height: '100%',
            transition: 'width 0.3s ease',
            minWidth: percentage > 0 ? '2px' : '0'
          }} />
        </div>
        <span style={{ minWidth: '45px', textAlign: 'right' }}>
          {Math.round(percentage)}%
        </span>
      </div>
    </div>
  );
};

export const ClusterOverview: React.FC<ClusterOverviewProps> = ({ nodes, pods, nodeResourceUsage, showPodNames, selectedResources }) => {
  // Calculate cluster statistics
  const clusterStats = useMemo(() => {
    const validNodesList = nodes.filter(isValidNode);
    const validPodsList = pods.filter(isValidPod);

    // Count schedulable nodes (nodes that are ready)
    const schedulableNodes = validNodesList.filter(node => {
      const readyCondition = node.status?.conditions?.find(cond => cond.type === 'Ready');
      return readyCondition?.status === 'True';
    });

    // Count pods by phase
    const podsByPhase = validPodsList.reduce((acc, pod) => {
      const phase = pod.status.phase || 'Unknown';
      acc[phase] = (acc[phase] || 0) + 1;
      return acc;
    }, {} as { [key: string]: number });

    // Count unscheduled pods
    const unscheduledPods = validPodsList.filter(pod =>
      pod.status.phase === 'Pending' && !pod.spec.nodeName
    );

    // Calculate total cluster capacity and usage for selected resources
    const resourceStats: {
      [resourceName: string]: {
        total: number;
        used: number;
        percentage: number;
        nodePercentages: Array<{ nodeName: string; percentage: number; used: number; total: number }>;
        percentiles: {
          p100: { nodeName: string; percentage: number; used: number; total: number } | null;
          p99: { nodeName: string; percentage: number; used: number; total: number } | null;
          p90: { nodeName: string; percentage: number; used: number; total: number } | null;
          p50: { nodeName: string; percentage: number; used: number; total: number } | null;
          p10: { nodeName: string; percentage: number; used: number; total: number } | null;
          p0: { nodeName: string; percentage: number; used: number; total: number } | null;
        };
        distribution: { [range: string]: number };
      }
    } = {};

    selectedResources.forEach(resourceName => {
      let total = 0;
      let used = 0;
      const nodePercentages: Array<{ nodeName: string; percentage: number; used: number; total: number }> = [];

      // Calculate per-node capacity and usage
      validNodesList.forEach(node => {
        const capacity = node.status?.capacity || {};
        const capacityValue = capacity[resourceName] || '0';
        const nodeName = node.metadata.name;

        let nodeTotal = 0;
        // Parse based on resource type
        if (resourceName === 'cpu') {
          nodeTotal = parseCPUQuantity(capacityValue);
        } else if (resourceName === 'memory') {
          nodeTotal = parseMemoryQuantity(capacityValue);
        } else {
          nodeTotal = parseGenericResource(capacityValue);
        }

        total += nodeTotal;

        // Get usage for this node
        const resourceData = nodeResourceUsage[resourceName];
        let nodeUsed = 0;
        if (resourceData) {
          // Use requests first, fallback to limits
          nodeUsed = resourceData.requests?.[nodeName] || 0;
          if (nodeUsed === 0) {
            nodeUsed = resourceData.limits?.[nodeName] || 0;
          }
        }
        used += nodeUsed;

        // Calculate percentage for this node
        const nodePercentage = nodeTotal > 0 ? Math.min((nodeUsed / nodeTotal) * 100, 100) : 0;
        nodePercentages.push({
          nodeName,
          percentage: nodePercentage,
          used: nodeUsed,
          total: nodeTotal
        });
      });

      // Sort by percentage for percentile calculation
      const sortedPercentages = [...nodePercentages].sort((a, b) => b.percentage - a.percentage);

      // Calculate percentiles with node information
      const getPercentile = (p: number) => {
        if (sortedPercentages.length === 0) return null;
        const index = Math.ceil((sortedPercentages.length - 1) * (1 - p / 100));
        return sortedPercentages[index] || null;
      };

      const percentiles = {
        p100: sortedPercentages[0] || null,
        p99: getPercentile(99),
        p90: getPercentile(90),
        p50: getPercentile(50),
        p10: getPercentile(10),
        p0: sortedPercentages[sortedPercentages.length - 1] || null
      };

      // Calculate distribution (buckets)
      const distribution: { [range: string]: number } = {
        '0-10': 0,
        '10-20': 0,
        '20-30': 0,
        '30-40': 0,
        '40-50': 0,
        '50-60': 0,
        '60-70': 0,
        '70-80': 0,
        '80-90': 0,
        '90-100': 0
      };

      nodePercentages.forEach(node => {
        const pct = node.percentage;
        if (pct < 10) distribution['0-10']++;
        else if (pct < 20) distribution['10-20']++;
        else if (pct < 30) distribution['20-30']++;
        else if (pct < 40) distribution['30-40']++;
        else if (pct < 50) distribution['40-50']++;
        else if (pct < 60) distribution['50-60']++;
        else if (pct < 70) distribution['60-70']++;
        else if (pct < 80) distribution['70-80']++;
        else if (pct < 90) distribution['80-90']++;
        else distribution['90-100']++;
      });

      // Calculate overall percentage
      const percentage = total > 0 ? Math.min((used / total) * 100, 100) : 0;

      resourceStats[resourceName] = {
        total,
        used,
        percentage,
        nodePercentages,
        percentiles,
        distribution
      };
    });

    return {
      totalNodes: validNodesList.length,
      schedulableNodes: schedulableNodes.length,
      totalPods: validPodsList.length,
      runningPods: podsByPhase['Running'] || 0,
      resourceStats,
      unscheduledPods: unscheduledPods.length
    };
  }, [nodes, pods, nodeResourceUsage, selectedResources]);

  // Calculate scheduling failures grouped by error reason
  const schedulingFailures = useMemo(() => {
    const unscheduledPods = pods.filter(pod =>
      isValidPod(pod) &&
      pod.status.phase === 'Pending' &&
      !pod.spec.nodeName
    );

    const groups: { [reason: string]: number } = {};

    unscheduledPods.forEach(pod => {
      const reason = getSchedulingFailureReason(pod) || 'Unknown reason';
      groups[reason] = (groups[reason] || 0) + 1;
    });

    return Object.entries(groups).sort((a, b) => b[1] - a[1]);
  }, [pods]);

  return (
    <div style={{ marginBottom: '1rem' }}>
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 1fr) minmax(300px, 0.4fr)',
        gap: '1.5rem',
        alignItems: 'start'
      }}>
          {/* Left Column - Overview and Resources */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {/* Overview Card */}
            <Card>
              <CardTitle style={{
                fontWeight: 'bold',
                marginBottom: '0.75rem',
                paddingBottom: '0.5rem',
                borderBottom: '1px solid var(--pf-global--BorderColor--100)'
              }}>
                Overview
              </CardTitle>
              <CardBody style={{ padding: '1rem' }}>
                <div style={{ lineHeight: '1.8' }}>
                  <div style={{ marginBottom: '0.25rem' }}>
                    Total Nodes: <strong>{clusterStats.totalNodes}</strong>    Schedulable: <strong>{clusterStats.schedulableNodes}</strong>
                  </div>
                  <div>
                    Total Pods: <strong>{clusterStats.totalPods.toLocaleString()}</strong>  Running: <strong>{clusterStats.runningPods.toLocaleString()}</strong>
                  </div>
                </div>
              </CardBody>
            </Card>

            {/* Resource Cards */}
            {Array.from(selectedResources).map(resourceName => {
              const stats = clusterStats.resourceStats[resourceName];
              if (!stats) return null;
              // Capitalize first letter for display (special case for CPU and Memory)
              const label = resourceName.toLowerCase() === 'cpu' 
                ? 'CPU' 
                : resourceName.toLowerCase() === 'memory'
                ? 'Memory'
                : resourceName;

              // Format values based on resource type
              let usedDisplay = '';
              let totalDisplay = '';
              if (resourceName === 'cpu') {
                usedDisplay = stats.used.toFixed(1);
                totalDisplay = stats.total.toFixed(1);
              } else if (resourceName === 'memory') {
                const usedMem = formatMemory(stats.used);
                const totalMem = formatMemory(stats.total);
                usedDisplay = `${usedMem.value}${usedMem.unit}`;
                totalDisplay = `${totalMem.value}${totalMem.unit}`;
              } else {
                usedDisplay = stats.used.toFixed(1);
                totalDisplay = stats.total.toFixed(1);
              }

              return (
                <Card key={resourceName}>
                  <CardTitle style={{
                    fontWeight: 'bold',
                    marginBottom: '0.75rem',
                    paddingBottom: '0.5rem',
                    borderBottom: '1px solid var(--pf-global--BorderColor--100)'
                  }}>
                    {label}
                  </CardTitle>
                  <CardBody style={{ padding: '1rem' }}>
                    <ProgressBar
                      percentage={stats.percentage}
                      label={label}
                    />
                    <div style={{ color: 'var(--pf-global--Color--200)', marginTop: '0.25rem', marginLeft: '78px' }}>
                      {usedDisplay} / {totalDisplay} ({stats.percentage.toFixed(1)}%)
                    </div>

                    {/* Percentiles and Distribution */}
                    <div style={{ color: 'var(--pf-global--Color--200)', marginTop: '1rem' }}>
                      <div style={{
                        display: 'flex',
                        flexDirection: 'row',
                        flexWrap: 'wrap',
                        gap: '1.5rem'
                      }}>
                        {/* Percentiles Table */}
                        <div style={{ minWidth: '280px', flex: '1 1 280px' }}>
                          <div style={{ marginBottom: '0.5rem', fontWeight: 'bold' }}>
                            Percentiles:
                          </div>
                          <table style={{
                            width: '100%',
                            borderCollapse: 'collapse'
                          }}>
                            <thead>
                              <tr style={{
                                borderBottom: '2px solid var(--pf-global--BorderColor--100)',
                                textAlign: 'left'
                              }}>
                                <th style={{ padding: '0.5rem', fontWeight: 'bold' }}>Percentile</th>
                                <th style={{ padding: '0.5rem', fontWeight: 'bold' }}>Node</th>
                                <th style={{ padding: '0.5rem', fontWeight: 'bold' }}>Value</th>
                                <th style={{ padding: '0.5rem', fontWeight: 'bold' }}>%</th>
                              </tr>
                            </thead>
                            <tbody>
                              {stats.percentiles.p100 && (
                                <tr>
                                  <td style={{ padding: '0.5rem', borderBottom: '1px solid var(--pf-global--BorderColor--100)' }}>P100 (Max)</td>
                                  <td style={{ padding: '0.5rem', borderBottom: '1px solid var(--pf-global--BorderColor--100)' }}>{stats.percentiles.p100.nodeName}</td>
                                  <td style={{ padding: '0.5rem', borderBottom: '1px solid var(--pf-global--BorderColor--100)' }}>
                                    {resourceName === 'cpu' ? stats.percentiles.p100.used.toFixed(1) : resourceName === 'memory' ? formatMemory(stats.percentiles.p100.used).value + formatMemory(stats.percentiles.p100.used).unit : stats.percentiles.p100.used.toFixed(1)}
                                  </td>
                                  <td style={{ padding: '0.5rem', borderBottom: '1px solid var(--pf-global--BorderColor--100)' }}>{stats.percentiles.p100.percentage.toFixed(1)}%</td>
                                </tr>
                              )}
                              {stats.percentiles.p99 && (
                                <tr>
                                  <td style={{ padding: '0.5rem', borderBottom: '1px solid var(--pf-global--BorderColor--100)' }}>P99</td>
                                  <td style={{ padding: '0.5rem', borderBottom: '1px solid var(--pf-global--BorderColor--100)' }}>{stats.percentiles.p99.nodeName}</td>
                                  <td style={{ padding: '0.5rem', borderBottom: '1px solid var(--pf-global--BorderColor--100)' }}>
                                    {resourceName === 'cpu' ? stats.percentiles.p99.used.toFixed(1) : resourceName === 'memory' ? formatMemory(stats.percentiles.p99.used).value + formatMemory(stats.percentiles.p99.used).unit : stats.percentiles.p99.used.toFixed(1)}
                                  </td>
                                  <td style={{ padding: '0.5rem', borderBottom: '1px solid var(--pf-global--BorderColor--100)' }}>{stats.percentiles.p99.percentage.toFixed(1)}%</td>
                                </tr>
                              )}
                              {stats.percentiles.p90 && (
                                <tr>
                                  <td style={{ padding: '0.5rem', borderBottom: '1px solid var(--pf-global--BorderColor--100)' }}>P90</td>
                                  <td style={{ padding: '0.5rem', borderBottom: '1px solid var(--pf-global--BorderColor--100)' }}>{stats.percentiles.p90.nodeName}</td>
                                  <td style={{ padding: '0.5rem', borderBottom: '1px solid var(--pf-global--BorderColor--100)' }}>
                                    {resourceName === 'cpu' ? stats.percentiles.p90.used.toFixed(1) : resourceName === 'memory' ? formatMemory(stats.percentiles.p90.used).value + formatMemory(stats.percentiles.p90.used).unit : stats.percentiles.p90.used.toFixed(1)}
                                  </td>
                                  <td style={{ padding: '0.5rem', borderBottom: '1px solid var(--pf-global--BorderColor--100)' }}>{stats.percentiles.p90.percentage.toFixed(1)}%</td>
                                </tr>
                              )}
                              {stats.percentiles.p50 && (
                                <tr>
                                  <td style={{ padding: '0.5rem', borderBottom: '1px solid var(--pf-global--BorderColor--100)' }}>P50 (Median)</td>
                                  <td style={{ padding: '0.5rem', borderBottom: '1px solid var(--pf-global--BorderColor--100)' }}>{stats.percentiles.p50.nodeName}</td>
                                  <td style={{ padding: '0.5rem', borderBottom: '1px solid var(--pf-global--BorderColor--100)' }}>
                                    {resourceName === 'cpu' ? stats.percentiles.p50.used.toFixed(1) : resourceName === 'memory' ? formatMemory(stats.percentiles.p50.used).value + formatMemory(stats.percentiles.p50.used).unit : stats.percentiles.p50.used.toFixed(1)}
                                  </td>
                                  <td style={{ padding: '0.5rem', borderBottom: '1px solid var(--pf-global--BorderColor--100)' }}>{stats.percentiles.p50.percentage.toFixed(1)}%</td>
                                </tr>
                              )}
                              {stats.percentiles.p10 && (
                                <tr>
                                  <td style={{ padding: '0.5rem', borderBottom: '1px solid var(--pf-global--BorderColor--100)' }}>P10</td>
                                  <td style={{ padding: '0.5rem', borderBottom: '1px solid var(--pf-global--BorderColor--100)' }}>{stats.percentiles.p10.nodeName}</td>
                                  <td style={{ padding: '0.5rem', borderBottom: '1px solid var(--pf-global--BorderColor--100)' }}>
                                    {resourceName === 'cpu' ? stats.percentiles.p10.used.toFixed(1) : resourceName === 'memory' ? formatMemory(stats.percentiles.p10.used).value + formatMemory(stats.percentiles.p10.used).unit : stats.percentiles.p10.used.toFixed(1)}
                                  </td>
                                  <td style={{ padding: '0.5rem', borderBottom: '1px solid var(--pf-global--BorderColor--100)' }}>{stats.percentiles.p10.percentage.toFixed(1)}%</td>
                                </tr>
                              )}
                              {stats.percentiles.p0 && (
                                <tr>
                                  <td style={{ padding: '0.5rem', borderBottom: '1px solid var(--pf-global--BorderColor--100)' }}>P0 (Min)</td>
                                  <td style={{ padding: '0.5rem', borderBottom: '1px solid var(--pf-global--BorderColor--100)' }}>{stats.percentiles.p0.nodeName}</td>
                                  <td style={{ padding: '0.5rem', borderBottom: '1px solid var(--pf-global--BorderColor--100)' }}>
                                    {resourceName === 'cpu' ? stats.percentiles.p0.used.toFixed(1) : resourceName === 'memory' ? formatMemory(stats.percentiles.p0.used).value + formatMemory(stats.percentiles.p0.used).unit : stats.percentiles.p0.used.toFixed(1)}
                                  </td>
                                  <td style={{ padding: '0.5rem', borderBottom: '1px solid var(--pf-global--BorderColor--100)' }}>{stats.percentiles.p0.percentage.toFixed(1)}%</td>
                                </tr>
                              )}
                            </tbody>
                          </table>
                        </div>

                        {/* Distribution Bar Chart */}
                        <div style={{ minWidth: '280px', flex: '1 1 280px', paddingLeft: '1rem' }}>
                          <div style={{ marginBottom: '2.5rem', fontWeight: 'bold' }}>
                            Node Resource Distribution:
                          </div>
                          {(() => {
                            const maxCount = Math.max(...Object.values(stats.distribution), 1);
                            
                            // Convert distribution data to PatternFly chart format
                            const chartData = Object.entries(stats.distribution).map(([range, count]) => ({
                              x: range,
                              y: count
                            }));

                            // Calculate unique y-axis tick values
                            const numTicks = Math.min(maxCount + 1, 6); // Max 6 ticks
                            const tickStep = maxCount / (numTicks - 1);
                            const yTickValues: number[] = [];
                            for (let i = 0; i < numTicks; i++) {
                              const tickValue = Math.round(i * tickStep);
                              // Only add if it's unique
                              if (yTickValues.length === 0 || tickValue !== yTickValues[yTickValues.length - 1]) {
                                yTickValues.push(tickValue);
                              }
                            }

                            // Determine color based on percentage range
                            const getBarColor = (rangeStr: string, count: number) => {
                              if (count === 0) return 'var(--pf-global--BorderColor--100)';

                              // Extract the upper bound of the range (e.g., "80-90" -> 90)
                              const match = rangeStr.match(/(\d+)-(\d+)/);
                              if (!match) return '#3e8635'; // default to green

                              const upperBound = parseInt(match[2], 10);

                              // Green for 0-50%, Yellow for 50-80%, Red for 80-100%
                              if (upperBound <= 50) {
                                return '#3e8635'; // green
                              } else if (upperBound <= 80) {
                                return '#f0ab00'; // yellow
                              } else {
                                return '#c9190b'; // red
                              }
                            };

                            return (
                              <div style={{ height: '200px', width: '100%' }}>
                                <Chart
                                  domain={{ y: [0, maxCount] }}
                                  domainPadding={{ x: [10, 10] }}
                                  height={200}
                                  padding={{ bottom: 50, left: 50, right: 20, top: 20 }}
                                  themeColor={ChartThemeColor.multi}
                                  width={undefined}
                                >
                                  <ChartAxis 
                                    dependentAxis
                                    showGrid
                                    tickValues={yTickValues}
                                    tickFormat={(t) => Math.round(t)}
                                  />
                                  <ChartAxis 
                                    tickFormat={(t) => {
                                      // Extract the upper bound from range format "0-10" -> "10"
                                      const match = String(t).match(/(\d+)-(\d+)/);
                                      if (match) {
                                        return match[2]; // Return upper bound
                                      }
                                      return t;
                                    }}
                                  />
                                  <ChartBar
                                    data={chartData}
                                    style={{
                                      data: {
                                        fill: ({ datum }) => getBarColor(datum.x, datum.y)
                                      }
                                    }}
                                  />
                                </Chart>
                                <div style={{
                                  textAlign: 'center',
                                  marginTop: '0.5rem',
                                  color: 'var(--pf-global--Color--200)'
                                }}>
                                  % of Allocatable Resource Requested
                                </div>
                              </div>
                            );
                          })()}
                        </div>
                      </div>
                    </div>
                  </CardBody>
                </Card>
              );
            })}
          </div>

          {/* Right Column - Scheduling Pressure */}
          <Card style={{ height: 'fit-content', maxHeight: '100%', overflow: 'visible' }}>
            <CardTitle style={{
              fontWeight: 'bold',
              marginBottom: '0.75rem',
              paddingBottom: '0.5rem',
              borderBottom: '1px solid var(--pf-global--BorderColor--100)'
            }}>
              Scheduling Pressure
            </CardTitle>
            <CardBody style={{ padding: '1rem' }}>
              <div style={{ marginBottom: '0.5rem' }}>
                Unscheduled Pods: <strong>{clusterStats.unscheduledPods}</strong>
              </div>
              <div style={{ marginTop: '0.5rem' }}>
                <SchedulingPressure pods={pods} showNames={showPodNames} />
              </div>

              {/* Scheduling Failures Table */}
              {schedulingFailures.length > 0 && (
                <div style={{ marginTop: '1.5rem' }}>
                  <div style={{
                    fontWeight: 'bold',
                    marginBottom: '0.5rem',
                    paddingBottom: '0.5rem',
                    borderBottom: '1px solid var(--pf-global--BorderColor--100)'
                  }}>
                    Scheduling Failures
                  </div>
                  <table style={{
                    width: '100%',
                    borderCollapse: 'collapse'
                  }}>
                    <thead>
                      <tr style={{
                        borderBottom: '2px solid var(--pf-global--BorderColor--100)',
                        textAlign: 'left'
                      }}>
                        <th style={{ padding: '0.5rem', fontWeight: 'bold' }}>Error</th>
                        <th style={{ padding: '0.5rem', fontWeight: 'bold', textAlign: 'right' }}>Count</th>
                      </tr>
                    </thead>
                    <tbody>
                      {schedulingFailures.map(([reason, count], idx) => (
                        <tr
                          key={reason}
                          style={{
                            borderBottom: idx < schedulingFailures.length - 1 ? '1px solid var(--pf-global--BorderColor--100)' : 'none'
                          }}
                        >
                          <td style={{ padding: '0.5rem', wordBreak: 'break-word' }}>{reason}</td>
                          <td style={{ padding: '0.5rem', textAlign: 'right' }}><strong>{count}</strong></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardBody>
          </Card>
        </div>
    </div>
  );
};
