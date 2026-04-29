export interface ConfigMap {
  baseVelocity:     string;
  initialScore:     string;
  timeBonusEnabled: string;
  penaltyRate:      string;
}

export interface Competitor {
  id:          number;
  name:        string;
  score:       number;
  time_ms:     number;
  time_bonus:  number;
  final_score: number;
  eliminated:  boolean | number;
  created_at:  string;
}
