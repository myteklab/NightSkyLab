# Night Sky Lab

The sky from the ground, for a picked city and a picked night: the bright stars, the Moon in its
phase, the planets that are up, a ground line and compass letters. A student finds the Big Dipper,
drags the Pointers to Polaris, turns the clock and watches the sky wheel, turns the calendar and
watches the seasons change the stars, then plans a real night out and keeps a log of what was seen.

No build step. Open `index.html` from a web server.

    node test-sky.mjs      the math against JPL Horizons rows, Polaris at the latitude, phases, the data
    node test-dom.mjs      the real page in jsdom: the first minute, every screen, the save shape
    ./bump.sh N            stamp a new cache version on every module import

## How it is put together

`js/sky.mjs` is the model. It unpacks the star catalog, turns a place and an instant into one
rotation matrix (Astronomy Engine's J2000 to horizontal), and gives back horizontal vectors for
every star, the Sun, Moon and planets, rise and set times, phases and the local clock. Nothing
measured is saved: the project keeps the place (rounded to whole degrees), the date and time, what
the student found and did, the plan, the log and the tour, and everything else is worked out again
on load.

`js/draw.mjs` paints a horizontal vector field on a canvas: stereographic around the view
direction, a horizon circle with a treeline, glow sprites per magnitude bin, the Moon with its lit
side toward the Sun. `js/cards.mjs` writes the card for whatever was tapped. `js/guide.mjs` is the
first minute and the tour player. `js/screens.mjs` is every dialog.

Data in `js/data/` is built by `tools/build-data.mjs` from the sources listed in each file's
header; see `DATA-LICENSES.md`. The app never calls the network after load and never asks for the
device location.
