"""Package the dependency-free local extension as a standard VSIX ZIP."""
from pathlib import Path
from xml.sax.saxutils import escape
import json
import zipfile

ROOT = Path(__file__).resolve().parents[1]
manifest = json.loads((ROOT / 'package.json').read_text())
output_dir = ROOT.parent / 'data' / 'packages'
output_dir.mkdir(parents=True, exist_ok=True)
output = output_dir / f"{manifest['name']}-{manifest['version']}.vsix"
metadata = f'''<?xml version="1.0" encoding="utf-8"?>
<PackageManifest Version="2.0.0" xmlns="http://schemas.microsoft.com/developer/vsx-schema/2011">
<Metadata><Identity Language="en-US" Id="{manifest['name']}" Version="{manifest['version']}" Publisher="{manifest['publisher']}"/>
<DisplayName>{escape(manifest['displayName'])}</DisplayName><Description xml:space="preserve">{escape(manifest['description'])}</Description>
<Tags>security,companion</Tags><Categories>Other,Linters</Categories><GalleryFlags>Public</GalleryFlags>
<Properties><Property Id="Microsoft.VisualStudio.Code.Engine" Value="{manifest['engines']['vscode']}"/><Property Id="Microsoft.VisualStudio.Code.ExtensionKind" Value="ui"/><Property Id="Microsoft.VisualStudio.Code.ExecutesCode" Value="true"/></Properties></Metadata>
<Installation><InstallationTarget Id="Microsoft.VisualStudio.Code"/></Installation><Dependencies/>
<Assets><Asset Type="Microsoft.VisualStudio.Code.Manifest" Path="extension/package.json" Addressable="true"/><Asset Type="Microsoft.VisualStudio.Services.Content.Details" Path="extension/README.md" Addressable="true"/><Asset Type="Microsoft.VisualStudio.Services.Icons.Default" Path="extension/assets/patch.png" Addressable="true"/></Assets></PackageManifest>'''
types = '''<?xml version="1.0" encoding="utf-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="json" ContentType="application/json"/><Default Extension="cjs" ContentType="application/javascript"/><Default Extension="py" ContentType="text/plain"/><Default Extension="png" ContentType="image/png"/><Default Extension="md" ContentType="text/markdown"/><Default Extension="vsixmanifest" ContentType="text/xml"/></Types>'''
included = [ROOT / 'package.json', ROOT / 'README.md', ROOT / 'extension.cjs', ROOT / 'assets/patch.png', ROOT / 'assets/patch-sprites.png', ROOT / 'assets/PATCH-ART.md', ROOT / 'native/pet.py', ROOT / 'native/sprites.py', *sorted((ROOT / 'lib').glob('*.cjs'))]
with zipfile.ZipFile(output, 'w', zipfile.ZIP_DEFLATED) as archive:
    archive.writestr('extension.vsixmanifest', metadata)
    archive.writestr('[Content_Types].xml', types)
    for file in included:
        archive.write(file, 'extension/' + file.relative_to(ROOT).as_posix())
    for name in ['agent', 'artifacts', 'config', 'fixture', 'policy', 'providers', 'scanner', 'project-lab']:
        archive.write(ROOT.parent / 'src' / f'{name}.mjs', f'extension/runtime/src/{name}.mjs')
    archive.write(ROOT.parent / 'fixtures/facility-policy.json', 'extension/runtime/fixtures/facility-policy.json')
    archive.write(ROOT.parent / 'fixtures/project-probes.ts', 'extension/runtime/fixtures/project-probes.ts')
print(output)
