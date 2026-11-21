export interface HostRules {
  readonly pauseWhenHidden: boolean;
  readonly stillPage: boolean;
  readonly menuKeys: readonly string[];
}

export const HOST: HostRules = {
  pauseWhenHidden: false,
  stillPage: false,
  menuKeys: [],
};
