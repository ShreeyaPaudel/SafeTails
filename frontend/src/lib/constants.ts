export const MAP_CENTER: [number, number] = [
  Number(process.env.NEXT_PUBLIC_MAP_CENTER_LAT ?? 27.7172),
  Number(process.env.NEXT_PUBLIC_MAP_CENTER_LNG ?? 85.324),
];

export const SPECIES = ["Dog", "Cat", "Cow", "Buffalo", "Other", "Unverified"] as const;

export const SPECIES_COLOR: Record<string, string> = {
  Dog: "#2563eb",
  Cat: "#db2777",
  Cow: "#16a34a",
  Buffalo: "#7c3aed",
  Other: "#64748b",
  Unverified: "#9ca3af",
};

export const STATUS_LABEL: Record<string, string> = {
  active: "Active",
  being_helped: "Being helped",
  resolved: "Resolved",
};
