# Bilge Defter v41 — TDK Güncel Türkçe Sözlük verisine geçiş

22 Eylül 2026. Başlangıç sözlüğü, ciddi ve tutarlı bir kaynakla değiştirildi:
Türk Dil Kurumu'nun Güncel Türkçe Sözlük'ünün (12. baskı) makine okunur
sürümünden seçilen tıp ağırlıklı alt küme.

## Veri

- Kaynak: TDK Güncel Türkçe Sözlük 12. baskı (99.236 madde);
  ogun/guncel-turkce-sozluk deposundaki NDJSON sürümü.
- Seçim: "tıp" etiketli maddeler + tıbbi anahtar kelimelerle eşleşen
  tanımlar → 13.161 benzersiz terim (~1,8 MB). Yönlendirme maddeleri
  (► ile başlayan) gerçek tanım varsa ayıklandı.
- Atıf: sözlük penceresinde "TDK Güncel Türkçe Sözlük (12. baskı)"
  belirtilir; eğitim amaçlıdır, tıbbi karar desteği değildir notu korunur.
- Üretici: `build-dictionary.cjs` (kaynak JSON'dan tekrar üretilebilir;
  filtreler, temizlik, sıralama).

## Kullanım

- Araçlar → Sözlük: 13 bin+ terimde Türkçe harf duyarsız arama
  (ön ek öncelikli, tanımda da arar). Çevrim dışı çalışır.
- Bulunamayan terimlerde Web'de ara düğmesi.

## Doğrulama

- 28 uygulama paketi, 266 kontrol: önceki tüm paketler + sözlük paketi
  gerçek TDK tanımlarına göre güncellendi (astım/ülser/biyopsi aramaları,
  TDK atfı, çevrim dışı).
- Fixture paketleri geçti. Canlı: private v41 (rozet, 1,8 MB sözlük dosyası).

## Yayın

Her iki ayrı adreste aynı 220 dosyalık v41 çevrim dışı paket var
(paket ~4,4 MB):

- https://defter.bilgearena.com/
- https://klipper-2.tail1ade8e.ts.net:8443/

Release dizinleri: `/opt/bilge-defter-test/releases/20260921-v41-tdk-sozluk` ve
`/opt/bilge-defter-invited/releases/20260921-v41-tdk-sozluk`.

Yeni konteynerler: private `46292df0537839316a9dc23921ee35c2267658d89636bddb0911d9ea55d60f7a`,
davetli `76e0ea65852d8c6d3612b9001d93e13344e491cb1a20e82d522d20ecb8660e6d`.
Öncekiler `rollback-before-v41` olarak saklandı. SHA256SUMS özeti:
`523bdaa4ca50b8f5a78f848cdc43b347d13107cf6c51e29537cc7e64b958b8ba`.

## Sonraki dilim

Özgün PDF/vektör saklama ve kaynaklı AI. Ayrıca sözlüğün tamamının (99 bin
madde) isteğe bağlı yüklenmesi düşünülebilir.
