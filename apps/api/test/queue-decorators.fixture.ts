// Explicit Nest injection decorator fixture; do not shadow the real bullmq package.
export const InjectQueue =
  (_queueName: string): ParameterDecorator =>
  () =>
    undefined;
export const getQueueToken = (queueName: string) => `Queue_${queueName}`;
export const JOB_REF = Symbol("JOB_REF");
