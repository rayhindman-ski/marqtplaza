import { MapRenderer, type MapRendererProps } from './GoogleMapView';

export type DiscoveryResultsMapProps = Omit<MapRendererProps, 'showAllNeighborhoods'>;

export function DiscoveryResultsMap(props: DiscoveryResultsMapProps) {
  return <MapRenderer {...props} showAllNeighborhoods />;
}