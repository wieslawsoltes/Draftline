"""Independent export validation with ezdxf (test-only dependency)."""
import json
from pathlib import Path
import ezdxf
root=Path(__file__).resolve().parents[1]
file=root/'samples'/'Meridian House.dxf'
doc=ezdxf.readfile(file)
audit=doc.audit()
result={
    'validator':'ezdxf '+ezdxf.__version__,
    'file':file.name,
    'version':doc.dxfversion,
    'modelspace_entities':len(doc.modelspace()),
    'layers':len(doc.layers),
    'dimensions':len(doc.modelspace().query('DIMENSION')),
    'errors':[{'code':e.code,'message':e.message} for e in audit.errors],
    'automatic_repairs':[{'code':e.code,'message':e.message} for e in audit.fixes],
}
assert result['modelspace_entities']==308
assert not result['errors'],result
assert not result['automatic_repairs'],result
(root/'tests'/'dxf-validation.json').write_text(json.dumps(result,indent=2))
print(json.dumps(result,indent=2))
