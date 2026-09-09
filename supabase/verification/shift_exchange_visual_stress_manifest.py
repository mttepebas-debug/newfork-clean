"""Validate recorded UI stress evidence; does not replace visual inspection/UAT."""
import hashlib
import json
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
FOLDER = ROOT/'docs/rebuild/shift-hub-visual-proof-2026-09-07/stress'


def main():
    measurements = json.loads((FOLDER/'measurements.json').read_text(encoding='utf-8'))
    expected = {f'many-{screen}-{theme}-{width}-text200.jpg'
        for screen in ('preview','confirm') for theme in ('light','dark') for width in (320,390,1440)}
    expected.add('many-note-dark-390-text200.jpg')
    assert len(measurements)==13 and {r['file'] for r in measurements}==expected
    records=[]
    for row in measurements:
        path=FOLDER/row['file']
        with Image.open(path) as im:
            assert im.format=='JPEG' and im.size==(row['width'],row['height'])
        assert row['rootFont']=='32px' and not row['overflow'] and not row['dialogOverflow'] and not row['clipped']
        assert '-'+row['theme']+'-' in row['file']
        records.append(row | {'sha256':hashlib.sha256(path.read_bytes()).hexdigest()})
    withdrawal=json.loads((FOLDER/'withdrawal-browser.json').read_text(encoding='utf-8'))
    assert withdrawal['dialogOpen'] and withdrawal['confirmDisabled'] and withdrawal['note']=='UI audit note retained.'
    path=FOLDER/'withdrawal-dialog.jpg'
    with Image.open(path) as im:
        assert im.format=='JPEG' and im.size==(withdrawal['width'],withdrawal['height'])
    report={'matrix_captures':12,'additional_captures':2,'text_method':'root font 16px to 32px; not native browser zoom or screen reader evidence',
        'measurements':records,'withdrawal':withdrawal | {'file':path.name,'sha256':hashlib.sha256(path.read_bytes()).hexdigest()}}
    (FOLDER/'manifest.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
    print(json.dumps({'status':'PASS','matrix':12,'additional':2,'method':'recorded DOM geometry and image metadata; visual review documented separately'}))


if __name__=='__main__':
    main()
