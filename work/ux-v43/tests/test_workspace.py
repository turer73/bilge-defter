"""DOM adapter tests. The fixture is NOT the v43 drawing / PDF / sync engine."""
import json
import os
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).parents[1]
IDS = ['textAdd','imageAdd','cameraAdd','pdfOpen','mediaEdit','plannerOpen','dictOpen','ocrOpen','undo','clearPage','scrollToTop','searchBtn','pdfExportOpen','exportBtn','importBtn','restorePrevious','pwaOpen']
BUTTONS = ''.join(f'<button class="btn" id="{i}">{i}</button>' for i in IDS)
HTML = '''<!doctype html><html lang="tr"><head><meta charset="utf-8"><style>
*{box-sizing:border-box}body{margin:0;font:14px system-ui}.app{height:100dvh;display:grid;grid-template-rows:auto 1fr auto}.app>header,.app>footer{padding:10px}main{min-height:0;display:grid}.workspace{min-height:0;display:grid;grid-template-rows:minmax(0,1fr);position:relative}.paper-wrap{min-height:0;padding:8px}.paper{height:100%;background:#fffdf8}canvas{width:100%;height:100%}.side{display:none}.drawing-tools{display:flex}.btn{padding:8px;border:0;border-radius:10px}.tools-dialog{padding:0;border-radius:16px}.tools-heading{padding:14px;display:flex;justify-content:space-between}.tools-content{padding:14px}.tool-section{display:grid;gap:12px}button{font:inherit}.action-group h3{grid-column:1/-1}
</style></head><body><div class="app"><header>Bilge Defter v43 DOM fixture</header><main><aside class="side"><div id="pages"><div class="page-item"><button>İstanbul</button></div><div class="page-item"><button>Geometri</button></div></div></aside><section class="workspace"><div class="edge-actions"><button class="btn" id="quickUndo">Geri al</button><button class="btn" id="eraserSizeToggle" hidden>Silgi boyutu</button><button class="btn" id="toolsToggle">Araçlar</button></div><div class="paper-wrap"><div class="paper"><canvas id="canvas"></canvas></div></div></section></main><footer>Kayıt testi değil</footer></div><dialog id="toolsDialog" class="tools-dialog"><div class="tools-heading"><h2>Araçlar</h2><button class="btn" id="toolsClose">Kapat</button></div><div class="tools-content"><section class="tool-section"><h3 id="drawingTitle">Çizim</h3><div class="drawing-tools"><button class="btn active" data-tool="pen">✎</button><button class="btn" data-tool="marker">▱</button><button class="btn" data-tool="eraser">◇</button></div><input type="color" id="color" value="#173b36"></section><section><input type="range" id="width" value="4"></section><section><input type="color" id="paperColor" value="#fffdf8"></section><section><h3 id="paperPatternTitle">Kâğıt</h3></section><label class="palm-control"><input type="checkbox" id="penOnly">Kalem tercihi</label><section><h3 id="actionsTitle" hidden>İşlemler</h3><div class="tool-actions"><div class="action-group"><h3>İşlemler</h3>''' + BUTTONS + '''</div></div><p class="recovery-note">Yedek notu</p><input id="importFile" type="file" hidden></section><section id="appearanceSection"><h3>Çerçeve</h3></section><button class="btn primary" id="toolsDone">Yazmaya dön</button></div></dialog><script>
window.originalCanvas=document.querySelector('#canvas');window.originalButton=document.querySelector('#pdfOpen');window.calls=[];window.noteSentinel={unchanged:true};
for(const b of document.querySelectorAll('button'))b.addEventListener('click',()=>window.calls.push(b.id||b.dataset.tool));
const d=document.querySelector('dialog');document.querySelector('#toolsToggle').onclick=()=>d.showModal();document.querySelector('#toolsClose').onclick=()=>d.close();document.querySelector('#toolsDone').onclick=()=>d.close();
</script></body></html>'''

results=[]
def check(name, condition):
    assert condition, name
    results.append({'test':name,'status':'PASS'})

with sync_playwright() as p:
    browser=p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH','/usr/bin/chromium'),headless=True,args=['--no-sandbox'])
    page=browser.new_page(viewport={'width':1280,'height':900})
    errors=[]
    page.on('pageerror',lambda e:errors.append(str(e)))
    page.set_content(HTML)
    for file in ['ux-button-theme.css','ux-workspace.css']:
        page.add_style_tag(content=(ROOT/'assets'/file).read_text())
    for file in ['ux-button-theme.js','ux-workspace.js']:
        page.add_script_tag(content=(ROOT/'assets'/file).read_text())
    check('Adapter mounted',page.evaluate('!!window.BilgeUX'))
    check('Original canvas identity preserved',page.evaluate("window.originalCanvas===document.querySelector('#canvas')"))
    check('Original PDF control identity preserved',page.evaluate("window.originalButton===document.querySelector('#pdfOpen')"))
    check('All original feature controls remain unique',all(page.locator('#'+i).count()==1 for i in IDS))
    page.locator('.ux-menu [data-ux-task="insert"]').click()
    check('Insert task opens real modal',page.locator('#toolsDialog').is_visible())
    page.locator('#pdfOpen').click()
    check('Original PDF event handler retained',page.evaluate("window.calls.includes('pdfOpen')"))
    page.locator('#toolsDone').click()
    check('Close returns focus to task opener',page.evaluate("document.activeElement===document.querySelector('.ux-menu [data-ux-task=insert]')"))
    page.locator('.ux-menu [data-ux-task="settings"]').click()
    page.locator('[data-bdt-preset="kehribar"]').click()
    check('Amber auto ink is black',page.evaluate("BilgeUX.controller.getSnapshot().roles.primary.text==='#000000'"))
    check('Frame control retained',page.locator('#appearanceSection').is_visible())
    page.locator('#toolsDone').click()
    page.evaluate("document.querySelector('.ux-page-search input').value='istanbul';document.querySelector('.ux-page-search input').dispatchEvent(new Event('input',{bubbles:true}))")
    check('Turkish title filtering',page.evaluate("!document.querySelectorAll('.page-item')[0].hidden&&document.querySelectorAll('.page-item')[1].hidden"))
    for width,height in [(320,568),(390,844),(768,1024),(1280,900)]:
        page.set_viewport_size({'width':width,'height':height})
        page.locator('.ux-menu [data-ux-task="settings"]').click()
        page.evaluate("document.querySelector('#toolsDialog>.tools-content').scrollTop=9999")
        check(f'{width}px fixed return control visible',page.locator('#toolsDone').is_visible() and page.locator('#toolsDone').bounding_box()['y']+page.locator('#toolsDone').bounding_box()['height']<=height)
        check(f'{width}px no page-level horizontal overflow',page.evaluate('document.documentElement.scrollWidth<=innerWidth'))
        page.keyboard.press('Escape')
    check('No notebook writes by adapter',page.evaluate('JSON.stringify(window.noteSentinel)==="{\\"unchanged\\":true}"'))
    page.evaluate('BilgeUX.destroy()')
    check('Rollback restores original controls',page.locator('.edge-actions #toolsToggle').count()==1 and page.locator('#toolsDialog .drawing-tools').count()==1)
    check('Rollback restores hidden page states',page.evaluate("Array.from(document.querySelectorAll('.page-item')).every(p=>!p.hidden)"))
    check('No uncaught browser errors',not errors)
    browser.close()

report={'scope':'Chromium DOM fixture only; not v43 engine, PDF, PWA, IndexedDB or physical pen tests','results':results}
(Path(__file__).parent/'workspace-results.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))
print(json.dumps({'passed':len(results),'failed':0}))
