import { MapRenderer, type MapRendererProps } from './GoogleMapView';

export type NeighborhoodSelectionMapProps = Pick<
  MapRendererProps,
  | 'language'
  | 'locationId'
  | 'selectedNeighborhoods'
  | 'highlightedNeighborhood'
  | 'onNeighborhoodClick'
  | 'onNeighborhoodHover'
>;

const EMPTY_MARKERS: MapRendererProps['markers'] = [];
const EMPTY_SAVED_IDS = new Set<string>();
const ignoreMarkerClick = () => undefined;

export function NeighborhoodSelectionMap(props: NeighborhoodSelectionMapProps) {
  return (
    <MapRenderer
      {...props}
      showAllNeighborhoods
      showNeighborhoodLabels={false}
      markers={EMPTY_MARKERS}
      selectedMarkerId={null}
      savedIds={EMPTY_SAVED_IDS}
      onMarkerClick={ignoreMarkerClick}
    />
  );
}