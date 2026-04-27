# Galaxy kNN Browser

Interactive nearest-neighbor browser for the Galaxy Zoo 2 / SDSS image cutouts.
Pick any galaxy and step through its 100 nearest neighbors in the
`joint_V_avg_annuli` signature space.

## Open the app

> **https://hamidmath.github.io/Galaxies/**

## How to use it

- **Pick a query** — type or pick an object id from the dropdown, then press
  **Show query** (or hit Enter). On every page load a random galaxy is
  selected automatically.
- **Filters** narrow the *query pool* by morphology label, smooth /
  featured probabilities, or image resolution. Filters do *not* affect
  which neighbors are returned — those are always drawn from all
  239,698 objects.
- **Step through neighbors** with the **← / →** keys, or the Prev / Next
  buttons. The query is shown on the left (red border), the current
  neighbor on the right (blue border).
- **Circle: ON / OFF** toggles the blue inscribed circle that marks the
  signature aperture.
- **Save PNG** downloads a single image of the current query + neighbor
  pair.
- **Export neighbors (json)** downloads a JSON file with the top-K
  neighbors (1–100) — id, distance, label, smooth/featured probabilities,
  resolution, and the 300-d signature vector for the query and each
  neighbor. Use it for downstream analysis.

## Contact

- Hamid Shafieasl — u1527161@utah.edu — https://hamidmath.github.io/
- Jeff M. Phillips (Advisor) — jeff.m.phillips@utah.edu — https://users.cs.utah.edu/~jeffp/

Kahlert School of Computing, University of Utah.

## License

MIT — see [LICENSE](LICENSE).
