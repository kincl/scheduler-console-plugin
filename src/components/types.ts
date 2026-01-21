export interface NodeCondition {
  type: string;
  status: string;
  reason?: string;
  message?: string;
  lastTransitionTime?: string;
}

export interface NodeType {
  metadata: {
    name: string;
    uid: string;
    labels?: {
      [key: string]: string;
    };
  };
  status: {
    capacity: {
      [key: string]: string;
    };
    conditions?: NodeCondition[];
  };
}

export interface PodCondition {
  type: string;
  status: string;
  reason?: string;
  message?: string;
  lastTransitionTime?: string;
}

export interface PodType {
  metadata: {
    name: string;
    uid: string;
    namespace: string;
  };
  spec: {
    nodeName?: string;
    containers: Array<{
      resources?: {
        requests?: {
          [key: string]: string;
        };
        limits?: {
          [key: string]: string;
        };
      };
    }>;
  };
  status: {
    phase: string;
    conditions?: PodCondition[];
  };
}

export interface NamespaceType {
  metadata: {
    name: string;
    uid: string;
  };
}

export interface EventType {
  metadata: {
    name: string;
    namespace?: string;
    creationTimestamp: string;
  };
  reason?: string;
  message?: string;
  type?: string;
  involvedObject?: {
    kind: string;
    name: string;
    namespace?: string;
  };
  firstTimestamp?: string;
  lastTimestamp?: string;
  count?: number;
}
