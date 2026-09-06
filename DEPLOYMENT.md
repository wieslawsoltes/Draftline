# GitHub Pages deployment

Repository: https://github.com/wieslawsoltes/Draftline

Site URL: https://wieslawsoltes.github.io/Draftline/

Standalone HTML URL: https://wieslawsoltes.github.io/Draftline/Draftline.html

Workflow: [.github/workflows/pages.yml](.github/workflows/pages.yml)

## Initial repository setting

GitHub Pages must be enabled for this repository with **GitHub Actions** as its publishing source. Open **Settings > Pages > Build and deployment > Source > GitHub Actions**:

https://github.com/wieslawsoltes/Draftline/settings/pages

The workflow attempts automatic Pages enablement. GitHub may reject that operation because the built-in workflow token cannot administer the repository's initial Pages settings. In that case, select the publishing source above and rerun the failed jobs under **Actions > Deploy Draftline to GitHub Pages**. This is a one-time repository configuration, not an application or build failure.

No custom secrets, hosting credentials, runtime services, CDN dependencies, or paid hosting are required after this setting is configured.

## Continuous integration and publishing

Pushes to `main` run syntax checks, all Node.js geometry/DXF tests, and the Python standard-library-only standalone HTML build. A separate deployment job publishes the resulting Pages artifact. Pull requests run the same build and tests but never deploy. `workflow_dispatch` permits a manual deployment of `main` from the Actions tab.

The build job has read-only repository access. Only the deployment job receives `pages: write` and `id-token: write`, and deployment is recorded in the `github-pages` environment. Deployments are serialized per branch and an in-progress deployment is not canceled by a later push.

Only these files are staged in `_site/`:

- `index.html`, `style.css`, and `src/`: modular CAD application, including the DXF worker.
- `Draftline.html`: rebuilt, self-contained application.
- `samples/`: original DXF and Draftline project examples.
- `LICENSE`, `THIRD_PARTY_NOTICES.md`, `.nojekyll`, and `version.json`.

Tests, build tools, source-transfer files, and repository metadata are not published as site assets. All application asset paths are relative, so the application works beneath the `/Draftline/` project-site prefix. `version.json` records the deployed source commit and repository.

## Local verification

```sh
npm test
python3 tools/build-single.py
python3 -m http.server 8765
```

Open http://localhost:8765/ for modular development or http://localhost:8765/Draftline.html for the bundled version. Node.js 22 is used by CI. No `npm install` is needed for the core test suite or application.

The original browser interaction and independent DXF validation reports remain in `tests/`. They document the initial implementation's validation; the Pages workflow reruns core tests and build checks, not hardware WebGPU benchmarks or the optional Playwright/ezdxf suites.

## Rendering and local data

GitHub Pages serves the site over HTTPS, satisfying WebGPU's secure-context requirement. A compatible browser and available GPU adapter are still necessary. Canvas 2D remains the fallback; `?fallback=1` explicitly selects it.

Drawings are edited locally in the browser and autosaved in that origin's `localStorage`. The published site has no drawing-upload backend. Export a project or DXF file to retain a separate copy, and keep original DXF input files because not every DXF entity or extension is preserved.

## Reference

- [Configuring a GitHub Pages publishing source](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)
- [Using custom GitHub Pages workflows](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)
