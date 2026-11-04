/** Publicly sourced shuls. Service times should be confirmed with each shul. */
export type SourcedShul = {
  id: string
  name: string
  address: string
  phone?: string
  source: string
  sourceLabel: string
  photo: string
  photoSource: string
  photoAuthor: string
  photoYear: string
}

export const catskillsShuls: SourcedShul[] = [
  {
    id: "woodbourne-bnai-israel",
    name: "B'nai Israel — The Woodbourne Shul",
    address: "457 State Route 52, Woodbourne, NY 12788",
    phone: "646-256-4049",
    source: "https://www.thewoodbourneshul.com/contact",
    sourceLabel: "Shul website",
    photo:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/4/42/B%27nai_Israel_Synagogue%2C_Woodbourne_NY.JPG/960px-B%27nai_Israel_Synagogue%2C_Woodbourne_NY.JPG",
    photoSource:
      "https://commons.wikimedia.org/wiki/File:B%27nai_Israel_Synagogue,_Woodbourne_NY.JPG",
    photoAuthor: "Vonsky87",
    photoYear: "2013",
  },
  {
    id: "ohave-shalom-woodridge",
    name: "Ohave Shalom — Woodridge Shul",
    address: "14 Maurice Rose Street, Woodridge, NY 12789",
    source:
      "https://dafyomidirectory.org/shiur-location/woodridge-shul-ohave-shalom/",
    sourceLabel: "Listing source",
    photo:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/5/5c/Congregation_Ohave_Shalom%2C_Woodridge%2C_NY.jpg/960px-Congregation_Ohave_Shalom%2C_Woodridge%2C_NY.jpg",
    photoSource:
      "https://commons.wikimedia.org/wiki/File:Congregation_Ohave_Shalom,_Woodridge,_NY.jpg",
    photoAuthor: "Daniel Case",
    photoYear: "2008",
  },
  {
    id: "agudas-achim-livingston-manor",
    name: "Congregation Agudas Achim",
    address: "587 Old Route 17, Livingston Manor, NY 12758",
    phone: "845-439-3600",
    source: "https://congregationagudasachim.org/directions/",
    sourceLabel: "Shul website",
    photo:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/5/51/Congregation_Agudas_Achim%2C_Livingston_Manor%2C_NY.jpg/960px-Congregation_Agudas_Achim%2C_Livingston_Manor%2C_NY.jpg",
    photoSource:
      "https://commons.wikimedia.org/wiki/File:Congregation_Agudas_Achim,_Livingston_Manor,_NY.jpg",
    photoAuthor: "Daniel Case",
    photoYear: "2008",
  },
]
