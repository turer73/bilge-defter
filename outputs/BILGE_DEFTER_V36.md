# Bilge Defter v36 — kâğıt düzeni desenleri, basınçlı kalem ve parola onayı

22 Eylül 2026. Bu dilim üç parçalıdır: sayfa desenleri, basınca duyarlı kalem
ve yedekleme parolası onayı. Veri biçimi değişmedi (v6 / yedek 8); yeni alanlar
isteğe bağlıdır ve eski uygulamalar zararsız okur.

## Özellikler

### Kâğıt düzeni (sayfa bazlı)
- Araçlar → KÂĞIT DÜZENİ: Çizgili / Kareli / Noktalı / Çizgisiz. Yalnız açık
  sayfayı etkiler; çizimler ve notlar korunur. Kareli 32 px çapraz çizgi,
  noktalı radyal nokta, çizgisiz desensiz zemin verir. Koyu zeminlerde kontrast
  otomatik ayarlanır.
- `paperPattern` alanı sayfayla birlikte kaydedilir; yeniden açılış, kopya,
  taşıma ve JSON yedeğinde korunur. Eski sayfalar (alan yok) Çizgili kalır;
  bilinmeyen değerler fail-closed reddedilir.

### Basınca duyarlı kalem
- Kalem çizgisi artık pointer basıncını kullanır: segment genişliği
  `kalınlık × (0.4 + 1.2×basınç)` (alt sınır 0.5 px). Hafif dokunuş ince,
  bastırma kalın iz bırakır; basınçsız cihazlar varsayılan 0.5 ile eski
  davranışı sürdürür. Fosforlu ve silgi sabit genişliktedir.

### Parola onayı
- Sunucuya yedeklemede parola iki kez istenir; eşleşmezse yedek gönderilmez.
  Boş onay alanıyla atlama boşluğu kapatıldı. Yükleme/eşitleme akışı tek
  girişle devam eder.

### Görsel doğrulama hızlandırması
- Görsel base64 ön doğrulaması katı düzenli ifadeden önek denetimine
  gevşetildi; güvenlik PNG başlığı + IHDR boyut denetimiyle korunur ve büyük
  görsellerde doğrulama gecikmesi düşer.

## Doğrulama

- 26 uygulama paketi, 258 kontrol: önceki tüm paketler + desen paketi (7) +
  v36 özellik paketi (6: desenler, basınç ayırt edilebilirliği, parola onayı,
  hızlı görsel doğrulama). Parola onayı sunucu yedeği paketine de eklendi.
- Fixture paketleri geçti. Canlı: private v36 (rozet, desen ve basınç kodu).
- Fiziksel kalemde basınç hissi ve tablet kabulü kullanıcıda bekliyor.

## Yayın

Her iki ayrı adreste aynı 217 dosyalık v36 çevrim dışı paket var:

- https://defter.bilgearena.com/
- https://klipper-2.tail1ade8e.ts.net:8443/

Release dizinleri: `/opt/bilge-defter-test/releases/20260921-v36-paper-patterns`
ve `/opt/bilge-defter-invited/releases/20260921-v36-paper-patterns`.

Yeni konteynerler: private `0d8a69096e5c2cb5a784f11858b61ff942111b46a2bfeb2d85b640bab0a8005d`,
davetli `89f28221a8207770385d2e612bf03d6a65d714a5d2710caf42ea34320e6aea6e`.
Öncekiler `rollback-before-v36` olarak saklandı. SHA256SUMS özeti:
`c194d58bb5ece6d960c8a82693540322848d9261f171bc32dde3a1c9dbe56c35`.

## Sonraki dilim

Push bildirimi, el yazısı tanıma / Türkçe-tıbbi sözlük, AI. Öncelik kullanıcı
kabulüne göre belirlenir.
