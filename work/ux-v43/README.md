# Bilge Defter: v43 üzerine UX ve buton teması

**Taban:** `eaa8fae9c243e02b0d9fff2f3b0702379b26a6c6` (v43).
**Durum:** Entegrasyon kaynakları ve testler; ana uygulamaya uygulanmadı, canlıya yayımlanmadı.

Bu paket önceki V2.1 tasarımının uygulanabilir arayüz/tema değişikliklerini mevcut
v43 denetimlerine bağlar. Önceki demo motorunu v43'ün yerine koymaz. PWA giriş
sayfası tespiti, günlük sessiz denetim, not veri modeli ve tüm mevcut modüller korunur.

## Kapsam

- Kâğıdın dışındaki yazma çubuğu: mevcut kalem, vurgulama, silgi, geri alma,
  silgi boyutu ve araç ayarları. Yeni bir çizim motoru veya sahte yineleme eklenmez.
- Çizim, Ekle, Çalışma, Sayfa, Dosya ve yedek, Ayarlar kategorileri.
- Kaydırmadan erişilen panel başlığı ve Yazmaya dön düğmesi; Escape ve odak dönüşü.
- PDF, kamera, görsel, sözlük, yazı tanıma, planlayıcı ve yedek komutlarının mevcut
  DOM düğümleri taşınır; olay dinleyicileri ve nesne kimlikleri korunur.
- Sayfa adına göre Türkçe filtre; temizleme kontrolü diğer işlemlerden ayrılır.
  Temizleme/yedek geri dönüşünün v43 onay ve veri işlemleri değiştirilmez.
- Birincil, ikincil ve uyarı butonları için CSS değişkenleri ve ortak sınıflar.
- Orman, Gece, Bilge mavi, Mürdüm, Kehribar, Grafit hazır temaları; özel renkler.
- Otomatik siyah/beyaz yazı, manuel düşük kontrast düzeltmesi, canlı önizleme.
- Yalnız `bilge-defter-button-theme-v1` localStorage tercihi; hata dürüstçe gösterilir.
  Kâğıt, çerçeve, mürekkep, IndexedDB, yedekler ve notlar tema kodundan bağımsızdır.
- `window.BilgeUX.destroy()` arayüz yerleşimini geri alır; notları değiştirmez.

## Yayına engel olan doğrulanmış depo eksiği

Bu tabanda `work/bilge-defter-test/index.html`, `ui.css` dosyasını çağırıyor;
ancak aynı dizinin GitHub ağacında `ui.css` bulunmuyor. İkon/vendor dizinleri de bu
uygulama ağacında yok. Bu, canlı sunucunun eksik olduğunu göstermez; depodaki
kopyanın tek başına tam yayın paketi olmadığını gösterir.

Eksikleri boş dosyalarla doldurmayın, PWA bütünlük denetimini kaldırmayın,
uydurma checksum üretmeyin. Çalışan v43 dağıtımından özgün varlıklar sağlanmalı.
Bu yüzden değişiklikler ayrı kaynak klasöründe tutuldu; mevcut uygulama, sürüm
numarası ve offline manifest bu PR'da değiştirilmedi.

## Güvenli hazırlama

Python 3.10+ ile, deponun kökünde önce salt okunur kontrol:

```bash
python work/ux-v43/prepare.py work/bilge-defter-test --check
```

Eksik veya hash'i farklı dosya varsa işlem hiçbir çıktı yazmadan durur. Betik
özellikle v43 index, PWA, service worker ve eski UI modülünün Git blob SHA'sını
denetler. Başka sürüme otomatik geri dönüş yapmaz. İlk çalıştırmada depodaki
`ui.css`/yayın varlığı eksiklerinin listelenmesi beklenir.

Tam ve doğrulanmış v43 kaynakları sağlandığında **ayrı** bir aday oluşturun:

```bash
python work/ux-v43/prepare.py work/bilge-defter-test --output work/bilge-defter-v44-candidate --version v44
```

Çıktı dizini önceden mevcut olmamalı. Kaynak v43 klasörü değişmez. Betik:
1. Offline manifestteki tüm varlıkları SHA-256 ile doğrular.
2. Yeni dört arayüz dosyasını ve yükleme etiketlerini adaya ekler.
3. Yalnız index sürüm rozeti, SW sürüm sabiti ve release sürümünü günceller.
4. Yeni manifest ve SHA256SUMS üretir; her özgün motor dosyası aynı kalır.
5. Hiçbir Git komutu, SSH, sunucu yüklemesi veya tarayıcı veri işlemi çalıştırmaz.

Adayı önce ayrı test ortamında çalıştırın. Üretim adresini değiştirmek notları
kendiliğinden taşımaz; bağımsız JSON yedeğini koruyun. Canlıya alma ayrı onay ve
gerçek dağıtım testleri gerektirir.

## Dosyalar

`assets/ux-button-theme.js` önceki paketteki bağımsız tema motorudur;
`assets/ux-button-theme.css` ortak buton ve ayar görünümüdür.
`assets/ux-workspace.js` v43 için DOM bağlayıcısı;
`assets/ux-workspace.css` mobil/tablet/masaüstü yerleşimidir.
`prepare.py` kontrollü aday üretir. `tests/` tekrar çalıştırılabilir testlerdir.

```bash
node tests/test_button_theme.cjs
python tests/test_prepare.py
python tests/test_workspace.py
```

Komutları `work/ux-v43` içinde çalıştırın. Son test Python Playwright ve Chromium
ister; Linux'ta varsayılan `/usr/bin/chromium` yolunu kullanır. `CHROMIUM_PATH`
ortam değişkeniyle farklı kurulum yolu verilebilir.

## Ölçülenler ve sınırlar

Bu oturumda 21 tema birim kontrolü, 9 hazırlama betiği testi ve 22 Chromium DOM
bağlayıcı kontrolü geçti. **Toplam 52 kontrol.** Önceki paketin 148 kontrolünü burada
yeniden çalıştırılmış gibi saymıyoruz. Ayrıntı: `TEST_REPORT.md`.

DOM testi sentetik v43-benzeri bir arayüz kullanır; gerçek not motoru değildir.
Gerçek v43 regresyonu, gerçek origin kalıcılığı, PDF/kamera/OCR/eşitleme,
v43→aday PWA yükseltmesi ve fiziksel iPad/Android kalem testi henüz yapılmadı.

Metin kontrast hesabı: https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html
Bu tek kontrol uygulamanın bütünü için WCAG uygunluk beyanı değildir.
