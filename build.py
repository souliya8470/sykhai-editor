#!/usr/bin/env python3
"""Concatenate src/ into a single index.html (GitHub Pages serves it as-is)."""
import glob, os, re
root = os.path.dirname(os.path.abspath(__file__))
css = open(f'{root}/src/style.css', encoding='utf-8').read()
body = open(f'{root}/src/body.html', encoding='utf-8').read()
js = '\n'.join(f'// ---- {os.path.basename(p)} ----\n' + open(p, encoding='utf-8').read() for p in sorted(glob.glob(f'{root}/src/js/*.js')))
ver = re.search(r"APP_VERSION = '([^']+)'", js).group(1)
html = f'''<!DOCTYPE html>
<html lang="th"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Sykhai Editor v{ver}</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Prompt:wght@400;600;700;800;900&family=Noto+Sans+Lao:wght@400;600;700;800&family=Noto+Sans+Thai:wght@400;600;700;800&display=swap" rel="stylesheet">
<style>
{css}
</style></head>
<body>
{body}
<script>
{js}
</script>
</body></html>
'''
open(f'{root}/index.html', 'w', encoding='utf-8').write(html)
print('index.html', len(html)//1024, 'KB, v' + ver)
