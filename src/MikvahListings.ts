import type { Listing } from "./Community"

const sourceOwner = "Mikvah.org public directory"
const sourceOwnerId = "public-directory-mikvah-org"
const sourceDate = "2025-02-20T00:00:00.000Z"

const createMikvahListing = ({
  id,
  name,
  address,
  city,
  zip,
  phone,
  sourceUrl,
}: {
  id: string
  name: string
  address: string
  city: string
  zip: string
  phone?: string
  sourceUrl: string
}): Listing => ({
  id: `catskills-mikvah-${id}`,
  ownerId: sourceOwnerId,
  ownerName: sourceOwner,
  type: "Mikvah",
  name,
  address,
  city,
  state: "NY",
  zip,
  mapLocation: `${address}, ${city}, NY ${zip}`,
  status: "Published",
  createdAt: sourceDate,
  updatedAt: sourceDate,
  data: {
    contactPerson: "",
    contactPhone: phone || "",
    rav: "",
    ravPhone: "",
    appointmentRequired: "Confirm before visiting",
    appointmentPhone: "",
    season: "",
    summerFrom: "",
    summerTo: "",
    summerNote: "",
    winterFrom: "",
    winterTo: "",
    winterNote: "",
    fridayHours: "",
    motzeiHours: "",
    additionalInfo:
      "Hours, appointment requirements, and seasonal availability were not provided by the public directory source. Please contact the Mikvah directly before visiting.",
    sourceLabel: "Mikvah.org public directory",
    sourceUrl,
  },
})

export const catskillsMikvahListings: Listing[] = [
  createMikvahListing({
    id: "ahavas-moshe",
    name: "Mikvah Ahavas Moshe",
    address: "87 Rose Valley Road",
    city: "Monticello",
    zip: "12701",
    phone: "917-584-2101",
    sourceUrl:
      "https://mikvah.org/mikvaos/13/ny/monticello/mikvah-ahavas-moshe",
  }),
  createMikvahListing({
    id: "ichud-hatalmidim",
    name: "Ichud HaTalmidim of Satmar",
    address: "240 Forestburgh Road",
    city: "Monticello",
    zip: "12701",
    phone: "845-791-4797",
    sourceUrl:
      "https://mikvah.org/mikvaos/1170/ny/monticello/ichud-hatalmidim-of-satmar",
  }),
  createMikvahListing({
    id: "tziporah-fallsburg",
    name: "Mikvah Tziporah Fallsburg Community Mikvah",
    address: "195 Brickman Road",
    city: "Fallsburg",
    zip: "12733",
    phone: "845-915-1200",
    sourceUrl:
      "https://mikvah.org/mikvaos/1056/ny/fallsburg/mikvah-tziporah-fallsburg-community-mikvah",
  }),
  createMikvahListing({
    id: "tahara-yisroel",
    name: "Mikvah Tahara Yisroel",
    address: "58 Hasbrouck Drive",
    city: "Woodbourne",
    zip: "12788",
    phone: "917-747-7304",
    sourceUrl:
      "https://mikvah.org/mikvaos/1095/ny/woodbourne/mikvah-tahara-yisroel",
  }),
  createMikvahListing({
    id: "taharas-israel",
    name: "Mikvah Taharas Israel",
    address: "37 Lincoln Place",
    city: "Liberty",
    zip: "12754",
    phone: "845-292-6677",
    sourceUrl:
      "https://mikvah.org/mikvaos/195/ny/liberty/mikvah-taharas-israel",
  }),
  createMikvahListing({
    id: "hadassah",
    name: "Mikvah Hadassah",
    address: "43 Olympic Lane",
    city: "Liberty",
    zip: "12754",
    sourceUrl: "https://mikvah.org/mikvaos/1246/ny/liberty/mikvah-hadassah",
  }),
  createMikvahListing({
    id: "swan-lake",
    name: "Mikvah of Swan Lake",
    address: "22 Stanton Corner Road",
    city: "Swan Lake",
    zip: "12783",
    phone: "845-292-3703",
    sourceUrl:
      "https://mikvah.org/mikvaos/761/ny/swan-lake/mikvah-of-swan-lake",
  }),
  createMikvahListing({
    id: "evergreen-estates",
    name: "Evergreen Estates Mikvah",
    address: "66 Karmel and Jacobs Road",
    city: "Loch Sheldrake",
    zip: "12759",
    phone: "917-420-0041",
    sourceUrl:
      "https://mikvah.org/mikvaos/938/ny/loch-sheldrake/evergreen-estates-mikvah",
  }),
  createMikvahListing({
    id: "woodridge",
    name: "Mikvah of Woodridge",
    address: "Maple Avenue",
    city: "Woodridge",
    zip: "12789",
    phone: "845-434-4987",
    sourceUrl:
      "https://mikvah.org/mikvaos/225/ny/woodridge/mikvah-of-woodridge",
  }),
]
