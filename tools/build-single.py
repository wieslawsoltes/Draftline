#!/usr/bin/env python3
"""Build a self-contained HTML distribution from this project's named ES modules.
No Node dependencies, bundler downloads, or external assets are required.
This intentionally supports the named-import/export syntax used in this project.
"""
from pathlib import Path
import re
import json
ROOT = Path(__file__).resolve().parents[1]

def bundle(files):
    output = ['(()=>{\nconst __modules=Object.create(null);']
    for name in files:
        source = (ROOT / 'src' / name).read_text()
        exports = re.findall(r'\bexport\s+(?:class|function|const|let)\s+(\w+)', source)
        source = re.sub(r"import\s*\{([^}]+)\}\s*from\s*['\"]([^'\"]+)['\"];?", lambda m: 'const {'+m.group(1)+'} = __modules['+json.dumps(Path(m.group(2)).name)+'];', source)
        source = re.sub(r'\bexport\s+(?=class\b|function\b|const\b|let\b)', '', source)
        output.append('__modules['+json.dumps(name)+'] = (()=>{\n'+source+'\nreturn {'+', '.join(exports)+'};\n})();')
    output.append('})();')
    return '\n'.join(output)

worker = bundle(['geometry.js', 'dxf.js', 'dxf-worker.js'])
app = bundle(['geometry.js','dxf.js','model.js','renderer.js','demo.js','icons.js','app.js'])
html = (ROOT / 'index.html').read_text()
html = html.replace('<link rel="stylesheet" href="style.css">','<style>'+ (ROOT/'style.css').read_text()+'</style>')
script = 'globalThis.__DRAFTLINE_WORKER__ = '+json.dumps(worker)+';\n'+app
script = script.replace('</script', '<\\/script')
html = html.replace('<script type="module" src="src/app.js"></script>', '<script>\n'+script+'\n</script>')
out = ROOT/'Draftline.html'
out.write_text(html)
(ROOT/'dist-app.js').write_text(app)
print(f'Built {out.name}: {out.stat().st_size:,} bytes')
