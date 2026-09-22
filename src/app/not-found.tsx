import Link from "next/link";
import { MapPin } from "lucide-react";
export default function NotFound() {
  return (
    <main className="not-found">
      <MapPin size={42} />
      <h1>Lokasi tidak ditemukan.</h1>
      <p>Lokasi ini mungkin sudah dihapus atau tautannya tidak sesuai.</p>
      <Link className="primary" href="/">
        Kembali ke peta
      </Link>
    </main>
  );
}
