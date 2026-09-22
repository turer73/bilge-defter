# Bilge Defter v40 — PDF pinch-zoom (iki parmakla büyütme)

22 Eylül 2026. PDF yakınlaştırma deneyiminin tamamlanması: düğmelerin yanına
iki parmakla sürekli büyütme/küçültme geldi. Veri biçimi değişmedi.

## Kullanım

- PDF sayfasında iki parmakla açılma/kapanma: %100–%300 arasında sürekli
  zoom, orta nokta sabit kalır. İki parmakla kaydırma aynı anda çalışır.
- Hareket bittiğinde zoom ve konum tek kayıt adımı olarak kaydedilir
  (hareket boyunca sürekli kayıt yazılmaz).
- Düğmelerle %100–%300 adımlı zoom ve "Genişliğe sığdır" korunur.

## Teknik

- Pinch, pointer olayları yerine dokunma olaylarıyla ölçülür: touchmove tüm
  aktif parmakları aynı anda taşır; pointer olayları parmak parmak geldiği
  için iki parmakla kaydırmayı yanlışlıkla pinch sayardı (gerçek hata —
  dokunma tabanlı ölçümle kapatıldı).
- Eşik altı mesafe değişimleri pan olarak kalır; zoom kenetlemesi 1–3,
  viewX/viewY sınırları korunur; geçersiz durum oluşmaz.

## Doğrulama

- 28 uygulama paketi, 266 kontrol: önceki tüm paketler + pinch paketi
  (2 kontrol, gerçek CDP dokunma boru hattıyla: açılma >%140, kapanma %100'e
  dönüş, şema geçerliliği). PDF pan/zincir regresyonları ayrıca doğrulandı.
- Fixture paketleri geçti. Canlı: private v40 (rozet, pinch kodu).
- Fiziksel iPad/Android'de gerçek iki parmak hissi kullanıcıda bekliyor.

## Yayın

Her iki ayrı adreste aynı 220 dosyalık v40 çevrim dışı paket var:

- https://defter.bilgearena.com/
- https://klipper-2.tail1ade8e.ts.net:8443/

Release dizinleri: `/opt/bilge-defter-test/releases/20260921-v40-pinch` ve
`/opt/bilge-defter-invited/releases/20260921-v40-pinch`.

Yeni konteynerler: private `be32c030b8c4d6e2d0e5462887d841bda787ec42a53b9a95fd0c7de9994231f1`,
davetli `6321c3903afbdbcdef804cbf468dc06cd33de6ffed49e42386e04219ac041300`.
Öncekiler `rollback-before-v40` olarak saklandı. SHA256SUMS özeti:
`97da87f275d2024a6fa8f95ee567ca00cc194891274cd9dc5f8fb59513453880`.

## Sonraki dilim

Özgün PDF/vektör saklama (keskin zoom + aranabilir metin) ve kaynaklı AI.
