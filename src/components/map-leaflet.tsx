"use client";
import L from "leaflet";
import "leaflet.markercluster";
import "leaflet.markercluster/dist/MarkerCluster.css";
import "leaflet/dist/leaflet.css";
import { useEffect } from "react";
import {
    MapContainer,
    Polygon,
    TileLayer,
    useMap,
    useMapEvents,
} from "react-leaflet";
import type { MapProps, PolygonPoint } from "./map";
function Content({
  markers,
  sls,
  selected,
  liveLocationIds,
  onSelect,
  onMapClick,
  center,
  userLocation,
  polygon,
  polygonEditable,
  onPolygonChange,
  resetKey,
  fitPoints,
}: MapProps) {
  const map = useMap();
  useEffect(() => {
    const observer = new ResizeObserver(() => map.invalidateSize());
    observer.observe(map.getContainer());
    return () => observer.disconnect();
  }, [map]);
  useMapEvents({
    click: (e) => {
      if (polygonEditable && onPolygonChange) {
        onPolygonChange([...(polygon || []), [e.latlng.lat, e.latlng.lng]]);
      } else onMapClick?.(e.latlng.lat, e.latlng.lng);
    },
  });
  useEffect(() => {
    const group = L.markerClusterGroup({
      maxClusterRadius: 36,
      disableClusteringAtZoom: 15,
      showCoverageOnHover: false,
      iconCreateFunction: (c) =>
        L.divIcon({
          html: `<span>${c.getChildCount()}</span>`,
          className: "map-cluster",
          iconSize: [38, 38],
        }),
    });
    markers.forEach((loc) => {
      const color =
        sls.find((s) => s.id === loc.sls_id)?.marker_color || "#238c6d";
      const icon = L.divIcon({
        className: "custom-pin",
        html: `<div class="pin ${selected === loc.id ? "pin-selected" : ""} ${liveLocationIds?.includes(loc.id) ? "pin-live" : ""}" style="--pin-color:${color}"><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="m3 10 9-7 9 7v10H3Z"/><path d="M9 20v-7h6v7"/></svg></div>`,
        iconSize: [34, 42],
        iconAnchor: [17, 40],
      });
      const marker = L.marker([loc.latitude, loc.longitude], {
        icon,
        title: loc.title,
        alt: loc.title,
      });
      const box = document.createElement("div");
      const title = document.createElement("strong");
      title.textContent = loc.title;
      box.append(title);
      const sub = document.createElement("p");
      sub.textContent = sls.find((s) => s.id === loc.sls_id)?.code || "";
      box.append(sub);
      const button = document.createElement("button");
      button.textContent = "Lihat detail →";
      button.className = "popup-link";
      button.onclick = () => onSelect?.(loc);
      box.append(button);
      marker.bindPopup(box);
      group.addLayer(marker);
    });
    map.addLayer(group);
    return () => {
      map.removeLayer(group);
    };
  }, [markers, sls, selected, liveLocationIds, onSelect, map]);
  useEffect(() => {
    if (center) map.flyTo(center, 16, { duration: 0.6 });
  }, [center, map]);
  useEffect(() => {
    if (!userLocation) return;
    const icon = L.divIcon({
      className: "user-location-icon",
      html: '<span class="user-location-pulse"></span><span class="user-location-dot"></span>',
      iconSize: [30, 30],
      iconAnchor: [15, 15],
    });
    const marker = L.marker(userLocation, {
      icon,
      title: "Lokasi Anda",
      alt: "Lokasi Anda",
      zIndexOffset: 1000,
    }).addTo(map);
    marker.bindTooltip("Lokasi Anda", { direction: "top", offset: [0, -12] });
    return () => {
      map.removeLayer(marker);
    };
  }, [userLocation, map]);
  useEffect(() => {
    if (!polygonEditable || !onPolygonChange) return;
    const points = polygon || [];
    const layer = L.layerGroup().addTo(map);
    if (points.length >= 2) {
      L.polygon(points, {
        color: "#21846a",
        weight: 2,
        fillOpacity: 0.16,
        dashArray: "6 5",
      }).addTo(layer);
    }
    points.forEach((point, index) => {
      const handle = L.marker(point, {
        draggable: true,
        icon: L.divIcon({
          className: "polygon-handle",
          html: "<span></span>",
          iconSize: [18, 18],
          iconAnchor: [9, 9],
        }),
        title: `Titik poligon ${index + 1}`,
      }).addTo(layer);
      handle.on("dragend", () => {
        const position = handle.getLatLng();
        onPolygonChange(
          points.map((value, i) =>
            i === index
              ? ([position.lat, position.lng] as PolygonPoint)
              : value,
          ),
        );
      });
    });
    return () => {
      layer.removeFrom(map);
    };
  }, [polygon, polygonEditable, onPolygonChange, map]);
  useEffect(() => {
    if (!resetKey) return;
    const bounds = fitPoints?.length
      ? L.latLngBounds(fitPoints)
      : markers.length
        ? L.latLngBounds(markers.map((m) => [m.latitude, m.longitude]))
        : ([
            [-6.2, 106.82],
            [-6.17, 106.85],
          ] as [number, number][]);
    map.fitBounds(bounds, { padding: [55, 55] });
  }, [resetKey, map, markers, fitPoints]);
  useEffect(() => {
    const control = L.control.zoom({ position: "topright" });
    control.addTo(map);
    return () => {
      control.remove();
    };
  }, [map]);
  return null;
}
export default function LeafletMap(props: MapProps) {
  return (
    <MapContainer
      center={props.center || [-6.184, 106.837]}
      zoom={props.zoom || 15}
      zoomControl={false}
      className="leaflet-map"
      scrollWheelZoom
    >
      <TileLayer
        url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution={
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        }
        maxZoom={19}
      />
      {props.boundaries &&
        props.sls
          .filter((region) => (region.boundary || []).length >= 3)
          .map((region) => (
            <Polygon
              key={region.id}
              positions={region.boundary!}
              pathOptions={{
                color: region.marker_color,
                weight: 2,
                dashArray: "6 7",
                fillColor: region.marker_color,
                fillOpacity: 0.09,
              }}
            />
          ))}
      <Content {...props} />
    </MapContainer>
  );
}
