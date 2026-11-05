'use client';
import { CircleMarker, MapContainer, TileLayer, Tooltip } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';

/** Village-level only. Exact plot coordinates stay off-chain (contract non-negotiable 3). Tiles: OpenStreetMap, with the required attribution. */
export default function OriginMap({ lat, lon, label }: { lat: number; lon: number; label: string }) {
  return (
    <MapContainer center={[lat, lon]} zoom={11} scrollWheelZoom={false} style={{ height: 260, width: '100%' }} aria-label={`Map of ${label}`}>
      <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' url="https://tile.openstreetmap.org/{z}/{x}/{y}.png" />
      <CircleMarker center={[lat, lon]} radius={9} pathOptions={{ color: '#24432F', fillColor: '#A67C52', fillOpacity: 0.9, weight: 3 }}>
        <Tooltip permanent direction="top" offset={[0, -8]}>{label}</Tooltip>
      </CircleMarker>
    </MapContainer>
  );
}
