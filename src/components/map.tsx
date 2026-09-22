"use client";
import dynamic from "next/dynamic";
import type { Location, SLS } from "@/lib/data";
export type PolygonPoint = [number, number];
export type MapProps = {
  markers: Location[];
  sls: SLS[];
  center?: [number, number];
  userLocation?: [number, number] | null;
  zoom?: number;
  selected?: string;
  liveLocationIds?: string[];
  onSelect?: (location: Location) => void;
  onMapClick?: (lat: number, lng: number) => void;
  resetKey?: number;
  boundaries?: boolean;
  polygon?: PolygonPoint[];
  polygonEditable?: boolean;
  onPolygonChange?: (points: PolygonPoint[]) => void;
};
const LeafletProvider = dynamic(() => import("./map-leaflet"), {
  ssr: false,
  loading: () => (
    <div className="map-loading">
      <span className="loader" />
      Menyiapkan peta…
    </div>
  ),
});
export default function Map(props: MapProps) {
  return <LeafletProvider {...props} />;
}
