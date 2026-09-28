export type LocationType = 'stop' | 'border';

export interface Location {
  id: string;
  type: LocationType;
  name: string;
  lat: number;
  lng: number;
  /** Path under public/img, e.g. "img/tofo.jpg". Optional until seed images exist. */
  image?: string;
  description: string;
  notes: string;
  /** Border posts only. */
  documents?: string;
  fees?: string;
  hours?: string;
  /** Optional waypoints ([lng, lat]) to steer the router on the leg *arriving* at this location. */
  via?: [number, number][];
  /**
   * Optional [lng, lat] where routing for the *departing* leg starts, for pins whose own
   * road is disconnected in OSM (park gates, causeways). A straight stub joins pin -> exit.
   */
  routeExit?: [number, number];
}

/** Fields a member may override locally. */
export type EditableField = 'name' | 'description' | 'notes' | 'lat' | 'lng';
export type LocationOverride = Partial<Pick<Location, EditableField>>;
export type Overrides = Record<string, LocationOverride>;

export interface MergedLocation extends Location {
  modified: boolean;
  /** True if lat/lng differ from seed; affects adjacent legs. */
  moved: boolean;
}

export type LegSource = 'routed' | 'estimated';

/** Precomputed at build time by scripts/route.ts. */
export interface PrecomputedLeg {
  fromId: string;
  toId: string;
  distanceKm: number;
  /** [lng, lat] pairs. */
  geometry: [number, number][];
}

export interface Leg {
  index: number;
  fromId: string;
  toId: string;
  distanceKm: number;
  source: LegSource;
  geometry: [number, number][];
}
