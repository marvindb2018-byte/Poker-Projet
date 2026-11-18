#!/usr/bin/env python3
"""Nouvelle version de l'appli : à lancer avant chaque mise en ligne (python3 tools/bump_version.py).

Met la même étiquette de version (date et heure) :
  - dans index.html, sur chaque fichier chargé (style.css?v=…, app.js?v=…) : le navigateur ne peut pas garder l'ancien ;
  - dans <meta name="app-version"> : la version de la page ouverte ;
  - dans version.json : la version en ligne, que l'appli consulte pour proposer « Mettre à jour ».
"""
import datetime, json, pathlib, re

root = pathlib.Path(__file__).resolve().parent.parent
v = datetime.datetime.now().strftime('%Y%m%d-%H%M%S')
html = root / 'index.html'
s = html.read_text()
s = re.sub(r'((?:src|href)="(?:[a-z]+)\.(?:js|css))(?:\?v=[^"]*)?"', lambda m: f'{m.group(1)}?v={v}"', s)
if 'name="app-version"' in s:
    s = re.sub(r'<meta name="app-version" content="[^"]*">', f'<meta name="app-version" content="{v}">', s)
else:
    s = s.replace('<meta charset="utf-8">', f'<meta charset="utf-8">\n  <meta name="app-version" content="{v}">', 1)
html.write_text(s)
(root / 'version.json').write_text(json.dumps({'v': v}) + '\n')
print('version', v)
