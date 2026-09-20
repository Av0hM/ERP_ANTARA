export const InjectQueue = (queueName: string) => (target: any, propertyKey: string) => {
  // Mock decorator
};

export const getQueueToken = (queueName: string) => `Queue_${queueName}`;

export const JOB_REF = Symbol("JOB_REF");