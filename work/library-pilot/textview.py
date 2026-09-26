"""Escaped reading copy of a verified PDF page. No translation service."""
from html import escape
from urllib.parse import urlencode

def render_text(book, number, account):
    if type(number) is not int or not 1 <= number <= len(book['page_data']):
        raise ValueError('Invalid PDF page')
    page=book['page_data'][number-1]
    key=book['id']
    binding=urlencode({'account':account})
    original='../../#'+urlencode({'source':key,'page':number})
    pdf=f'../../pdf/{key}.pdf?{binding}'
    def page_link(n,label):
        return f'<a class="read-action" href="{n}?{escape(binding)}">{label}</a>'
    navigation=(page_link(number-1,'← Önceki sayfa') if number>1 else '')+(page_link(number+1,'Sonraki sayfa →') if number<len(book['page_data']) else '')
    content=escape(page['text']) if page['text'].strip() else ''
    article=f'<article id="sourceText" lang="en" translate="yes">{content}</article>' if content else '<p id="emptyText" lang="tr">Bu sayfadan okunabilir metin çıkarılamadı. Görsel veya taranmış sayfa olabilir; özgün PDF görünümünü açın.</p>'
    return f'''<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>{escape(book['title'])} — PDF page {number}</title><link rel="stylesheet" href="../../style.css"><script defer src="../../quote.js?{escape(binding)}"></script></head>
<body class="text-reading"><nav class="notebook-return-bar" aria-label="Deftere dönüş" lang="tr" translate="no"><a class="read-action notebook-return" href="https://defter.bilgearena.com/" target="_self">← Deftere dön</a><span>Defteri bu sekmede açar</span></nav><header><p class="eyebrow" lang="tr" translate="no">BİLGE DEFTER / METİN OKUMA</p><h1>{escape(book['title'])}</h1>
<p class="read-credit" translate="no">{escape(book['authors'])} · {escape(book['publisher'])} · {escape(book['license'])}</p>
<p lang="tr" translate="no">PDF sayfası {number} / {len(book['page_data'])} · Basılı sayfa etiketi: {escape(str(page.get('label') or number))}</p></header>
<main><aside class="notice" lang="tr" translate="no"><strong>Türkçe okumak için tarayıcınızın Çevir seçeneğini kullanın.</strong><details><summary>Çeviri, gizlilik ve metin sınırları</summary>
<p>Bu sayfa İngilizce özgün PDF metninin okuma kopyasıdır; Bilge Defter çeviri başlatmaz. Tarayıcı, seçiminizle metni çeviri sağlayıcısına gönderebilir. Özellik ve Türkçe desteği tarayıcı/sürüme göre değişir.</p>
<p>Otomatik çeviride tıbbi terimler yanlış olabilir. Metin çıkarımında okuma sırası, formül ve tablo düzeni bozulabilir; görseller burada bulunmaz. Özgün PDF ile karşılaştırın. Klinik karar desteği değildir.</p></details></aside>
<nav class="read-nav" aria-label="Reading controls" lang="tr" translate="no"><a class="read-action" href="{escape(original)}">Özgün PDF görünümü</a><a class="read-action" href="{escape(pdf)}">Özgün PDF’yi indir</a><a class="read-action" href="../../">Kütüphane</a></nav>
<section id="quoteActions" lang="tr" translate="no" data-account="{escape(account)}" data-title="{escape(book['title'])}" data-authors="{escape(book['authors'])}" data-license="{escape(book['license'])}" data-page="{number}" data-label="{escape(str(page.get('label') or number))}" data-source-url="{escape(book['url'])}" data-license-url="{escape(book['license_url'])}">
<div class="read-nav"><button id="quoteSelection" class="read-action" {'disabled' if not content else ''}>Seçili metni deftere al</button><button id="quotePage" class="read-action" {'disabled' if not content else ''}>Bu sayfanın metnini deftere al</button></div>
<p id="quoteStatus" role="status">Kaynak ve sayfa bilgisi eklenir. Yalnız metin alınır; resimler ve PDF düzeni taşınmaz. Defterde hedef sayfayı seçip yerleşimi onaylayın. Aynı tarayıcı ve hesap gerekir.</p></section>
{article}
<nav class="read-nav" lang="tr" translate="no" aria-label="PDF page navigation">{navigation}</nav>
<footer lang="tr" translate="no"><a href="{escape(book['url'])}" target="_blank" rel="noopener noreferrer">Yayıncı</a> · <a href="{escape(book['license_url'])}" target="_blank" rel="noopener noreferrer">Lisans</a>
<p>Özgün dosya ve özel lisans bildirimleri PDF içinde korunur. Metin biçimlendirmesi sadeleştirildi; kaynak PDF değiştirilmedi. Akademik doğruluk kabulü bekliyor.</p></footer></main></body></html>'''
