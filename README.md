# Hane Puzzle Generator

Turn a student's drawing of an animal into a 3D-printable jigsaw puzzle, right in the browser.

1. **Sketch**: upload a photo of the drawing or draw in the app.
2. **Puzzle**: choose how many pieces; the outline is tidied and split into interlocking pieces.
3. **Print**: download a 3 mm-thick STL sized for a Bambu Lab A1 mini, and watch a realistic preview of it printing.

Built for teacher-led classrooms (ages 5-16). Runs entirely in the browser, so drawings never leave the device. Hosted on GitHub Pages.

> **Status:** early scaffold. The three-step shell runs; drawing, puzzle and print features are still to come. See [tasks/todo.md](tasks/todo.md) for the roadmap.

## Documentation

| File                                             | What it covers                                                          |
| ------------------------------------------------ | ----------------------------------------------------------------------- |
| [docs/PRD.md](docs/PRD.md)                       | Purpose, users, features (MoSCoW), constraints, success criteria, risks |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)     | Pipeline, stack, conventions, hard parts, deployment, testing           |
| [docs/DESIGN.md](docs/DESIGN.md)                 | Visual style, colour, type, layout, accessibility                       |
| [docs/PRINTER_MODEL.md](docs/PRINTER_MODEL.md)   | Task spec for the realistic A1 mini model                               |
| [docs/DECISIONS.md](docs/DECISIONS.md)           | Decision log                                                            |
| [docs/OPEN_QUESTIONS.md](docs/OPEN_QUESTIONS.md) | Clarifying questions and assumed defaults                               |
| [tasks/todo.md](tasks/todo.md)                   | Milestones and progress tracking                                        |
| [tasks/lessons.md](tasks/lessons.md)             | Lessons learned from corrections                                        |
| [CLAUDE.md](CLAUDE.md)                           | Guidance for Claude Code                                                |

## Development

Requires Node 22+.

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # unit tests
npm run lint
npm run build    # output in dist/
```

The `.github/workflows/deploy.yml` workflow lints, tests, builds and deploys to GitHub Pages on every push to `main`. In the repo settings, set Pages source to "GitHub Actions".

## Printing tips (to be validated on hardware)

Default gap between pieces is 0.3 mm. If pieces fuse or fit too tightly, adjust the clearance in Teacher mode and re-export. Slice in Bambu Studio with 0.2 mm layers, PLA.
