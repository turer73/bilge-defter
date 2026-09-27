# v65 — güvenilir kayıt ve daha hafif eşitleme

27 Eylül 2026. Kullanıcı yayına izin verdi. **Bu kaynak commit'inde yayın hazırlık aşamasındadır; canlı sonuç ayrıca eklenecek.**

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
