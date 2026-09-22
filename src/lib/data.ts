export type SLS = {
  id: string;
  code: string;
  name: string;
  description: string;
  marker_color: string;
  is_active: boolean;
  boundary?: [number, number][];
};
export type Location = {
  id: string;
  sls_id: string;
  title: string;
  address: string;
  description: string;
  latitude: number;
  longitude: number;
  status: string;
  image_url?: string;
  visits: number;
};
export type Comment = {
  id: string;
  location_id: string;
  name: string;
  comment: string;
  status: string;
  created_at: string;
};
export const seedSls: SLS[] = [
  {
    id: "sls-001",
    code: "SLS-001",
    name: "Gondangdia",
    description: "RW 01 · Kelurahan Gondangdia",
    marker_color: "#238c6d",
    is_active: true,
  },
  {
    id: "sls-002",
    code: "SLS-002",
    name: "Cikini",
    description: "RW 02 · Kelurahan Cikini",
    marker_color: "#638cda",
    is_active: true,
  },
  {
    id: "sls-003",
    code: "SLS-003",
    name: "Menteng",
    description: "RW 03 · Kelurahan Menteng",
    marker_color: "#e7a64c",
    is_active: true,
  },
  {
    id: "sls-004",
    code: "SLS-004",
    name: "Kebon Sirih",
    description: "RW 04 · Kelurahan Kebon Sirih",
    marker_color: "#a17ac5",
    is_active: true,
  },
];
const names = [
  "Rumah Bapak Ahmad",
  "Rumah Ibu Siti",
  "Warung Pak Budi",
  "Rumah Bapak Hendra",
  "Rumah Ibu Ratna",
  "Rumah Bapak Adi",
  "Toko Sembako Berkah",
  "Rumah Ibu Dewi",
  "Rumah Bapak Surya",
  "Rumah Ibu Lestari",
  "Rumah Bapak Dedi",
  "Rumah Ibu Rina",
  "Rumah Bapak Fajar",
  "Rumah Ibu Ningsih",
  "Rumah Bapak Joko",
  "Rumah Ibu Wati",
  "Rumah Bapak Hasan",
  "Rumah Ibu Maya",
  "Rumah Bapak Arif",
  "Rumah Ibu Lina",
  "Rumah Bapak Eko",
  "Rumah Ibu Yuni",
  "Rumah Bapak Agus",
  "Rumah Ibu Tuti",
];
export const seedLocations: Location[] = names.map((title, i) => ({
  id: `lok-${String(i + 1).padStart(3, "0")}`,
  sls_id: seedSls[i % 4].id,
  title,
  address: `Jl. ${["Cemara", "Cikini Raya", "Teuku Umar", "Kebon Sirih"][i % 4]} No. ${12 + i}, Menteng`,
  description:
    "Lokasi pendataan sensus di Kecamatan Menteng, Jakarta Pusat. Gunakan informasi lokasi ini untuk membantu kunjungan lapangan.",
  latitude: -6.1835 + Math.sin(i * 2.4) * 0.0105,
  longitude: 106.8365 + Math.cos(i * 1.8) * 0.013,
  status: i % 3 === 0 ? "visited" : "unvisited",
  visits: i % 3 === 0 ? 1 : 0,
}));
