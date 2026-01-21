import React from 'react';
import { formatMemory } from './utils';

// Effective CPU Bar Component (max of requests and limits)
export const EffectiveCPUBar: React.FC<{
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
        backgroundColor: 'var(--pf-v5-global--palette--black-400, var(--pf-global--palette--black-400, #d2d2d2))',
        borderRadius: '2px',
        overflow: 'hidden',
        position: 'relative',
        border: '1px solid var(--pf-global--BorderColor--100)'
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
export const EffectiveMemoryBar: React.FC<{
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
        backgroundColor: 'var(--pf-v5-global--palette--black-400, var(--pf-global--palette--black-400, #d2d2d2))',
        borderRadius: '2px',
        overflow: 'hidden',
        position: 'relative',
        border: '1px solid var(--pf-global--BorderColor--100)'
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
export const GenericResourceBar: React.FC<{
  total: number;
  used: number;
  nodeName: string;
  label: string;
  formatValue: (value: number) => string;
  hoveredValue?: number;
}> = ({ total, used, nodeName, label, formatValue, hoveredValue }) => {
  const percentageUsed = total > 0 ? Math.min((used / total) * 100, 100) : 0;
  const hoveredPercentage = hoveredValue && total > 0 ? Math.min((hoveredValue / total) * 100, 100) : 0;

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
        backgroundColor: 'var(--pf-v5-global--palette--black-400, var(--pf-global--palette--black-400, #d2d2d2))',
        borderRadius: '2px',
        overflow: 'hidden',
        position: 'relative',
        border: '1px solid var(--pf-global--BorderColor--100)'
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
        {/* Overlay for hovered pod */}
        {hoveredValue && hoveredValue > 0 && (
          <div
            style={{
              position: 'absolute',
              left: 0,
              top: 0,
              width: `${hoveredPercentage}%`,
              height: '100%',
              backgroundColor: 'rgba(236, 100, 75, 0.5)',
              border: '2px solid #EC644B',
              boxSizing: 'border-box',
              pointerEvents: 'none',
              transition: 'width 0.2s ease'
            }}
            title={`Hovered pod: ${formatValue(hoveredValue)} (${hoveredPercentage.toFixed(1)}%)`}
          />
        )}
      </div>
    </div>
  );
};
