# Data licenses

The app's code is this repository's. The data files in `js/data/` are built from outside sources by
`tools/build-data.mjs`, and each keeps its source in a header comment. Credits are shown in the
app's About panel.

| File | Source | License |
| --- | --- | --- |
| `js/data/stars.mjs` | Yale Bright Star Catalog, 5th revised edition (Hoffleit and Warren 1991), as distributed by NASA HEASARC (`heasarc_bsc5p`) | US Government work, public domain per data.gov's listing of the HEASARC copy |
| `js/data/names.mjs` NAMES | IAU Catalog of Star Names, Working Group on Star Names, edition of 2022-04-04 | CC BY (IAU) |
| `js/data/names.mjs` DIST | Hipparcos, the New Reduction (van Leeuwen 2007), VizieR catalog I/311, through the CDS TAP service | Free for use with a citation to the catalog and to CDS |
| `js/data/names.mjs` BAYER | Yale Bright Star Catalog, as above | As above |
| `js/data/lines.mjs` | Stellarium sky cultures, `western` culture, `index.json` at commit 92df9e4c (2024-05-17), Hipparcos ids converted to HR numbers through the Hipparcos main catalog's HD column (VizieR I/239) | CC BY-SA (the culture's description.md: "Text and data: CC BY-SA"; version not stated by the source). This file keeps that license. |
| `js/data/cities.mjs` | GeoNames `cities15000` dump, downloaded 2026-10-22 | CC BY 4.0 |
| `js/data/land.mjs` | Natural Earth 1:110m land, `ne_110m_land.geojson` | Public domain |
| `js/vendor/astronomy.browser.min.js` | Astronomy Engine 2.1.19 by Don Cross | MIT, header kept in the file |
| `js/menu-search.js` | MYTEK Lab shared menu search | This repository's license |

Star names, constellation names and their IAU abbreviations are facts. The constellation label
points and the asterism lists are computed from the figures above.
