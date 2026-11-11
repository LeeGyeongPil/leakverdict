export const SCENARIOS = ['buffer', 'jsobj', 'handle', 'churn', 'idle', 'release'] as const;
export type Scenario = (typeof SCENARIOS)[number];
