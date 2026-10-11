# Görünen slaytların kaynak yaşam döngüsü — yerel aday

Tarih: 2026-10-11. Kaynak tabanı: `918aa5796110db12cb3950588fb17d521205dbf9` (v79).
Bu çalışma yeni yayın değildir; canlı sürüm değiştirilmedi.

## Kapsam

`viewport-reader.js`, `BilgeSlideFlow` içindeki sürekli PPTX sayfalarının
çözülmüş arka plan görsellerini yönetir. Tek okuyucu uygulama ömrü boyunca
yaşar. Defter, hesap, sayfa kaynağı veya görünüm değişince eski sonuç yeni
görünüme uygulanmaz. Bekleyen doğal çözümleme gerçekten sonuçlanana kadar
rezervasyonu tutulur; zaman aşımı varmış gibi ikinci çözümleme başlatılmaz.

Görünen bütün sayfalar gereklidir. En fazla iki komşu, mevcut 12 milyon piksel
öngetirme bütçesi izin verirse hazırlanır. Ekrandan çıkan bitmap kapatılır.
`createImageBitmap` olmayan tarayıcıda aynı sıraya bağlı `HTMLImageElement`
yolu korunur. `pagehide` yüklemeyi askıya alır; `pageshow` tekrar başlatır.
Bozuk görselde yazı engellenir; başka sayfaya geçilebilir ve kalem/fareyle
yeniden deneme yapılabilir. Avuç içi koruması gevşetilmez.

İzole pilotun sabit **3 sayfa / 24 MiB / 100 manifest sayfası** kısıtları
ürüne taşınmadı. Birden çok geçerli içe aktarma, aynı defterde 100'den fazla
slayt oluşturabilir. Dar ve uzun ekranda 12'den fazla kısa slayt görülebilir;
bunların hiçbiri sırf sabit üç-slot kuralı yüzünden boş bırakılamaz.

## Değişmeyenler

- Kayıt şeması, `asset:` deposu, görsel göçü, çöp toplama, eşitleme.
- JSON yedeğindeki tam görseller ve yükleme öncesi geri dönüş kopyası.
- PNG/JPEG kalite tercihleri, 1000 piksel sayfa genişliği.
- İçe aktarma başına 20 MiB dosya / 100 sayfa / 24 MiB raster bütçesi;
  yeni aktarımlarda defterin 96 MiB görsel kontrolü.
- Bağımsız PDF sayfası, eklenen medya ve notlu PDF dışa aktarma yükleyicileri.
- Mürekkep geometrisi, karo önbelleği, piksel kalite eşikleri.

## Ölçümün sınırı

Sayaçlar `genişlik × yükseklik × 4` ile sahip olunan çözülmüş görselleri,
bekleyen tek işi ve kapatılamamış kaynakları gösterir. Görünüm değişirken
eskimiş bekleyen iş ayrı `transitionBytes` olarak raporlanır.

Bu **tarayıcının toplam RAM/GPU üst sınırı veya daha hızlı iPad iddiası değildir**.
Mevcut defter hâlâ bütün encoded data URL dizelerini belleğe açar. Yeni doğal
bitmap yolu `atob → Uint8Array → Blob` geçici kopyaları ve ana iş parçacığı
işi içerir. Mürekkep, ekran tuvalleri ve codec çalışma belleği ayrı maliyetlerdir.
`ImageBitmap.close()` grafik kaynağını bırakır; işletim sistemi belleğinin aynı
anda düşeceğini garanti etmez. [WHATWG ImageBitmap](https://html.spec.whatwg.org/multipage/imagebitmap-and-animations.html#dom-imagebitmap-close)

Hazırlama deposu uygulamanın içe aktarma yoluna artık bağlıdır
(`PPTX_STAGING.md`). Kalıcı defteri yalnız referanslarla açıp diskten gerçekten
sayfa sayfa okuma ve boyut/sayfa sınırını yükseltme ise ayrı aşamalardır.

## Kabul

`npm run test:viewport-reader -- --out=outputs/viewport-integration-20261011/UNIQUE`
gerçek uygulama kodunu loopback sunucuda, sentetik onaylı hesap ve yeni IndexedDB
ile çalıştırır. Eski kanıt klasörünün üstüne yazmaz; kaynak hash'lerini ve test
koşucusunu kaydeder. Çözülmeyen işler için test son tarihi ve bağlam kapatma vardır.
`--out` veya `BILGE_VIEWPORT_READER_OUT` verilmezse benzersiz tarih/kimlikli yeni
bir klasör açılır. Eski `verify-v79.cjs` regresyonları için `BILGE_TEST_OUTPUT`
artık korunur; dolu çıktı klasöründe ana süreç ve alt süreç başlamadan durur.

Yeni doğrulamalar: tek çözümleme, kapanan kaynaklar, bekleyen iş sırasında defter/
hesap değişimi ve pagehide/pageshow, >100 birleşik sayfa, >24 MiB geçerli defter,
bütün görünen kısa slaytlar, hata/yeniden deneme, Image fallback, kaynak piksel
karşılaştırması, eski padding'siz base64, kayıt/yedek/geri yükleme ve git'ten
okunan gerçek v79 ile aynı IndexedDB üzerinde geri dönüş.

Ek kapılar: mevcut sürekli slayt DPR1/DPR2, sayfa paneli, alt yakınlaştırma,
görsel varlık kayıt/kurtarma regresyonları. Güncel ölçüm ve sınırlamalar
`outputs/viewport-integration-20261011/REPORT.md` altında toplanır.

Yayın öncesi ayrıca commit/CI ve geri alma paketi, ardından gerçek iPad'de büyük
sunumla kaydırma, kalem/avuç, arka plana alıp dönme ve yeniden açma kabulü gerekir.
