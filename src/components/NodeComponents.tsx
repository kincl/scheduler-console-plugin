import React from 'react';
import { Label } from '@patternfly/react-core';
import { NodeType } from './types';
import { getNodeRoles } from './utils';

// Node Roles Component
export const NodeRoles: React.FC<{ node: NodeType }> = ({ node }) => {
  const roles = getNodeRoles(node);

  if (roles.length === 0) {
    return null;
  }

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: '0.5rem',
      marginLeft: '0.5rem'
    }}>
      {roles.map(role => (
        <Label
          key={role}
          color="blue"
          style={{ fontSize: '0.7rem' }}
        >
          {role}
        </Label>
      ))}
    </div>
  );
};

// Node Conditions Component
export const NodeConditions: React.FC<{ node: NodeType }> = ({ node }) => {
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
