export type RootStackParamList = {
  Home: undefined;
  Drive: {
    name: string;
    raceId: number;
  };
  Results: {
    name: string;
    raceId: number;
    score: number;
    time_ms: number;
    time_bonus: number;
    eliminated: boolean;
  };
};
