# Bilge Defter v34 — kamerayla fotoğraf çekme ve üzerine not alma

22 Eylül 2026. Kullanıcı isteğiyle: kamera girdisi. Veri biçimi değişmedi
(v6 / yedek 8); görsel işleme akışı (EXIF, 2 MB/10 MB sınırları, ilk yerleşim)
görsel ekleme ile ortaktır.

## Kullanım

- Araçlar → "📷 Fotoğraf çek": mobilde doğrudan kamera açılır
  (capture=environment), masaüstünde dosya seçiciye düşer.
- Fotoğraf sayfada ilk yerleşim akışıyla açılır: taşı, boyutlandır (44 px
  tutamaç), döndür, Bitti ile kaydet.
- Üzerine kalem/fosforlu yazılır; silgi yalnız not katmanını siler, fotoğrafı
  bozmaz. Fotoğraf + notlar birlikte kaydedilir, yeniden açılışta ve JSON
  yedeğinde korunur.

## Teknik

- `media-workspace.js`: `cameraFile` girdisi (`accept=image/*`,
  `capture=environment` hem özellik hem öznitelik olarak). Ortak
  `processMediaFile`: tip/boyut denetimi, EXIF yönelimi
  (createImageBitmap from-image), 1000 px ölçekleme, 2 MB küçültülmüş sınırı.
- `ui-workspace.js`: EKLE VE DÜZENLE grubuna Fotoğraf çek düğmesi ve ikonu.
- Fotoğraf normal görsel kaydıdır; özel şema alanı yoktur, eski sürümler
  veriyi zararsız okur.

## Doğrulama

- 23 uygulama paketi, 239 kontrol: önceki tüm paketler + kamera paketi
  (4 kontrol): capture özniteliği ve düğme, ilk yerleşimle görsel kaydı,
  fotoğraf üstüne kalem katmanı, yedek ve yeniden açılışta korunma.
- Fixture paketleri geçti. Canlı: private v34 (rozet, media-workspace.js
  kamera kodu). Fiziksel cihazda gerçek kamera açılışı ve kabulü kullanıcıda.

## Yayın

Her iki ayrı adreste aynı 217 dosyalık v34 çevrim dışı paket var:

- https://defter.bilgearena.com/
- https://klipper-2.tail1ade8e.ts.net:8443/

Release dizinleri: `/opt/bilge-defter-test/releases/20260921-v34-camera` ve
`/opt/bilge-defter-invited/releases/20260921-v34-camera`.

Yeni konteynerler: private `203a940765053524bd7ecc6da2cee861f062a49dcfcc8948bd309657771e5724`,
davetli `afe91ce9998fbfc250cc3d2cb4342f464deed696caf0dcf139c709b0253b1b2c`.
Öncekiler `rollback-before-v34` olarak saklandı. SHA256SUMS özeti:
`0ab65c22c83620934de5cfebcac97b380f91bd803bc3276ee972b8335a601dd0`.

## Sonraki dilim

Otomatik cihazlar arası eşitleme (şifreli push/pull, oturum kilidi, zaman
damgası, çakışmada manuel seçim).
