# Bilge Defter v39 — yazı tanıma (mürekkep → metin, sunucu OCR)

22 Eylül 2026. Planın 6. maddesinin ikinci adımı: el yazısı/ink tanıma. Tanıma
açık kullanıcı eylemiyle çalışır ve şifreli yedeklemeden bağımsızdır; notların
kendisi asla bu uçtan geçmez.

## Kullanım

- Araçlar → Yazıyı tanı: açık sayfadaki kalem ve fosforlu çizimler beyaz
  zeminde PNG'ye çevrilir, sunucudaki yerel tesseract (Türkçe) ile tanınır.
- Sonuç metin kutusunda gösterilir; düzeltilebilir. "Metin olarak ekle" ile
  tanınan metin ilk yerleşim akışına girer (taşı, boyutlandır, döndür).
- Yeniden dene düğmesi aynı sayfayı yeniden tanır.
- Özel adreste düğme kapalıdır ve nedeni açıklanır.

## Güvenlik ve dürüst sınırlar

- Tanıma için çizim görüntüsü sunucuya gönderilir; görüntü sunucuda
  SAKLANMAZ (tesseract bellekte işler). Şifreli defter verisi bu uçtan geçmez.
- Tanıma düzgün el yazısında daha başarılıdır; karalamada sonuç kötü olabilir —
  sonucu kontrol edin notu arayüzde yazılıdır. Görüntü 2 MB, yalnız PNG,
  30 sn zaman aşımı.
- OCR Access kimliği gerektirir (başlıksız 401).

## Sunucu (Klipper linux-ai-server)

- `POST /api/v1/bilge-defter/ocr`; tesseract 5.5 + Türkçe paketi kuruldu.
  Codex-server commit `e7d95ff`; 26 pytest (gerçek tesseract ile blok yazı
  testi dahil).

## Doğrulama

- 27 uygulama paketi, 264 kontrol: önceki tüm paketler + OCR paketi
  (4 kontrol: özel adreste kapalılık, boş mürekkep uyarısı, PNG gönderimi ve
  defter verisi sızdırmama, tanınan metnin düzenlenebilir nesne olarak
  eklenmesi). Sunucu 26 pytest.
- Fixture paketleri geçti. Canlı: private v39 (rozet, ocr kodu).
- Fiziksel kalemde gerçek el yazısı tanıma kalitesi kullanıcıda bekliyor.

## Yayın

Her iki ayrı adreste aynı 220 dosyalık v39 çevrim dışı paket var:

- https://defter.bilgearena.com/
- https://klipper-2.tail1ade8e.ts.net:8443/

Release dizinleri: `/opt/bilge-defter-test/releases/20260921-v39-ocr` ve
`/opt/bilge-defter-invited/releases/20260921-v39-ocr`.

Yeni konteynerler: private `67d36925a1c035bbc3e46e29618fe0d651b1d70c1e96cd25ccbfba3edbb60a71`,
davetli `a8f7d4954a09c3acdad0f0118eb1d8b21972a343260020351cc9dc14c89f3cbe`.
Öncekiler `rollback-before-v39` olarak saklandı. SHA256SUMS özeti:
`7823cd65f7fdf7fb17d2ee9c39722ada413f11b8091676d0ee1a8e87a0f29327`.

Nginx izin listesine ocr-workspace.js eklendi.

## Sonraki dilim

Özgün PDF/vektör saklama (raster yerine), pinch-zoom, kaynaklı AI. Öncelik
kullanıcı kabulüne göre.
