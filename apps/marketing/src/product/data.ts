// The sample world every illustration shares: one fictional restaurant group
// with two locations. Names are invented; nothing here is a customer.

export const WORKSPACE = { name: "Harbor & Rye", initials: "HR" } as const;

export const LOCATIONS = {
  main: { name: "Main St", color: "#176954" },
  river: { name: "Riverside", color: "#5B7FA3" },
} as const;

export type LocationKey = keyof typeof LOCATIONS;

/** Shift types are named and colored by each workspace; these are ours. */
export const SHIFT_TYPES = {
  Opening: "#C8962B",
  Mid: "#3C7A68",
  Closing: "#5B7FA3",
  Brunch: "#B5654A",
} as const;

export type ShiftTypeName = keyof typeof SHIFT_TYPES;

export const WEEK = {
  label: "Oct 12 – Oct 18, 2026",
  days: [
    { name: "MON", date: 12 },
    { name: "TUE", date: 13 },
    { name: "WED", date: 14 },
    { name: "THU", date: 15 },
    { name: "FRI", date: 16 },
    { name: "SAT", date: 17 },
    { name: "SUN", date: 18 },
  ],
} as const;

export type Person = {
  readonly name: string;
  readonly short: string;
  readonly initials: string;
  readonly job: string;
  readonly avatar: string;
  readonly avatarInk: string;
};

export const PEOPLE = {
  alex: { name: "Alex Rivera", short: "Alex R.", initials: "AR", job: "Server", avatar: "#DBECE5", avatarInk: "#174536" },
  maya: { name: "Maya Chen", short: "Maya C.", initials: "MC", job: "Line Cook", avatar: "#E3E9F6", avatarInk: "#2F4FA3" },
  jordan: { name: "Jordan Brooks", short: "Jordan B.", initials: "JB", job: "Bartender", avatar: "#F6E7D4", avatarInk: "#7A4A08" },
  priya: { name: "Priya Patel", short: "Priya P.", initials: "PP", job: "Host", avatar: "#F3E1E6", avatarInk: "#8A2F4A" },
  sam: { name: "Sam Okafor", short: "Sam O.", initials: "SO", job: "Server", avatar: "#E4EFE3", avatarInk: "#2F5A2C" },
  lucia: { name: "Lucía Gómez", short: "Lucía G.", initials: "LG", job: "Prep Cook", avatar: "#EFE6F4", avatarInk: "#5E3A7A" },
  noah: { name: "Noah Kim", short: "Noah K.", initials: "NK", job: "Dishwasher", avatar: "#E6EEF0", avatarInk: "#2E5560" },
  taylor: { name: "Taylor Reed", short: "Taylor R.", initials: "TR", job: "Server", avatar: "#F4ECD9", avatarInk: "#6B5212" },
} as const satisfies Record<string, Person>;

export type PersonKey = keyof typeof PEOPLE;

export const TIMES = {
  opening: "9:00 AM - 3:00 PM",
  brunch: "9:00 AM - 2:00 PM",
  mid: "11:00 AM - 5:00 PM",
  closing: "4:00 PM - 11:00 PM",
  late: "5:00 PM - 12:00 AM",
} as const;
