declare module "node-internet-radio" {
  export type StationInfo = {
    artist?: string;
    bitrate?: number;
    genre?: string;
    listeners?: number;
    song?: string;
    title?: string;
    [key: string]: unknown;
  };

  const internetRadio: {
    getStationInfo(
      url: string,
      callback: (error: Error | null, station: StationInfo) => void
    ): void;
  };

  export default internetRadio;
}
