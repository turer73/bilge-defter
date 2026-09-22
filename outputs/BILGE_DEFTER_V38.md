# Bilge Defter v38 — Türkçe/tıbbi sözlük (çevrim dışı)

22 Eylül 2026. Planın 6. maddesinin ilk adımı: çevrim dışı sözlük. El yazısı
tanıma ve AI sonraki dilimlerdedir.

## Kullanım

- Araçlar → Sözlük: ~130 terimlik başlangıç sözlüğü tıp terimlerini kısaca
  açıklar. Arama Türkçe büyük/küçük harfe duyarsızdır; önce terimde, sonra
  tanımda arar ve ön ek eşleşmesini öne alır.
- Bulunamayan terimlerde açık uyarı ve "Web'de ara" düğmesi (Google araması
  yeni sekmede).
- Tamamen çevrim dışı çalışır (sözlük çevrim dışı pakete dahildir).

## Dürüst sınırlar

- Sözlük eğitim amaçlı başlangıç listesidir; tanı veya tedavi önerisi
  DEĞİLDİR — arayüzde açıkça yazılıdır. El yazısı otomatik okunmaz;
  arama elle yazılır.
- Veri yazılım içinde sabittir; kullanıcı ekleme/düzenleme yoktur
  (gelecek dilimlerde kişisel terimler düşünülebilir).

## Doğrulama

- 26 uygulama paketi, 260 kontrol: önceki tüm paketler + sözlük paketi
  (6 kontrol: açılış, ön ek arama, alt dize arama, Türkçe harf duyarsızlığı,
  bulunamama/Web'de ara, çevrim dışı).
- Fixture paketleri geçti. Canlı: private v38 (rozet, dictionary kodu).
- Not: sözlük dosyaları tüm test paketlerinin izin listelerine eklendi;
  eksik script üzerine `null.replaceChildren` hatası kapatıldı.

## Yayın

Her iki ayrı adreste aynı 219 dosyalık v38 çevrim dışı paket var:

- https://defter.bilgearena.com/
- https://klipper-2.tail1ade8e.ts.net:8443/

Release dizinleri: `/opt/bilge-defter-test/releases/20260921-v38-dictionary` ve
`/opt/bilge-defter-invited/releases/20260921-v38-dictionary`.

Yeni konteynerler: private `5e75fe606172d69cbc458dadda32d046df08c29e9d19909afbd79decc32d5abd`,
davetli `37c15fed6b2058112fc5152ce4e02c02f0c78639f2ec0e282268acf6f5c5fa5d`.
Öncekiler `rollback-before-v38` olarak saklandı. SHA256SUMS özeti:
`00d23488b8b494d8aba2f88d4b6abf4433f2f2e4d9b8a231d0cb260a863ae6cd`.

Nginx izin listesine sözlük dosyaları eklendi.

## Sonraki dilim

El yazısı tanıma (ink → metin) ve kaynaklı AI; özgün PDF/vektör saklama;
pinch-zoom.
