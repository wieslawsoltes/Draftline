# Draftline

A dependency-free, local-first **2D CAD editor** built with plain HTML, CSS, JavaScript, and a WebGPU-first line renderer. The interface follows familiar browser CAD workflows: drawing ribbon, layer manager, property inspector, model-space canvas, grips, precision command line, and drafting toggles.

This is an independent implementation. It is not Autodesk software, an AutoCAD-compatible SDK, or a claim of complete AutoCAD feature parity.

## Run

**Self-contained distribution:** open `Draftline.html` in a desktop browser. All application code, CSS, icons, the sample drawing, and the DXF worker are embedded. Nothing is fetched from a CDN. Some browsers restrict local-file GPU access or storage; use a local server for the most predictable behavior.

**Modular development version:** from this directory:

```sh
python3 -m http.server 8765
```

Open `http://localhost:8765/`. No dependency installation or JavaScript build step is required. The modular entry point is `index.html`.

WebGPU requires a supporting browser, an available adapter, and a secure context. Serve a deployed copy over HTTPS; localhost is suitable for development. The renderer falls back to Canvas 2D when WebGPU cannot initialize or the device is lost. The bottom-right badge reports the backend **actually in use**, not an assumed capability. Append `?fallback=1` to force the Canvas 2D path.

The application starts with **Meridian House**, an original, editable floor plan containing 308 model-space entities on 10 application layers. A real DXF export and a Draftline project copy are included in `samples/`.

## Implemented workflows

### Drawing and precision

Draw lines, open/closed polylines, rectangles, circles, three-point arcs, ellipses, regular polygons, text, multiline text, and linear/aligned dimensions. Apply diagonal hatching to selected closed polylines or circles. Insert editable door, desk, chair, and tree symbols.

Object snapping includes endpoints, midpoints, centers, quadrants, insertion points, spline control points, and intersections between nearby LINE entities. Orthographic input, temporary Shift constraints, optional grid snapping, and dynamic cursor coordinates are provided.

The command line accepts exact absolute points, relative offsets, polar displacements, direct lengths, circle radii, rotation angles, and scale factors. Enter these commands one line at a time:

```text
LINE
0,0
2000,0
@0,1500

CIRCLE
1000,750
250
```

The empty line finishes LINE. Compact input also works:

```text
LINE 0,0 2000,0
```

Press Enter again to finish. A coordinate such as `1000,500` is absolute. `@500,0` is relative to the preceding point. `@1000<45` advances 1,000 units at 45 degrees. A bare polar input uses the active command's previous point when there is one, or the world origin otherwise.

### Selection and editing

Click to select; Shift-click adds or removes. Drag left to right for a containing selection window, or right to left for a crossing selection. Drag blue grips to change endpoints, polyline vertices, circle centers/radii, arc endpoints, text positions, or dimension endpoints.

Move, copy, rotate, uniformly scale, mirror, offset, trim, extend, explode, delete, copy/paste inside the workspace, and undo/redo are implemented. After selecting objects, MOVE and COPY ask for a base point and destination. ROTATE accepts a center and numeric angle, or a center/reference/target sequence. SCALE accepts a base point and positive factor, or a reference-length sequence.

**Specific editing boundaries:** trim and extend currently operate on LINE entities against other LINE boundaries. Offset supports lines, circles, and convex closed straight-edged polylines. Unsupported offset shapes produce a message rather than an incorrect result. Exploding bulged polylines produces LINE and ARC entities; exploding ellipses and splines produces tessellated polylines.

### Layers and properties

Create, activate, search, recolor, hide, lock, and purge unused layers. Layer changes are undoable. The property inspector edits selected entity layers, colors, linetypes, coordinates, radii, text contents/heights/rotations, arc angles, ellipse ratios, and dimension offsets/text heights where applicable. Multi-selection supports shared property changes.

A hidden or locked layer cannot be edited. Changing insertion units changes `$INSUNITS`; it **does not rescale geometry**. Use SCALE for that operation.

### Files and output

Open or drag/drop ASCII DXF files and Draftline JSON projects. Export ASCII R2013 DXF (`AC1027`), a complete Draftline JSON document, vector SVG, or a PNG of the current viewport. Print opens a fit-to-page vector drawing in a separate browser window. This is a print view, not a paper-space layout or a calibrated plotter configuration.

Autosave uses the current origin's `localStorage`, with a short debounce. No drawings leave the browser. An unavailable/full storage area is reported visibly. The workspace clipboard is internal to this application; it is not OS CAD clipboard interchange. Export a project file before replacing a workspace or clearing browser data. There is one autosaved drawing per origin, not a project database or cloud drive.

## DXF interoperability

| Entity / feature | Behavior |
| --- | --- |
| LINE, CIRCLE, ARC, POINT | Native editable model entities; DXF import/export. |
| LWPOLYLINE | Native vertices, closure, and per-vertex bulge arcs. Variable/constant widths are reduced to centerlines with an import notice. |
| Legacy POLYLINE / VERTEX | Assembled into an editable lightweight polyline. Polyface and polygon meshes are not supported. |
| ELLIPSE | Native analytic model parameters. Nonuniform affine transformations can tessellate the curve. Similarity transforms preserve analytic ellipses. |
| SPLINE | Rational control-point NURBS evaluation with knot/weight data. Fit-point-only inputs display as fit-point polylines and are reported. Spline creation/knot editing is not exposed as a dedicated UI tool. |
| TEXT / MTEXT | Browser-font text. Unicode and multiline content are supported. MTEXT formatting is simplified; SHX/TTF style fidelity, wrapping, columns, obliquing, and all attachment/justification modes are not reproduced. |
| DIMENSION | Editable linear and aligned dimensions. Export includes native DIMENSION records and generated anonymous graphics blocks. Original dimension styles/overrides and associativity are not retained. Supported display blocks can be exploded for other dimension types. |
| INSERT / nested blocks / arrays | Expanded into editable geometry with base-point, scale, rotation, layer inheritance, and bounded recursion. Block identity and associative insert editing are not retained. Nonuniformly transformed curves may be tessellated. |
| HATCH | Polyline boundary loops, even-odd fill, and diagonal pattern display. Edge-based loops are skipped with a notice. Non-solid patterns are approximated with diagonal hatching. |
| SOLID / TRACE / 3DFACE | Projected 2D polygon display; exported as SOLID. Not a 3D scene/modeler. |
| LAYER | Colors, visibility, locking, and basic lineweights/linetypes. Standard ACI colors and true color are read; true color is written. |
| Linetypes | Continuous and simplified screen-space dash display. Custom complex patterns, per-entity linetype scale, and exact dash phase/length fidelity are not preserved. |
| Coordinates | JavaScript double-precision document coordinates. Nonzero Z is projected to XY with a notice; non-default extrusion/OCS normals are skipped. |
| Paper space / layouts | Not imported. This editor operates in model space. |
| DWG / binary DXF / 3D solids / proxies / xrefs | Not implemented. Binary input is rejected, and unknown DXF entity types are counted and reported. |

The importer retains **supported geometry**, not an arbitrary lossless DXF object graph. The generated output is a new DXF document. Original dictionaries, handles, reactors, XDATA, materials, dimensions' associations, block definitions, unsupported entities, and application-specific extension data are not round-tripped. **Keep the original DXF.** Compatibility notices are displayed after import and retained in the command log. A Draftline project preserves this editor's document representation more faithfully than a DXF round-trip, but cannot restore source features that were never imported.

Guardrails include a 50 MB input limit, 250,000 expanded-entity limit, 10,000 instances per INSERT array, 16 nested block levels, and a 30-second worker-import timeout. These are safety limits, not advertised performance guarantees. Large tessellated drawings can still consume significant memory.

## Rendering architecture

`DocumentModel` owns geometry and layers independently of the view. A rendering rebuild tessellates display curves with a zoom-dependent tolerance, calculates entity bounds, builds a bounding-volume hierarchy, and creates an interleaved line-instance array. The document itself retains analytic curves and double-precision coordinates wherever supported.

Each WebGPU instance is 40 bytes:

```text
0   float2 endpoint A, relative to scene origin
8   float2 endpoint B, relative to scene origin
16  float4 RGBA
32  float  stroke width in CSS pixels
36  float  screen-space dash period (0 = continuous)
```

The vertex shader generates six vertices per instance, expanding each segment into a screen-space quad. The fragment shader calculates rounded endpoint and stroke-distance coverage. The uniform camera is 32 bytes: relative center, viewport size, scale, DPR, and padding. Model-space Y points upward; screen-space Y points downward in the interaction layer. Uploads rebase coordinates to a nearby origin to avoid immediately discarding the high bits of large drawing coordinates.

A single instanced draw submits the cached line geometry. The buffer grows geometrically and is reused. Camera-only panning updates uniforms instead of reconstructing every segment. Tessellation is rebuilt when zoom crosses the cache's tolerance band. Drawing is scheduled on demand with `requestAnimationFrame`; there is no permanent idle animation loop.

The grid and hatch fills are drawn on a lower Canvas 2D layer. Text, selection highlighting, grips, snapping markers, and construction previews use an upper Canvas 2D layer. **This is intentionally a hybrid renderer, not an all-WebGPU text/fill engine.** The fallback groups visible paths by stroke style and performs batched Canvas 2D strokes. CPU-side bounds/BVH queries accelerate picking, snap candidate searches, and the fallback's visibility filtering; WebGPU line submission currently relies on clipping rather than a compute-culling pipeline.

The displayed frame metric measures CPU frame preparation/submission. It does not measure GPU execution time or certify a particular frame rate. This build does not claim arbitrary large-coordinate robustness, million-entity performance, full CAD topology validation, or infinite zoom precision.

## Undo architecture

Edits commit explicit added/removed entities, before/after entity states, and optional before/after layer tables. Undo and redo apply inverse deltas while keeping entity IDs stable. History retains up to 100 transactions. Geometry and layer operations are undoable; document name/unit metadata changes are not currently history transactions. Whole-document imports replace the history.

## Source map

```text
index.html                  Modular application shell
style.css                   Design tokens, desktop/mobile layout, UI themes
Draftline.html              Self-contained distribution
src/app.js                  Commands, interactions, dialogs, panels, I/O
src/geometry.js             Geometry, NURBS, transforms, analytic area, BVH
src/renderer.js             WebGPU shader/pipeline, caching, Canvas fallback
src/dxf.js                  DXF parser, block expansion, native DXF writer
src/dxf-worker.js           Import worker entry point
src/model.js                Document and transactional delta history
src/demo.js                 Editable architectural sample
src/icons.js                Original inline vector UI icons
samples/                    DXF and Draftline versions of Meridian House
tests/                      Unit tests, browser tests, interoperability audit
tools/build-single.py       Small project-specific, dependency-free bundler
```

Rebuild the single-file distribution after editing modules:

```sh
python3 tools/build-single.py
```

This bundler handles the named-import/named-export syntax used by this repository; it is not a general-purpose JavaScript bundler. `dist-app.js` is a generated diagnostic bundle and is not required to run the modular entry point.

A small diagnostic surface is exposed as `window.draftline`:

```js
// Run normal CAD commands, one input at a time.
draftline.execute('LINE');
draftline.execute('0,0');
draftline.execute('2000,1000');
draftline.execute('');

// Load supported DXF geometry without opening the compatibility dialog.
const document = await draftline.importText(dxfText, 'example.dxf', false);

// Generate an export string or inspect the independent document model.
const exportedDxf = draftline.exportDXF();
const project = draftline.model.serialize();
console.log(draftline.renderer.mode, draftline.renderer.lineCount);
```

Treat the exposed model/state objects as development interfaces, not a versioned plugin API.

## Validation performed

```sh
npm test
# Equivalent: node --test tests/*.test.mjs

# Optional Python test-only dependencies:
# python3 -m pip install playwright ezdxf
python3 tests/validate-dxf.py
python3 tests/browser-smoke.py --url http://localhost:8765/
```

The supplied validation results record:

* **29 passing Node tests** for analytic geometry, bulges, large-coordinate circumcenters/areas, rational spline evaluation, transforms, spatial queries, history, DXF round-trips, block transforms, Unicode, and invalid input handling.
* **34 passing browser checks**, including command-line geometry creation, undo/redo, transformations, hatching, explode, dimensions, text and layer dialogs, actual pointer selection, wheel zoom, middle-button panning, exports/imports, and mobile layout/panel behavior. No JavaScript exceptions occurred in these checked workflows.
* **Independent ezdxf 1.4.4 audit** of the exported 308-entity sample: zero errors and zero automatic repairs; 10 native DIMENSION entities.

The execution environment blocked browser navigation and provided no secure-origin WebGPU adapter. Browser checks therefore used the self-contained distribution in an opaque context with a **storage test double and the real Canvas 2D fallback**. Consequently, **native WebGPU execution, GPU performance, real-origin persistence/reload, browser printing, and broad third-party CAD compatibility were not verified here**. These tests are included so they can be run on a real localhost/HTTPS origin and target hardware. The WebGPU backend is implemented; it should not be described as hardware-validated by these results.

## References

* Autodesk, DXF group-code reference: https://help.autodesk.com/view/OARX/2024/ENU/?guid=GUID-3F0380A5-1C15-464D-BC66-2C5F094BCFB9
* Autodesk, DXF ENTITIES section: https://help.autodesk.com/view/ACD/2023/ENU/?guid=GUID-7D07C886-FD1D-4A0C-A7AB-B4D21F18E484
* MDN, WebGPU API and secure-context requirements: https://developer.mozilla.org/en-US/docs/Web/API/WebGPU_API
* ezdxf, lightweight-polyline/bulge reference: https://ezdxf.readthedocs.io/en/stable/dxfentities/lwpolyline.html
* ezdxf source and ACI color reference data: https://github.com/mozman/ezdxf
