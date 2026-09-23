"use client";
import { brand } from "@/lib/brand";
import { MapContainer, TileLayer, Marker, useMapEvents } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

function ClickToMove({ onMove }) {
  useMapEvents({
    click(e) {
      onMove(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

// A small map with a single draggable pin — for correcting a job/contact's location
// by hand when an automatic geocode lands in the wrong place entirely (e.g. matching
// a same-named street in another country). Click anywhere on the map, or drag the
// pin itself, to move it; the parent is told the new coordinates via onChange.
export default function LocationPicker({ lat, lng, onChange }) {
  const position = [lat ?? brand.defaultLat, lng ?? brand.defaultLng]; // instance default centre

  return (
    <MapContainer center={position} zoom={13} style={{ height: "260px", width: "100%", borderRadius: "8px" }}>
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <Marker
        position={position}
        draggable
        eventHandlers={{
          dragend: (e) => {
            const { lat: newLat, lng: newLng } = e.target.getLatLng();
            onChange(newLat, newLng);
          },
        }}
      />
      <ClickToMove onMove={onChange} />
    </MapContainer>
  );
}
