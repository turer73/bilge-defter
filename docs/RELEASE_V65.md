# v65 — güvenilir kayıt ve daha hafif eşitleme

27 Eylül 2026. **v65 web ve hesap servisi yayında.** Yayın kaynak commit'i
`70775341c0a39f458326d8b48b03d6b6d98e8316`; mevcut yayının bu son kayıt commit'inden
farklı olması beklenir. GitHub push/master birleştirmesi yapılmadı.

## Canlı kanıt

- `/opt/bilge-defter-invited/current` → `/opt/bilge-defter-classroom-v65/ui`.
- Web ve API sürümü v65. Yayın sonrası bağımsız HTTP doğrulaması: **238/238 dosya**,
  **235 çevrim dışı dosya**, **14 yetkisiz erişim reddi**, **6 korumalı yol reddi**.
- Paket manifest hash'i: `59fcbef4e3ef6594880192d483d545fabd1f2077484179178c3d3ce335fd3bfd`.
- Payload SHA-256: `746bbe0782d73aac9a1891c1b0c363a86b410b7acd7ca1ad7a7b7c1d72974c92`.
- Yerel 19 regresyon paketi + 26 güvenilirlik kontrolü, 78 API testi geçti.
  Linux imajında ek gerçek sözlük testiyle **79 test** geçti.
- Ayrı nginx preview'unda imzalı yapay hesapla gerçek 200/304, ETag, CAS,
  hesap ayrımı, 401/409 ve 146.532 maddelik sözlükte `kalp` araması geçti.
- Üretim API'sindeki **12 kaynak dosyası** paketle aynı. Yapay kimlik/test
  başlatıcısı üretim imajında yok. DB şeması önceki yedekle aynı.
- Web/API dışındaki konteyner kimlikleri, durum/başlangıç zamanları ve ortak
  Linux-AI servis PID değeri değişmedi. API veri/sır mount'ları ve ortamı aynı.
- İnternetten oturumsuz istek **302** ile giriş kapısına yönleniyor; erişim açılmadı.
- Eski web ve hesap konteynerleri doğrulanmış kimlikleriyle durmuş olarak korunuyor.
  Gerçek trafikle geri dönüş tatbikatı yapılmadı.
- Hesap yedeği bağımsız, erişimi kısıtlı yerel `outputs/v65-private-backup/`
  klasöründe yeniden açılıp tam içerikle karşılaştırıldı; satır çıktısı verilmedi.
  Yedek hash'i `f7b7b43b78acf265f256b77b489dc4f4602e84d59866989a1eb4d29068bde13f`.
- Sunucu kanıtları: `stage-proof.json`, `live-proof.json`, `api-tests.txt`,
  `source-receipt.json`. Özel yedek ve yapılandırma kayıtları `private/` altında.

## Kapsam

[Güvenilirlik paketi](RELIABILITY_PACKAGE_1.md): değişmeyen şifreli yedek için 304,
boşta eşitleme geri çekilmesi, fazla boyutlu yedekte açık uyarı, silmeden başlangıç
kurtarması, cihaz/hesap bazlı araç tercihleri, kayıt/eşitleme menüsü ve isteğe bağlı
içeriksiz yerel performans raporu. Yeni ürün özelliği, veri şeması veya ücretli API yok.

- Ayrı `/opt/bilge-defter-classroom-v65` paketi: yalnız web ve hesap servisi.
- Kütüphane kodu, DNS, Access izinleri, sırlar, DB konumu ve diğer servisler korunur.
- Kaynak Git commit'inden izinli dosyalarla paketlenir. Kaynak alındısı her byte'ı bağlar.
- Mevcut Python/bağımlılık imajları kimlikleriyle kontrol edilip yeniden kullanılır;
  internetsiz build, OS/dependency güncellemesi yok.
- Preview hesaplar, imzalama anahtarı ve DB yapaydır; gerçek secrets mount'u yok.
  `test_release_proxy_v65.py` yalnız verify imajında çalışır, üretim giriş noktası değildir.
- Gerçek sözlük DB'si salt-okunur bağlanır. Proxy testi 146.532 kayıt ve kalp sorgusunu sınar.
- Hesap DB'sinin tutarlı SQLite yedeği yayından önce alınır ve korumalı istemci
  klasöründe bağımsız geri yükleme karşılaştırması yapılmadan kesime izin verilmez.

## Geri alma

Yayın sırasında eski v64 web ve v57 hesap konteynerleri `-rollback-v65` isimleriyle
saklanır. Sonraki başarısızlıkta önce iki kimlik de doğrulanır; eski API ve web geri
açılır, mevcut kullanıcı DB'si korunur. Eski DB yedeği otomatik geri yüklenmez.

```sh
sudo python3 -B /opt/bilge-defter-classroom-v65/deploy-v65.py rollback
```

Bu komut yalnız başarılı hazırlık/kesim sonrası anlamlıdır. Eski v64→v63 onarım
komutu yeni v65 aktifken kullanılmaz. Genel Docker temizliği rollback konteynerlerini
ve imajlarını silmemeli; her yeni yayından önce varlıkları yeniden kontrol edilir.

## Doğrulama ve kabul sınırları

- Tam yerel regresyon: 19 tarayıcı/PWA paketi ve 26 güvenilirlik kontrolü.
- Yerel API testleri: 78; Linux yayın testinde gerçek salt-okunur sözlük eklenir.
- v64 → v65 gerçek yerel service-worker güncellemesi, not korunması ve iki motor testi.
- Ayrı nginx preview boyunca 200/304, ETag/protokol, hesap ayrımı, 401/409 ve sözlük.
- Yayın sonrası dosya hashleri, çevrim dışı paket, erişim reddi ve API sürümü kontrol edilir.
- Fiziksel iPad/Pencil, gerçek e-posta oturumu ve sınıf kabulü bu otomatik testlerle kanıtlanmaz.
- GitHub push/master birleştirmesi bu yayın kapsamına dahil değildir; ücretli veya
  kotası doğrulanmamış GitHub Actions çalıştırılmaz.

## Hazırlık sırasında bulunan hata

İlk Linux koşusunda 79 API testi geçti; ancak doğrudan başlatılan izole proxy
test sunucusu `/srv` Python modül yolunda olmadığı için açılmadı. Sorun yalnız
test başlatıcısındaydı (`ModuleNotFoundError: app`). Test başlatıcısına açık modül
yolu eklendi; üretim uygulaması veya kimlik doğrulaması gevşetilmedi. Bu hata
canlı geçişten önce yakalandı ve v64 çalışmaya devam etti. İlk adayın alındısı ve
build/test kayıtları sunucuda ayrı deneme klasöründe korunur.
