"use client";
import { brand } from "@/lib/brand";
import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import Link from "next/link";

// Leaflet's default marker icons reference image files in a way that breaks under
// Next.js bundling — point them at a CDN instead so pins actually render.
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

export default function LeafletMap({ jobs }) {
  const center = jobs.length
    ? [jobs[0].lat, jobs[0].lng]
    : [brand.defaultLat, brand.defaultLng]; // instance default centre

  return (
    <MapContainer center={center} zoom={jobs.length ? 11 : 9} style={{ height: "100%", width: "100%" }}>
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {jobs.map((job) => (
        <Marker key={job.id} position={[job.lat, job.lng]}>
          <Popup>
            <div className="text-sm">
              <div className="font-semibold">{job.title}</div>
              <div className="text-xs text-gray-500">{job.contacts?.name}</div>
              {job.address && <div className="text-xs text-gray-500">{job.address}</div>}
              <div className="text-xs uppercase mt-1">{job.status?.replace("_", " ")}</div>
              <Link href={`/jobs/${job.id}`} className="text-xs text-blue-600 underline">
                Open job →
              </Link>
            </div>
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}
